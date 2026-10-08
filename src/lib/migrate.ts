import { STORE_VERSION } from '../types'

/**
 * Upgrade a persisted or exported store blob to the current `PingStore` shape.
 *
 * Total: never throws and never mutates its input. Anything it doesn't
 * recognise (non-objects, unknown versions) is returned unchanged so the caller
 * can decide how to reject it.
 *
 * v1 → v2 adds the sync stamps: `player.updatedAt` defaults to `createdAt`,
 * `tournament.updatedAt` to the latest lifecycle stamp it has, and an empty
 * `tombstones` map.
 */
export function migrateStore(raw: unknown): unknown {
  try {
    if (!isObject(raw)) return raw
    if (raw.version !== 1 && raw.version !== STORE_VERSION) return raw

    const out: Record<string, unknown> = { ...raw, version: STORE_VERSION }
    if (isObject(raw.players)) {
      const players: Record<string, unknown> = {}
      for (const [id, p] of Object.entries(raw.players)) players[id] = migratePlayer(p)
      out.players = players
    }
    if (Array.isArray(raw.tournaments)) {
      out.tournaments = raw.tournaments.map(migrateTournament)
    }
    out.tombstones = raw.tombstones ?? {}
    return out
  } catch {
    return raw
  }
}

function migratePlayer(p: unknown): unknown {
  if (!isObject(p) || typeof p.updatedAt === 'number') return p
  if (typeof p.createdAt !== 'number') return p
  return { ...p, updatedAt: p.createdAt }
}

function migrateTournament(t: unknown): unknown {
  if (!isObject(t) || typeof t.updatedAt === 'number') return t
  const stamp = [t.completedAt, t.startedAt, t.createdAt].find((v) => typeof v === 'number')
  if (stamp === undefined) return t
  return { ...t, updatedAt: stamp }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
