import { describe, expect, test } from 'bun:test'
import type { Match, Player, Tournament } from '../types'
import { SHARE_VERSION, decodeTournamentShare, encodeTournamentShare } from './shareCodec'

const NAMES = ['Alice Müller', 'Bob', 'Carol-Ann', 'Dave', 'Erin', 'Frank', 'Grace', 'Heidi']

/** Full 8-player round-robin (28 matches), the first ten already played. */
function fullRoundRobin(): {
  tournament: Tournament
  players: Record<string, Player>
  ids: string[]
} {
  const players: Record<string, Player> = {}
  const ids = NAMES.map((name, i) => {
    const id = `orig-${i}`
    players[id] = { id, name, createdAt: 1700000000000 + i }
    return id
  })
  const matches: Match[] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const idx = matches.length
      const played = idx < 10
      matches.push({
        id: `m-${idx}`,
        round: Math.floor(idx / 4) + 1,
        a: ids[i],
        b: ids[j],
        winnerSide: played ? (idx % 2 === 0 ? 'a' : 'b') : null,
        // One legitimate 0 loserScore in the mix.
        loserScore: played ? (idx === 3 ? 0 : (idx % 7) + 1) : null,
        ...(played ? { playedAt: 1700000100000 + idx * 60_000 } : {}),
      })
    }
  }
  const tournament: Tournament = {
    id: 'orig-t',
    name: 'Friday Night Open',
    mode: 'round-robin',
    maxScore: 11,
    status: 'running',
    createdAt: 1700000000000,
    startedAt: 1700000050000,
    players: ids,
    matches,
    bracketLocked: false,
  }
  return { tournament, players, ids }
}

/** 3-player knockout: seed 1 gets a bye, completed bracket. */
function knockout(): { tournament: Tournament; players: Record<string, Player> } {
  const players: Record<string, Player> = {
    k1: { id: 'k1', name: 'Alice', createdAt: 1700000000000 },
    k2: { id: 'k2', name: 'Bob', createdAt: 1700000000001 },
    k3: { id: 'k3', name: 'Carol', createdAt: 1700000000002 },
  }
  const tournament: Tournament = {
    id: 'orig-k',
    name: 'Lunch Cup',
    mode: 'knockout',
    maxScore: 7,
    seeding: 'win-rate',
    status: 'completed',
    createdAt: 1700000000000,
    startedAt: 1700000010000,
    completedAt: 1700000900000,
    players: ['k1', 'k2', 'k3'],
    matches: [
      { id: 'km1', round: 1, slot: 0, a: 'k1', b: null, winnerSide: 'a', loserScore: null, bye: true },
      { id: 'km2', round: 1, slot: 1, a: 'k2', b: 'k3', winnerSide: 'b', loserScore: 5, playedAt: 1700000200000 },
      { id: 'km3', round: 2, slot: 0, a: 'k1', b: 'k3', winnerSide: 'a', loserScore: 3, playedAt: 1700000800000 },
    ],
    bracketLocked: true,
  }
  return { tournament, players }
}

// Test-local mirror of the encode pipeline, for hand-built payloads.
async function encodeRaw(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const compressed = new Response(bytes).body!.pipeThrough(new CompressionStream('deflate-raw'))
  const out = new Uint8Array(await new Response(compressed).arrayBuffer())
  let bin = ''
  for (const b of out) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

describe('encodeTournamentShare / decodeTournamentShare', () => {
  test('round-trips a full 8-player round-robin', async () => {
    const { tournament, players, ids } = fullRoundRobin()
    const payload = await encodeTournamentShare(tournament, players)
    const result = await decodeTournamentShare(payload)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const t = result.data.tournament
    expect(t.name).toBe('Friday Night Open')
    expect(t.mode).toBe('round-robin')
    expect(t.maxScore).toBe(11)
    expect(t.status).toBe('running')
    expect(t.createdAt).toBe(1700000000000)
    expect(t.startedAt).toBe(1700000050000)
    expect(t.bracketLocked).toBe(false)

    // Roster order and names are preserved; ids map by roster position.
    expect(t.players).toHaveLength(8)
    t.players.forEach((pid, i) => {
      expect(result.data.players[pid]?.name).toBe(NAMES[i])
    })

    // Every match field survives, with a/b remapped by roster index.
    const idToIndex = new Map(ids.map((id, i) => [id, i]))
    expect(t.matches).toHaveLength(28)
    t.matches.forEach((m, i) => {
      const orig = tournament.matches[i]
      expect(m.round).toBe(orig.round)
      expect(m.slot).toBeUndefined()
      expect(m.a).toBe(t.players[idToIndex.get(orig.a!)!])
      expect(m.b).toBe(t.players[idToIndex.get(orig.b!)!])
      expect(m.winnerSide).toBe(orig.winnerSide)
      expect(m.loserScore).toBe(orig.loserScore)
      if (orig.playedAt !== undefined) expect(m.playedAt).toBe(orig.playedAt)
      else expect(m.playedAt).toBeUndefined()
      // a/b reference keys of the returned players map.
      expect(result.data.players[m.a!]).toBeDefined()
      expect(result.data.players[m.b!]).toBeDefined()
    })

    // The zero loser score is preserved as 0, not dropped.
    expect(t.matches[3].loserScore).toBe(0)
  })

  test('round-trips a knockout with byes, slots, seeding, and completedAt', async () => {
    const { tournament, players } = knockout()
    const payload = await encodeTournamentShare(tournament, players)
    const result = await decodeTournamentShare(payload)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const t = result.data.tournament
    expect(t.mode).toBe('knockout')
    expect(t.seeding).toBe('win-rate')
    expect(t.status).toBe('completed')
    expect(t.completedAt).toBe(1700000900000)
    expect(t.bracketLocked).toBe(true)

    expect(t.matches.map((m) => m.slot)).toEqual([0, 1, 0])
    const bye = t.matches[0]
    expect(bye.bye).toBe(true)
    expect(bye.b).toBeNull()
    expect(bye.winnerSide).toBe('a')
    expect(bye.loserScore).toBeNull()
    expect(t.matches[1].bye).toBeUndefined()
    expect(t.matches[1].loserScore).toBe(5)
    expect(t.matches[2].winnerSide).toBe('a')
  })

  test('optional fields stay absent after decode', async () => {
    const players: Record<string, Player> = {
      s1: { id: 's1', name: 'Alice', createdAt: 1 },
      s2: { id: 's2', name: 'Bob', createdAt: 2 },
    }
    const tournament: Tournament = {
      id: 's-t',
      name: 'Setup Only',
      mode: 'round-robin',
      maxScore: 7,
      status: 'setup',
      createdAt: 1700000000000,
      players: ['s1', 's2'],
      matches: [
        { id: 'sm1', round: 1, a: 's1', b: 's2', winnerSide: null, loserScore: null },
      ],
      bracketLocked: false,
    }
    const result = await decodeTournamentShare(await encodeTournamentShare(tournament, players))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.tournament.seeding).toBeUndefined()
    expect(result.data.tournament.startedAt).toBeUndefined()
    expect(result.data.tournament.completedAt).toBeUndefined()
    expect(result.data.tournament.matches[0].playedAt).toBeUndefined()
    expect(result.data.tournament.matches[0].bye).toBeUndefined()
    expect(result.data.tournament.matches[0].slot).toBeUndefined()
  })

  test('payload is base64url', async () => {
    const { tournament, players } = fullRoundRobin()
    const payload = await encodeTournamentShare(tournament, players)
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test('full round-robin payload fits the URL/QR budget', async () => {
    const { tournament, players } = fullRoundRobin()
    const payload = await encodeTournamentShare(tournament, players)
    expect(payload.length).toBeLessThanOrEqual(1500)
  })

  test('truncated payload fails cleanly', async () => {
    const { tournament, players } = fullRoundRobin()
    const payload = await encodeTournamentShare(tournament, players)
    const result = await decodeTournamentShare(payload.slice(0, Math.floor(payload.length / 2)))
    expect(result.ok).toBe(false)
  })

  test('tampered payload fails cleanly', async () => {
    const { tournament, players } = fullRoundRobin()
    const payload = await encodeTournamentShare(tournament, players)
    const mid = Math.floor(payload.length / 2)
    const tampered =
      payload.slice(0, mid - 4) +
      payload.slice(mid, mid + 4) +
      payload.slice(mid - 4, mid) +
      payload.slice(mid + 4)
    const result = await decodeTournamentShare(tampered)
    expect(result.ok).toBe(false)
  })

  test.each(['', '!!!', 'aGVsbG8'])('garbage payload %j fails cleanly', async (garbage) => {
    const result = await decodeTournamentShare(garbage)
    expect(result.ok).toBe(false)
  })

  test('unsupported version is rejected', async () => {
    const result = await decodeTournamentShare(await encodeRaw({ v: 99 }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/version/i)
  })

  test('encodes as share format version 2', async () => {
    const { tournament, players } = knockout()
    const payload = await encodeTournamentShare(tournament, players)
    const result = await decodeTournamentShare(payload)
    expect(result.ok).toBe(true)
    expect(SHARE_VERSION).toBe(2)
  })

  test('still decodes v1 links with absolute-ms playedAt', async () => {
    const payload = await encodeRaw({
      v: 1,
      n: 'Legacy Cup',
      m: 0,
      x: 7,
      s: 1,
      c: 1700000000000,
      st: 1700000050000,
      l: 0,
      p: ['Alice', 'Bob', 'Carol'],
      ma: [
        [1, -1, 0, 1, 0, 3, 1700000123456, 0],
        [1, -1, 1, 2, 1, 0, 1700000234567, 0],
        [2, -1, 0, 2, -1, -1, 0, 0],
      ],
    })
    const result = await decodeTournamentShare(payload)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [m1, m2, m3] = result.data.tournament.matches
    // v1 carries full millisecond precision and must survive untouched.
    expect(m1.playedAt).toBe(1700000123456)
    expect(m2.playedAt).toBe(1700000234567)
    expect(m2.loserScore).toBe(0)
    expect(m3.playedAt).toBeUndefined()
    expect(m3.winnerSide).toBeNull()
  })

  test('v2 round-trips out-of-order playedAt to whole-second precision', async () => {
    const { tournament, players } = fullRoundRobin()
    // Matches are stored in schedule order but were played out of order, with
    // sub-second timestamps: the delta encoding must cope with negative deltas
    // and may only lose the millisecond part.
    tournament.matches[0].playedAt = 1700000500250
    tournament.matches[1].playedAt = 1700000100750 // earlier than match 0
    tournament.matches[2].playedAt = 1700000100750 // same second as match 1
    tournament.matches[3].playedAt = 1699999999999 // before createdAt
    const payload = await encodeTournamentShare(tournament, players)
    const result = await decodeTournamentShare(payload)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const got = result.data.tournament.matches.map((m) => m.playedAt)
    expect(got[0]).toBe(1700000500000)
    expect(got[1]).toBe(1700000101000)
    expect(got[2]).toBe(1700000101000)
    expect(got[3]).toBe(1700000000000)
    // Remaining played matches (multiples of 1000 in the fixture) are exact.
    for (let i = 4; i < 10; i++) expect(got[i]).toBe(tournament.matches[i].playedAt)
    for (let i = 10; i < 28; i++) expect(got[i]).toBeUndefined()
  })

  test('v2 payload is smaller than the equivalent v1 payload', async () => {
    const { tournament, players } = fullRoundRobin()
    // Play everything with realistic irregular gaps.
    let t = 1700000100000
    tournament.matches.forEach((m, i) => {
      m.winnerSide = i % 2 === 0 ? 'a' : 'b'
      m.loserScore = i % 7
      m.playedAt = t += 180_000 + ((i * 7919) % 120_000)
    })
    const v2 = await encodeTournamentShare(tournament, players)
    const v1 = await encodeRaw({
      v: 1,
      n: tournament.name,
      m: 0,
      x: 11,
      s: 1,
      c: tournament.createdAt,
      st: tournament.startedAt,
      l: 0,
      p: NAMES,
      ma: tournament.matches.map((m, i) => [
        m.round,
        -1,
        Math.floor(i / 7), // any valid index; only sizes matter here
        (i % 7) + 1,
        m.winnerSide === 'a' ? 0 : 1,
        m.loserScore,
        m.playedAt,
        0,
      ]),
    })
    expect(v2.length).toBeLessThan(v1.length * 0.85)
  })

  test('v2 tuple with null outside the playedAt column is rejected', async () => {
    const base = { v: 2, n: 'Evil', m: 0, x: 7, s: 1, c: 1700000000000, l: 0, p: ['Alice', 'Bob'] }
    const bad = await decodeTournamentShare(await encodeRaw({ ...base, ma: [[1, -1, 0, null, -1, -1, null, 0]] }))
    expect(bad.ok).toBe(false)
    const good = await decodeTournamentShare(await encodeRaw({ ...base, ma: [[1, -1, 0, 1, -1, -1, null, 0]] }))
    expect(good.ok).toBe(true)
    // v1 never allows null, even in the playedAt column.
    const v1null = await decodeTournamentShare(await encodeRaw({ ...base, v: 1, ma: [[1, -1, 0, 1, -1, -1, null, 0]] }))
    expect(v1null.ok).toBe(false)
  })

  test('match tuple referencing an out-of-range player index is rejected', async () => {
    const payload = await encodeRaw({
      v: 1,
      n: 'Evil',
      m: 0,
      x: 7,
      s: 1,
      c: 1700000000000,
      l: 0,
      p: ['Alice', 'Bob'],
      ma: [[1, -1, 0, 99, -1, -1, 0, 0]],
    })
    const result = await decodeTournamentShare(payload)
    expect(result.ok).toBe(false)
  })
})
