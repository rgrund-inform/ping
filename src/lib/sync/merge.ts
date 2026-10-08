/**
 * Pure merge model for sync. Shared by the PWA (applying pulled rows) and the
 * Cloudflare Durable Object (merging pushed rows). Every function here must be
 * deterministic, commutative and idempotent: merge(a, b) ≡ merge(b, a) and
 * merge(merge(a, b), b) ≡ merge(a, b). No Date.now(), no randomness.
 */
import type { Match, PingStore, Player, PlayerId, Tombstone, Tournament } from '../../types'
import { promoteWinner } from '../bracket'
import { isComplete } from '../scoring'
import type { SyncRow } from './protocol'

/** JSON with sorted object keys, for equality checks and deterministic tie-breaks. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    // Mirrors JSON.stringify: undefined/functions at the top level have no JSON form.
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (isSkipped(v) ? 'null' : stableStringify(v))).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const parts: string[] = []
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key]
    if (isSkipped(v)) continue
    parts.push(`${JSON.stringify(key)}:${stableStringify(v)}`)
  }
  return `{${parts.join(',')}}`
}

function isSkipped(v: unknown): boolean {
  return v === undefined || typeof v === 'function' || typeof v === 'symbol'
}

/** Deterministic, symmetric choice between two values: the smaller stable JSON. */
function smaller<T>(a: T, b: T): T {
  return stableStringify(a) <= stableStringify(b) ? a : b
}

/** Newer `updatedAt` wins; tie → smaller stableStringify body. */
export function mergePlayer(a: Player, b: Player): Player {
  const winner = a.updatedAt !== b.updatedAt ? (a.updatedAt > b.updatedAt ? a : b) : smaller(a, b)
  return { ...winner }
}

const isPlayed = (m: Match): boolean => m.winnerSide !== null

/** Played beats unplayed; both played → later `playedAt`; tie → smaller body. */
export function mergeMatch(x: Match, y: Match): Match {
  let winner: Match
  if (isPlayed(x) !== isPlayed(y)) {
    winner = isPlayed(x) ? x : y
  } else {
    const tx = x.playedAt ?? 0
    const ty = y.playedAt ?? 0
    winner = tx !== ty ? (tx > ty ? x : y) : smaller(x, y)
  }
  return { ...winner }
}

function pairKey(a: PlayerId | null, b: PlayerId | null): string {
  const x = a ?? ''
  const y = b ?? ''
  return x < y ? `${x}|${y}` : `${y}|${x}`
}

/** Owner's match universe plus the other side's played results (see plan). */
export function mergeMatches(owner: Tournament, other: Tournament): Match[] {
  const matches = owner.matches.map((m) => ({ ...m }))
  const knockout = owner.mode === 'knockout'

  for (const m of other.matches) {
    if (!isPlayed(m) || m.bye) continue
    let idx = matches.findIndex((x) => x.id === m.id)
    if (idx === -1) {
      const key = pairKey(m.a, m.b)
      idx = matches.findIndex(
        (x) =>
          pairKey(x.a, x.b) === key &&
          (!knockout || (x.round === m.round && x.slot === m.slot)),
      )
    }
    if (idx === -1) {
      // Round-robin keeps every played result (like regenerateRoundRobin);
      // a knockout result with no slot in the owner's bracket cannot be placed.
      if (!knockout) matches.push({ ...m })
      continue
    }
    const found = matches[idx]
    // Found + unplayed → take the incoming match whole (id included) so both
    // devices converge on the same match id.
    matches[idx] = isPlayed(found) ? mergeMatch(found, m) : { ...m }
  }
  return matches
}

/** The side whose `updatedAt` is newer; tie → the smaller `key(side)`, then smaller body. */
function newer<T extends { updatedAt: number }>(a: T, b: T, key: (x: T) => unknown): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b
  const ka = stableStringify(key(a))
  const kb = stableStringify(key(b))
  if (ka !== kb) return ka < kb ? a : b
  return smaller(a, b)
}

/** Which side's schedule (roster, start, match universe) survives the merge. */
function scheduleOwner(a: Tournament, b: Tournament): Tournament {
  const aStarted = a.status !== 'setup'
  const bStarted = b.status !== 'setup'
  if (aStarted !== bStarted) return aStarted ? a : b
  return newer(a, b, (t) => ({
    players: t.players,
    bracketLocked: t.bracketLocked,
    startedAt: t.startedAt,
  }))
}

/** Field selection without normalisation. */
function mergeRaw(a: Tournament, b: Tournament): Tournament {
  const owner = scheduleOwner(a, b)
  const other = owner === a ? b : a
  // Ties are broken on the metadata itself so re-merging with either input
  // picks the same values again (idempotence).
  const meta = newer(a, b, (t) => ({
    name: t.name,
    maxScore: t.maxScore,
    scoring: t.scoring,
    seeding: t.seeding,
  }))
  const out: Tournament = {
    ...owner,
    name: meta.name,
    maxScore: meta.maxScore,
    scoring: meta.scoring,
    seeding: meta.seeding,
    createdAt: Math.min(a.createdAt, b.createdAt),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    players: [...owner.players],
    matches: mergeMatches(owner, other),
  }
  return out
}

/** Full tournament merge: owner/newer field selection, mergeMatches, then normalizeTournament. */
export function mergeTournament(a: Tournament, b: Tournament): Tournament {
  return normalizeTournament(mergeRaw(a, b))
}

/**
 * Recompute derived state after a merge: knockout promotions (rounds > 1
 * rebuilt via promoteWinner), round-robin renumbering of unplayed rounds,
 * `status` and `completedAt` from the results. Idempotent.
 */
export function normalizeTournament(t: Tournament): Tournament {
  const out: Tournament = {
    ...t,
    players: [...t.players],
    matches: t.matches.map((m) => ({ ...m })),
  }
  if (out.matches.length === 0) return out

  out.matches =
    out.mode === 'knockout' ? normalizeKnockout(out.matches) : normalizeRoundRobin(out.matches)

  const complete = isComplete(out)
  out.status = complete ? 'completed' : 'running'
  const lastPlayed = out.matches
    .filter((m) => isPlayed(m) && !m.bye && m.playedAt !== undefined)
    .reduce<number | undefined>((max, m) => Math.max(max ?? -Infinity, m.playedAt!), undefined)
  if (complete && lastPlayed !== undefined) out.completedAt = lastPlayed
  else delete out.completedAt
  return out
}

function clearResult(m: Match): void {
  m.winnerSide = null
  m.loserScore = null
  delete m.playedAt
  delete m.bye
}

/** `matches` are fresh copies owned by the caller; mutated in place. */
function normalizeKnockout(matches: Match[]): Match[] {
  const orig = new Map(matches.map((m) => [m.id, { a: m.a, b: m.b }]))

  // Rounds > 1 are derived from earlier results: wipe the slots (and any
  // auto-advanced chain byes) and rebuild them by replaying promotions.
  for (const m of matches) {
    if (m.round <= 1) continue
    m.a = null
    m.b = null
    if (m.bye) clearResult(m)
  }

  const ordered = [...matches].sort((x, y) => x.round - y.round || (x.slot ?? 0) - (y.slot ?? 0))
  for (const m of ordered) {
    if (m.round > 1 && isPlayed(m) && !m.bye) {
      const was = orig.get(m.id)!
      // The result was recorded between other players than the ones the
      // bracket now delivers here (an upstream result changed): drop it.
      if (m.a === null || m.b === null || m.a !== was.a || m.b !== was.b) clearResult(m)
    }
    if (isPlayed(m)) promoteWinner(matches, m)
  }

  // promoteWinner stamps chain byes with Date.now(); pin them to their feeders
  // instead so the result is deterministic.
  for (const m of ordered) {
    if (m.round <= 1 || !m.bye) continue
    const feeders = matches.filter(
      (x) => x.round === m.round - 1 && Math.floor((x.slot ?? 0) / 2) === (m.slot ?? 0),
    )
    const stamp = feeders.reduce((max, x) => Math.max(max, x.playedAt ?? 0), 0)
    m.playedAt = stamp
  }
  return matches
}

function normalizeRoundRobin(matches: Match[]): Match[] {
  const played = matches.filter(isPlayed)
  const upcoming = matches.filter((m) => !isPlayed(m))
  const startRound = played.reduce((max, m) => Math.max(max, m.round), 0)
  // Stable sort keeps the stored order within a round; then dense-rank the
  // distinct round numbers so grouped rounds stay grouped.
  const sorted = [...upcoming].sort((x, y) => x.round - y.round)
  const distinct = [...new Set(sorted.map((m) => m.round))]
  const rank = new Map(distinct.map((r, i) => [r, startRound + i + 1]))
  return [...played, ...sorted.map((m) => ({ ...m, round: rank.get(m.round)! }))]
}

const isTombstoneRow = (r: SyncRow): r is Extract<SyncRow, { body: null }> => r.body === null

/**
 * Server-side row merge. Tombstones always win (no resurrection). Returns the
 * row to store; callers compare with stableStringify to detect a change.
 */
export function mergeRow(existing: SyncRow | undefined, incoming: SyncRow): SyncRow {
  if (existing === undefined) {
    if (incoming.kind === 'tournament' && incoming.body !== null) {
      return { kind: 'tournament', id: incoming.id, body: normalizeTournament(incoming.body) }
    }
    return incoming
  }
  if (isTombstoneRow(existing)) return existing
  if (isTombstoneRow(incoming)) return incoming
  if (existing.kind === 'player' && incoming.kind === 'player') {
    return { kind: 'player', id: existing.id, body: mergePlayer(existing.body, incoming.body) }
  }
  if (existing.kind === 'tournament' && incoming.kind === 'tournament') {
    return {
      kind: 'tournament',
      id: existing.id,
      body: mergeTournament(existing.body, incoming.body),
    }
  }
  // Kind mismatch on the same id cannot happen with UUIDs; first writer wins.
  return existing
}

/**
 * Client-side: apply pulled rows to a store snapshot. Players are applied
 * before tournaments. Returns a new store; does not mutate `store`.
 */
export function applyRows(store: PingStore, rows: SyncRow[]): PingStore {
  const players: Record<string, Player> = { ...store.players }
  const tournaments: Tournament[] = [...store.tournaments]
  const tombstones: Record<string, Tombstone> = { ...store.tombstones }

  const ordered = [
    ...rows.filter((r) => r.kind === 'player'),
    ...rows.filter((r) => r.kind !== 'player'),
  ]
  for (const row of ordered) {
    if (isTombstoneRow(row)) {
      tombstones[row.id] ??= { kind: row.kind, id: row.id, deletedAt: row.deletedAt }
      if (row.kind === 'player') delete players[row.id]
      else {
        const idx = tournaments.findIndex((t) => t.id === row.id)
        if (idx !== -1) tournaments.splice(idx, 1)
      }
      continue
    }
    if (tombstones[row.id]) continue

    if (row.kind === 'player') {
      const existing = players[row.id]
      const next = existing ? mergePlayer(existing, row.body) : { ...row.body }
      // Keep the existing object when nothing changed (less reactive churn).
      if (!existing || stableStringify(next) !== stableStringify(existing)) players[row.id] = next
    } else {
      const idx = tournaments.findIndex((t) => t.id === row.id)
      if (idx === -1) {
        tournaments.push(normalizeTournament(row.body))
      } else {
        const existing = tournaments[idx]
        const next = mergeTournament(existing, row.body)
        if (stableStringify(next) !== stableStringify(existing)) tournaments[idx] = next
      }
    }
  }
  return { version: store.version, players, tournaments, tombstones }
}

/** Build the rows for the given dirty ids from a store snapshot (tombstones included). */
export function rowsFor(
  store: PingStore,
  dirty: Record<string, 'player' | 'tournament'>,
): SyncRow[] {
  const rows: SyncRow[] = []
  for (const id of Object.keys(dirty)) {
    const tomb = store.tombstones[id]
    if (tomb) {
      rows.push({ kind: tomb.kind, id, body: null, deletedAt: tomb.deletedAt })
      continue
    }
    const player = store.players[id]
    if (player) {
      rows.push({ kind: 'player', id, body: plain(player) })
      continue
    }
    const tournament = store.tournaments.find((t) => t.id === id)
    if (tournament) rows.push({ kind: 'tournament', id, body: plain(tournament) })
  }
  return rows
}

/** Detached plain copy (strips reactive proxies; drops undefined like the wire does). */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
