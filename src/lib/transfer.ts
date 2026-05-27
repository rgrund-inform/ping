import type { Match, Player, PingStore, Tournament, TournamentMode, TournamentStatus } from '../types'

export interface ExportFile {
  /** Discriminator so we don't accidentally try to import unrelated JSON. */
  app: 'ping'
  exportedAt: number
  store: PingStore
}

export function buildExport(store: PingStore): string {
  const file: ExportFile = {
    app: 'ping',
    exportedAt: Date.now(),
    store: {
      version: store.version,
      players: store.players,
      tournaments: store.tournaments,
    },
  }
  return JSON.stringify(file, null, 2)
}

export type ParseResult =
  | { ok: true; data: PingStore }
  | { ok: false; error: string }

export function parseExport(raw: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  if (!isObject(parsed)) return { ok: false, error: 'File is not a Ping export.' }

  // Accept either the wrapped ExportFile or a bare PingStore for forgiveness.
  const candidate = parsed.app === 'ping' && isObject(parsed.store) ? parsed.store : parsed
  if (!isObject(candidate)) return { ok: false, error: 'File is not a Ping export.' }

  if (candidate.version !== 1) {
    return { ok: false, error: `Unsupported export version (${String(candidate.version)}).` }
  }
  if (!isObject(candidate.players)) return { ok: false, error: 'Missing players map.' }
  if (!Array.isArray(candidate.tournaments)) return { ok: false, error: 'Missing tournaments list.' }

  const players: Record<string, Player> = {}
  for (const [id, p] of Object.entries(candidate.players)) {
    if (!isPlayer(p) || p.id !== id) return { ok: false, error: `Invalid player entry: ${id}.` }
    players[id] = { id: p.id, name: p.name, createdAt: p.createdAt }
  }

  const tournaments: Tournament[] = []
  for (const t of candidate.tournaments) {
    const result = validateTournament(t)
    if (!result.ok) return { ok: false, error: result.error }
    tournaments.push(result.value)
  }

  return { ok: true, data: { version: 1, players, tournaments } }
}

function validateTournament(t: unknown): { ok: true; value: Tournament } | { ok: false; error: string } {
  if (!isObject(t)) return { ok: false, error: 'Tournament entry is not an object.' }
  if (typeof t.id !== 'string') return { ok: false, error: 'Tournament missing id.' }
  if (typeof t.name !== 'string') return { ok: false, error: `Tournament ${t.id} missing name.` }
  if (!isMode(t.mode)) return { ok: false, error: `Tournament ${t.id} has invalid mode.` }
  if (typeof t.maxScore !== 'number') return { ok: false, error: `Tournament ${t.id} missing maxScore.` }
  if (!isStatus(t.status)) return { ok: false, error: `Tournament ${t.id} has invalid status.` }
  if (typeof t.createdAt !== 'number') return { ok: false, error: `Tournament ${t.id} missing createdAt.` }
  if (!Array.isArray(t.players) || !t.players.every((p) => typeof p === 'string')) {
    return { ok: false, error: `Tournament ${t.id} has invalid players list.` }
  }
  if (!Array.isArray(t.matches)) return { ok: false, error: `Tournament ${t.id} has invalid matches.` }
  if (typeof t.bracketLocked !== 'boolean') return { ok: false, error: `Tournament ${t.id} missing bracketLocked.` }

  const matches: Match[] = []
  for (const m of t.matches) {
    if (!isMatch(m)) return { ok: false, error: `Tournament ${t.id} has an invalid match.` }
    matches.push(m)
  }

  const value: Tournament = {
    id: t.id,
    name: t.name,
    mode: t.mode,
    maxScore: t.maxScore,
    seeding: t.seeding === 'random' || t.seeding === 'win-rate' ? t.seeding : undefined,
    status: t.status,
    createdAt: t.createdAt,
    startedAt: typeof t.startedAt === 'number' ? t.startedAt : undefined,
    completedAt: typeof t.completedAt === 'number' ? t.completedAt : undefined,
    players: [...t.players],
    matches,
    bracketLocked: t.bracketLocked,
  }
  return { ok: true, value }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isPlayer(v: unknown): v is Player {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.createdAt === 'number'
  )
}

function isMode(v: unknown): v is TournamentMode {
  return v === 'round-robin' || v === 'knockout'
}

function isStatus(v: unknown): v is TournamentStatus {
  return v === 'setup' || v === 'running' || v === 'completed'
}

function isMatch(v: unknown): v is Match {
  if (!isObject(v)) return false
  if (typeof v.id !== 'string') return false
  if (typeof v.round !== 'number') return false
  if (v.slot !== undefined && typeof v.slot !== 'number') return false
  if (v.a !== null && typeof v.a !== 'string') return false
  if (v.b !== null && typeof v.b !== 'string') return false
  if (v.winnerSide !== null && v.winnerSide !== 'a' && v.winnerSide !== 'b') return false
  if (v.loserScore !== null && typeof v.loserScore !== 'number') return false
  if (v.playedAt !== undefined && typeof v.playedAt !== 'number') return false
  if (v.bye !== undefined && typeof v.bye !== 'boolean') return false
  return true
}

/** Suggested filename for an export, includes today's date. */
export function exportFilename(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `ping-export-${y}-${m}-${d}.json`
}
