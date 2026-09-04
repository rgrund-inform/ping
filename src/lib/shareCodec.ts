import type { Match, Player, PlayerId, Tournament } from '../types'
import { uid } from './id'
import { validateTournament } from './transfer'

export const SHARE_VERSION = 2

/**
 * Compact wire format for a tournament share link. Field names are terse and
 * players are referenced by roster index because the whole payload has to fit
 * in a URL (and ideally a QR code).
 *
 * Match tuple layout (v1):
 * `[round, slot|-1, aIdx|-1, bIdx|-1, winner(0=a,1=b,-1=null), loserScore|-1, playedAt|0, bye(0|1)]`
 * `-1` is the "absent" sentinel because `loserScore: 0` is a legitimate value.
 * `playedAt` is absolute epoch milliseconds, `0` when unplayed.
 *
 * v2 differs only in the `playedAt` element: it is the delta in whole seconds
 * from the previous *played* match in array order (the first one is relative
 * to `c`), or `null` when unplayed. Deltas may be zero or negative because
 * matches are stored in schedule order, not play order, so `null` is the only
 * safe sentinel. Absolute 13-digit timestamps are unique per match and barely
 * compress; small deltas cut the final payload by roughly a quarter.
 * Only v2 is written; v1 links stay decodable.
 */
interface SharePayloadV1 {
  v: 1
  /** Tournament name. */
  n: string
  /** Mode: 0 round-robin, 1 knockout. */
  m: 0 | 1
  /** maxScore. */
  x: number
  /** Seeding: 0 random, 1 win-rate; omitted when undefined. */
  g?: 0 | 1
  /** Status: 0 setup, 1 running, 2 completed. */
  s: 0 | 1 | 2
  /** createdAt. */
  c: number
  /** startedAt; omitted when undefined. */
  st?: number
  /** completedAt; omitted when undefined. */
  co?: number
  /** bracketLocked. */
  l: 0 | 1
  /** Player names in roster order. */
  p: string[]
  /** Match tuples, see layout above. */
  ma: number[][]
}

type SharePayloadV2 = Omit<SharePayloadV1, 'v' | 'ma'> & {
  v: 2
  ma: (number | null)[][]
}

type SharePayload = SharePayloadV1 | SharePayloadV2

export type ShareDecodeResult =
  | { ok: true; data: { tournament: Tournament; players: Record<PlayerId, Player> } }
  | { ok: false; error: string }

/** Encode one tournament (plus its players) into a base64url share payload. */
export async function encodeTournamentShare(
  tournament: Tournament,
  allPlayers: Record<PlayerId, Player>,
): Promise<string> {
  const indexOf = new Map<PlayerId, number>()
  tournament.players.forEach((pid, i) => indexOf.set(pid, i))

  // playedAt as second-resolution deltas between consecutive played matches.
  let prevSec = msToSec(tournament.createdAt)
  const playedAtDelta = (m: Match): number | null => {
    if (m.playedAt === undefined) return null
    const sec = msToSec(m.playedAt)
    const delta = sec - prevSec
    prevSec = sec
    return delta
  }

  const payload: SharePayloadV2 = {
    v: SHARE_VERSION,
    n: tournament.name,
    m: tournament.mode === 'knockout' ? 1 : 0,
    x: tournament.maxScore,
    s: tournament.status === 'setup' ? 0 : tournament.status === 'running' ? 1 : 2,
    c: tournament.createdAt,
    l: tournament.bracketLocked ? 1 : 0,
    p: tournament.players.map((pid) => allPlayers[pid]?.name ?? '?'),
    ma: tournament.matches.map((m) => [
      m.round,
      m.slot ?? -1,
      m.a === null ? -1 : indexOf.get(m.a) ?? -1,
      m.b === null ? -1 : indexOf.get(m.b) ?? -1,
      m.winnerSide === null ? -1 : m.winnerSide === 'a' ? 0 : 1,
      m.loserScore ?? -1,
      playedAtDelta(m),
      m.bye ? 1 : 0,
    ]),
  }
  if (tournament.seeding !== undefined) payload.g = tournament.seeding === 'win-rate' ? 1 : 0
  if (tournament.startedAt !== undefined) payload.st = tournament.startedAt
  if (tournament.completedAt !== undefined) payload.co = tournament.completedAt

  // encode() is typed Uint8Array<ArrayBufferLike>, but TextEncoder never
  // hands out SharedArrayBuffer-backed views — narrow for the Response ctor.
  const bytes = new TextEncoder().encode(JSON.stringify(payload)) as Uint8Array<ArrayBuffer>
  return toBase64Url(await deflate(bytes))
}

/** Decode a share payload back into a tournament + players bundle. Never throws. */
export async function decodeTournamentShare(payload: string): Promise<ShareDecodeResult> {
  let json: string
  try {
    json = new TextDecoder().decode(await inflate(fromBase64Url(payload)))
  } catch {
    return { ok: false, error: 'This share link is damaged or incomplete.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'This share link is damaged or incomplete.' }
  }
  if (!isObject(parsed)) return { ok: false, error: 'This share link is damaged or incomplete.' }
  if (parsed.v !== 1 && parsed.v !== 2) {
    return { ok: false, error: 'Unsupported share link version.' }
  }
  if (!isSharePayload(parsed)) {
    return { ok: false, error: 'This share link is damaged or incomplete.' }
  }

  // Rebuild players with fresh local ids p0…pN, in roster order.
  const players: Record<PlayerId, Player> = {}
  const roster: PlayerId[] = parsed.p.map((name, i) => {
    const id = `p${i}`
    players[id] = { id, name, createdAt: parsed.c }
    return id
  })
  const byIndex = (idx: number): PlayerId | null => (idx === -1 ? null : `p${idx}`)

  // v1: absolute ms (0 = unplayed). v2: delta seconds from previous played match (null = unplayed).
  let prevSec = msToSec(parsed.c)
  const playedAtOf = (raw: number | null): number | undefined => {
    if (parsed.v === 1) return raw === 0 ? undefined : (raw as number)
    if (raw === null) return undefined
    prevSec += raw
    return prevSec * 1000
  }

  const matches: Match[] = parsed.ma.map((tuple) => {
    const [round, slot, aIdx, bIdx, winner, loserScore, playedAtRaw, bye] = tuple as [
      number, number, number, number, number, number, number | null, number,
    ]
    const m: Match = {
      id: uid(),
      round,
      a: byIndex(aIdx),
      b: byIndex(bIdx),
      winnerSide: winner === -1 ? null : winner === 0 ? 'a' : 'b',
      loserScore: loserScore === -1 ? null : loserScore,
    }
    if (slot !== -1) m.slot = slot
    const playedAt = playedAtOf(playedAtRaw)
    if (playedAt !== undefined) m.playedAt = playedAt
    if (bye === 1) m.bye = true
    return m
  })

  const tournament: Tournament = {
    id: uid(),
    name: parsed.n,
    mode: parsed.m === 1 ? 'knockout' : 'round-robin',
    maxScore: parsed.x,
    seeding: parsed.g === undefined ? undefined : parsed.g === 1 ? 'win-rate' : 'random',
    status: parsed.s === 0 ? 'setup' : parsed.s === 1 ? 'running' : 'completed',
    createdAt: parsed.c,
    startedAt: parsed.st,
    completedAt: parsed.co,
    players: roster,
    matches,
    bracketLocked: parsed.l === 1,
  }

  // Final semantic check shared with the file-import path.
  const result = validateTournament(tournament, new Set(roster))
  if (!result.ok) return { ok: false, error: result.error }

  return { ok: true, data: { tournament: result.value, players } }
}

// ---- payload shape ----

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isSharePayload(v: Record<string, unknown>): v is SharePayload & Record<string, unknown> {
  if (v.v !== 1 && v.v !== 2) return false
  // Index 6 (playedAt) may be null in v2 only; everything else must be a number.
  const isTupleCell = (n: unknown, i: number) =>
    typeof n === 'number' || (v.v === 2 && i === 6 && n === null)
  if (typeof v.n !== 'string') return false
  if (v.m !== 0 && v.m !== 1) return false
  if (typeof v.x !== 'number') return false
  if (v.g !== undefined && v.g !== 0 && v.g !== 1) return false
  if (v.s !== 0 && v.s !== 1 && v.s !== 2) return false
  if (typeof v.c !== 'number') return false
  if (v.st !== undefined && typeof v.st !== 'number') return false
  if (v.co !== undefined && typeof v.co !== 'number') return false
  if (v.l !== 0 && v.l !== 1) return false
  if (!Array.isArray(v.p) || !v.p.every((p) => typeof p === 'string')) return false
  if (
    !Array.isArray(v.ma) ||
    !v.ma.every(
      (t) => Array.isArray(t) && t.length === 8 && t.every(isTupleCell),
    )
  ) {
    return false
  }
  return true
}

function msToSec(ms: number): number {
  return Math.round(ms / 1000)
}

// ---- bytes <-> base64url ----

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  // Not Uint8Array.toBase64 — too new for older mobile browsers.
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(payload: string): Uint8Array<ArrayBuffer> {
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ---- deflate-raw compression ----

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const compressed = new Response(bytes).body!.pipeThrough(
    new CompressionStream('deflate-raw'),
  )
  return new Uint8Array(await new Response(compressed).arrayBuffer())
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const decompressed = new Response(bytes).body!.pipeThrough(
    new DecompressionStream('deflate-raw'),
  )
  return new Uint8Array(await new Response(decompressed).arrayBuffer())
}
