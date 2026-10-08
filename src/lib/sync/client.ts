/**
 * HTTP client for the Cloudflare sync Worker. Sync is compiled in only when
 * `VITE_SYNC_URL` is set at build time; otherwise `SYNC_ENABLED` is false and
 * the UI hides every sync control.
 */
import {
  ROUTES,
  type CreateSpaceResponse,
  type SyncRequest,
  type SyncResponse,
} from './protocol'

export const SYNC_URL = (import.meta.env.VITE_SYNC_URL ?? '').trim().replace(/\/+$/, '')
export const SYNC_ENABLED = SYNC_URL.length > 0

export type SyncErrorKind = 'unauthorized' | 'not-found' | 'network' | 'server' | 'bad-request'

export class SyncError extends Error {
  readonly kind: SyncErrorKind
  readonly status?: number

  constructor(kind: SyncErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'SyncError'
    this.kind = kind
    this.status = status
  }
}

function kindForStatus(status: number): SyncErrorKind {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 404 || status === 410) return 'not-found'
  if (status >= 400 && status < 500) return 'bad-request'
  return 'server'
}

/** Best-effort error text from the Worker (`{ error }` JSON or plain text). */
async function errorDetail(res: Response): Promise<string> {
  try {
    const text = await res.text()
    try {
      const body = JSON.parse(text) as { error?: unknown }
      if (typeof body.error === 'string') return body.error
    } catch {
      // not JSON
    }
    return text.slice(0, 200) || res.statusText
  } catch {
    return res.statusText
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  if (!SYNC_ENABLED) throw new SyncError('network', 'Sync is not configured')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new SyncError('network', 'Offline')
  }
  let res: Response
  try {
    res = await fetch(`${SYNC_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (err) {
    // fetch only rejects on network failure (DNS, CORS, connection reset, …).
    throw new SyncError('network', err instanceof Error ? err.message : String(err))
  }
  if (!res.ok) {
    throw new SyncError(kindForStatus(res.status), await errorDetail(res), res.status)
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new SyncError('server', 'Invalid response from sync server', res.status)
  }
}

export function createSpace(): Promise<CreateSpaceResponse> {
  return request<CreateSpaceResponse>(ROUTES.createSpace, { method: 'POST', body: '{}' })
}

export function syncSpace(
  space: { id: string; token: string },
  req: SyncRequest,
): Promise<SyncResponse> {
  return request<SyncResponse>(ROUTES.sync(space.id), {
    method: 'POST',
    headers: { Authorization: `Bearer ${space.token}` },
    body: JSON.stringify(req),
  })
}
