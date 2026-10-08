import {
  SPACE_ID_PATTERN,
  TOKEN_PATTERN,
  type CreateSpaceResponse,
  type SyncRequest,
  type SyncRow,
} from '../../src/lib/sync/protocol'
import { newSpaceId, newToken, sha256Hex } from './auth'
import { SyncSpace } from './space'

export { SyncSpace }

const MAX_BODY_BYTES = 5 * 1024 * 1024
const MAX_CHANGES = 10_000
const MAX_ID_LENGTH = 128
const SYNC_PATH = /^\/spaces\/([^/]+)\/sync$/

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    const cors = corsHeaders(request, env)
    try {
      const response = await route(request, env, url, cors)
      return withHeaders(response, cors)
    } catch (err) {
      if (err instanceof HttpError) {
        return withHeaders(Response.json({ error: err.message }, { status: err.status }), cors)
      }
      console.error(
        JSON.stringify({
          message: 'unhandled error',
          path: url.pathname,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      return withHeaders(Response.json({ error: 'internal error' }, { status: 500 }), cors)
    }
  },
} satisfies ExportedHandler<Env>

async function route(request: Request, env: Env, url: URL, cors: Headers | null): Promise<Response> {
  const { pathname } = url
  const method = request.method

  if (method === 'OPTIONS') {
    // Preflight: only answered positively for allowed origins.
    return new Response(null, { status: cors ? 204 : 403 })
  }

  if (pathname === '/health') {
    if (method !== 'GET') throw new HttpError(405, 'method not allowed')
    return Response.json({ ok: true })
  }

  if (pathname === '/spaces') {
    if (method !== 'POST') throw new HttpError(405, 'method not allowed')
    return createSpace(env)
  }

  const match = SYNC_PATH.exec(pathname)
  if (match) {
    if (method !== 'POST') throw new HttpError(405, 'method not allowed')
    return syncSpace(request, env, match[1])
  }

  throw new HttpError(404, 'not found')
}

async function createSpace(env: Env): Promise<Response> {
  const spaceId = newSpaceId()
  const token = newToken()
  const result = await env.SYNC_SPACE.getByName(spaceId).init(await sha256Hex(token))
  // A fresh 128-bit id colliding with an existing space is practically impossible.
  if ('error' in result) throw new Error(`init failed: ${result.error}`)
  const body: CreateSpaceResponse = { spaceId, token }
  return Response.json(body, { status: 201 })
}

async function syncSpace(request: Request, env: Env, spaceId: string): Promise<Response> {
  if (!SPACE_ID_PATTERN.test(spaceId)) throw new HttpError(404, 'unknown space')
  const auth = request.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!TOKEN_PATTERN.test(token)) throw new HttpError(401, 'unauthorized')

  const req = parseSyncRequest(await readJson(request))
  const result = await env.SYNC_SPACE.getByName(spaceId).sync(await sha256Hex(token), req)
  if ('error' in result) {
    switch (result.error) {
      case 'unauthorized':
        throw new HttpError(401, 'unauthorized')
      case 'uninitialized':
        throw new HttpError(404, 'unknown space')
      case 'invalid-row':
        throw new HttpError(400, 'invalid row')
    }
  }
  return Response.json(result)
}

/** Reads at most MAX_BODY_BYTES and parses JSON. */
async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('Content-Length') ?? 0)
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'body too large')
  if (!request.body) throw new HttpError(400, 'missing body')

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new HttpError(413, 'body too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new HttpError(400, 'invalid JSON')
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Shape check only; the merge functions own the semantics of a body. */
function parseSyncRequest(raw: unknown): SyncRequest {
  if (!isObject(raw)) throw new HttpError(400, 'body must be an object')
  const { cursor, changes } = raw
  if (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0) {
    throw new HttpError(400, 'cursor must be a non-negative integer')
  }
  if (!Array.isArray(changes)) throw new HttpError(400, 'changes must be an array')
  if (changes.length > MAX_CHANGES) throw new HttpError(400, 'too many changes')
  return { cursor, changes: changes.map(parseRow) }
}

function parseRow(raw: unknown, index: number): SyncRow {
  const bad = (why: string) => new HttpError(400, `changes[${index}]: ${why}`)
  if (!isObject(raw)) throw bad('not an object')
  const { kind, id, body, deletedAt } = raw
  if (kind !== 'player' && kind !== 'tournament') throw bad('kind must be player or tournament')
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH) throw bad('invalid id')
  if (body === null) {
    if (typeof deletedAt !== 'number' || !Number.isFinite(deletedAt)) throw bad('tombstone needs deletedAt')
    return { kind, id, body: null, deletedAt }
  }
  if (!isObject(body)) throw bad('body must be an object or null')
  if (body.id !== id) throw bad('body.id must equal id')
  if (typeof body.updatedAt !== 'number') throw bad('body.updatedAt must be a number')
  if (kind === 'tournament' && !Array.isArray(body.matches)) throw bad('tournament needs matches')
  // Shape-checked above; the remaining fields are the client's responsibility.
  const row: Record<string, unknown> = { kind, id, body }
  return row as SyncRow
}

function corsHeaders(request: Request, env: Env): Headers | null {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  if (!allowed.includes(origin)) return null
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  })
}

function withHeaders(response: Response, cors: Headers | null): Response {
  const headers = new Headers(response.headers)
  headers.append('Vary', 'Origin')
  cors?.forEach((value, key) => headers.set(key, value))
  return new Response(response.body, { status: response.status, headers })
}
