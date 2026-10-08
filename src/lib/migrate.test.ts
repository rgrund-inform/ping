import { describe, expect, test } from 'bun:test'
import { migrateStore } from './migrate'

function v1Store() {
  return {
    version: 1,
    players: {
      p1: { id: 'p1', name: 'Alice', createdAt: 1700000000000 },
      p2: { id: 'p2', name: 'Bob', createdAt: 1700000000001 },
    },
    tournaments: [
      {
        id: 'setup',
        name: 'Not started',
        mode: 'round-robin',
        maxScore: 7,
        status: 'setup',
        createdAt: 1700000000100,
        players: ['p1', 'p2'],
        matches: [],
        bracketLocked: false,
      },
      {
        id: 'running',
        name: 'Started',
        mode: 'round-robin',
        maxScore: 7,
        status: 'running',
        createdAt: 1700000000100,
        startedAt: 1700000000200,
        players: ['p1', 'p2'],
        matches: [],
        bracketLocked: false,
      },
      {
        id: 'done',
        name: 'Finished',
        mode: 'round-robin',
        maxScore: 7,
        status: 'completed',
        createdAt: 1700000000100,
        startedAt: 1700000000200,
        completedAt: 1700000000300,
        players: ['p1', 'p2'],
        matches: [],
        bracketLocked: false,
      },
    ],
  }
}

describe('migrateStore', () => {
  test('v1 → v2 derives updatedAt stamps and adds tombstones', () => {
    const raw = v1Store()
    const out = migrateStore(raw) as {
      version: number
      tombstones: unknown
      players: Record<string, { updatedAt: number }>
      tournaments: { id: string; updatedAt: number }[]
    }
    expect(out.version).toBe(2)
    expect(out.tombstones).toEqual({})
    expect(out.players.p1.updatedAt).toBe(1700000000000)
    expect(out.players.p2.updatedAt).toBe(1700000000001)
    const stamp = Object.fromEntries(out.tournaments.map((t) => [t.id, t.updatedAt]))
    expect(stamp).toEqual({ setup: 1700000000100, running: 1700000000200, done: 1700000000300 })
  })

  test('does not mutate its input', () => {
    const raw = v1Store()
    const before = JSON.stringify(raw)
    migrateStore(raw)
    expect(JSON.stringify(raw)).toBe(before)
  })

  test('keeps existing updatedAt values', () => {
    const raw = v1Store()
    ;(raw.players.p1 as Record<string, unknown>).updatedAt = 42
    const out = migrateStore(raw) as { players: Record<string, { updatedAt: number }> }
    expect(out.players.p1.updatedAt).toBe(42)
  })

  test('v2 passes through unchanged', () => {
    const v2 = {
      version: 2,
      players: { p1: { id: 'p1', name: 'Alice', createdAt: 1, updatedAt: 5 } },
      tournaments: [],
      tombstones: { x: { kind: 'player', id: 'x', deletedAt: 9 } },
    }
    expect(migrateStore(v2)).toEqual(v2)
  })

  test('v2 without tombstones gains an empty map', () => {
    const out = migrateStore({ version: 2, players: {}, tournaments: [] })
    expect(out).toEqual({ version: 2, players: {}, tournaments: [], tombstones: {} })
  })

  test('garbage and unknown versions are returned unchanged', () => {
    for (const raw of [null, undefined, 42, 'ping', [1, 2], true]) {
      expect(migrateStore(raw)).toBe(raw)
    }
    const future = { version: 99, players: {} }
    expect(migrateStore(future)).toBe(future)
    const unversioned = { players: {}, tournaments: [] }
    expect(migrateStore(unversioned)).toBe(unversioned)
  })

  test('malformed entries survive without throwing', () => {
    const out = migrateStore({
      version: 1,
      players: { p: 'nope', q: { id: 'q', name: 'Q' } },
      tournaments: [null, { id: 't' }],
    }) as { players: Record<string, unknown>; tournaments: unknown[] }
    expect(out.players.p).toBe('nope')
    expect(out.players.q).toEqual({ id: 'q', name: 'Q' })
    expect(out.tournaments).toEqual([null, { id: 't' }])
  })
})
