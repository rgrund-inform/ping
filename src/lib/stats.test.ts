import { describe, expect, test } from 'bun:test'
import type { Player, PlayerId, Tournament } from '../types'
import { currentStreak, globalPlayerStats, playerHeadToHead, recentResults } from './stats'

function p(id: string, name: string): Player {
  return { id, name, createdAt: 0 }
}

function tournament(opts: {
  id: string
  players: PlayerId[]
  maxScore?: number
  scoring?: 'points' | 'wins'
  matches: { a: PlayerId; b: PlayerId; winner: PlayerId; loserScore: number | null; at: number }[]
}): Tournament {
  return {
    id: opts.id,
    name: opts.id,
    mode: 'round-robin',
    scoring: opts.scoring ?? 'points',
    maxScore: opts.maxScore ?? 11,
    status: 'completed',
    createdAt: 0,
    startedAt: 0,
    players: opts.players,
    matches: opts.matches.map((m, i) => ({
      id: `${opts.id}-${i}`,
      round: 1,
      a: m.a,
      b: m.b,
      winnerSide: m.winner === m.a ? 'a' : 'b',
      loserScore: m.loserScore,
      playedAt: m.at,
    })),
    bracketLocked: false,
  }
}

const players = { x: p('x', 'X'), y: p('y', 'Y'), z: p('z', 'Z') }

describe('globalPlayerStats', () => {
  test('aggregates wins, losses, points, and tournaments-played counts', () => {
    const t1 = tournament({
      id: 't1',
      players: ['x', 'y'],
      matches: [
        { a: 'x', b: 'y', winner: 'x', loserScore: 5, at: 100 },
        { a: 'x', b: 'y', winner: 'x', loserScore: 8, at: 200 },
      ],
    })
    const t2 = tournament({
      id: 't2',
      players: ['x', 'y', 'z'],
      matches: [
        { a: 'y', b: 'z', winner: 'z', loserScore: 3, at: 300 },
        { a: 'x', b: 'z', winner: 'z', loserScore: 9, at: 400 },
      ],
    })
    const stats = globalPlayerStats(players, [t1, t2])
    const x = stats.find((s) => s.playerId === 'x')!
    expect(x.tournaments).toBe(2)
    expect(x.matches).toBe(3)
    expect(x.wins).toBe(2)
    expect(x.losses).toBe(1)
    expect(x.pointsFor).toBe(11 + 11 + 9)
    expect(x.pointsAgainst).toBe(5 + 8 + 11)
    expect(x.winRate).toBeCloseTo(2 / 3)
  })

  test('skips byes and unfinished matches', () => {
    const t = tournament({
      id: 'unfinished',
      players: ['x', 'y'],
      matches: [],
    })
    t.matches = [
      { id: 'unplayed', round: 1, a: 'x', b: 'y', winnerSide: null, loserScore: null },
      { id: 'bye', round: 1, a: 'x', b: null, winnerSide: 'a', loserScore: null, bye: true },
    ]
    const stats = globalPlayerStats(players, [t])
    expect(stats.find((s) => s.playerId === 'x')!.matches).toBe(0)
  })
})

describe('playerHeadToHead', () => {
  test('returns one entry per opponent with accurate W/L', () => {
    const t = tournament({
      id: 'h2h',
      players: ['x', 'y', 'z'],
      matches: [
        { a: 'x', b: 'y', winner: 'x', loserScore: 4, at: 100 },
        { a: 'x', b: 'y', winner: 'y', loserScore: 9, at: 200 },
        { a: 'x', b: 'z', winner: 'x', loserScore: 6, at: 300 },
      ],
    })
    const h = playerHeadToHead('x', players, [t])
    const vsY = h.find((r) => r.opponentId === 'y')!
    expect(vsY.matches).toBe(2)
    expect(vsY.wins).toBe(1)
    expect(vsY.losses).toBe(1)
    expect(vsY.winRate).toBe(0.5)
    const vsZ = h.find((r) => r.opponentId === 'z')!
    expect(vsZ.matches).toBe(1)
    expect(vsZ.wins).toBe(1)
  })
})

describe('recentResults', () => {
  test('returns most-recent matches first', () => {
    const t = tournament({
      id: 'r',
      players: ['x', 'y'],
      matches: [
        { a: 'x', b: 'y', winner: 'x', loserScore: 5, at: 100 },
        { a: 'x', b: 'y', winner: 'y', loserScore: 7, at: 300 },
        { a: 'x', b: 'y', winner: 'x', loserScore: 2, at: 200 },
      ],
    })
    const recent = recentResults('x', players, [t])
    expect(recent.map((r) => r.playedAt)).toEqual([300, 200, 100])
    expect(recent[0].win).toBe(false)
    expect(recent[0].selfScore).toBe(7)
    expect(recent[0].opponentScore).toBe(11)
  })
})

describe('currentStreak', () => {
  test('counts the leading run of equal results', () => {
    expect(currentStreak([])).toBeNull()
    expect(currentStreak(['W', 'W', 'L', 'W'])).toEqual({ kind: 'W', n: 2 })
    expect(currentStreak(['L', 'L', 'L', 'W'])).toEqual({ kind: 'L', n: 3 })
  })
})

describe('quick-mode (win-only) matches in global stats', () => {
  const quick = tournament({
    id: 'q1',
    players: ['x', 'y'],
    scoring: 'wins',
    matches: [
      { a: 'x', b: 'y', winner: 'x', loserScore: null, at: 100 },
      { a: 'x', b: 'y', winner: 'y', loserScore: null, at: 200 },
      { a: 'x', b: 'y', winner: 'x', loserScore: null, at: 300 },
    ],
  })

  test('count towards matches, wins and win rate', () => {
    const stats = globalPlayerStats(players, [quick])
    const x = stats.find((s) => s.playerId === 'x')!
    expect(x.matches).toBe(3)
    expect(x.wins).toBe(2)
    expect(x.losses).toBe(1)
    expect(x.winRate).toBeCloseTo(2 / 3)
  })

  test('leave the points columns untouched', () => {
    const stats = globalPlayerStats(players, [quick])
    for (const id of ['x', 'y']) {
      const s = stats.find((st) => st.playerId === id)!
      expect(s.pointsFor).toBe(0)
      expect(s.pointsAgainst).toBe(0)
      expect(s.pointDiff).toBe(0)
    }
  })

  test('mixing quick and scored tournaments only counts the scored points', () => {
    const scored = tournament({
      id: 't1',
      players: ['x', 'y'],
      matches: [{ a: 'x', b: 'y', winner: 'x', loserScore: 4, at: 400 }],
    })
    const x = globalPlayerStats(players, [quick, scored]).find((s) => s.playerId === 'x')!
    expect(x.matches).toBe(4)
    expect(x.wins).toBe(3)
    expect(x.pointsFor).toBe(11)
    expect(x.pointsAgainst).toBe(4)
    expect(x.pointDiff).toBe(7)
  })

  test('head-to-head counts the games but not the points', () => {
    const h2h = playerHeadToHead('x', players, [quick])
    expect(h2h).toHaveLength(1)
    expect(h2h[0].matches).toBe(3)
    expect(h2h[0].wins).toBe(2)
    expect(h2h[0].pointsFor).toBe(0)
    expect(h2h[0].pointsAgainst).toBe(0)
  })

  test('recent results report the outcome with a null scoreline', () => {
    const recent = recentResults('x', players, [quick])
    expect(recent).toHaveLength(3)
    expect(recent[0].win).toBe(true)
    expect(recent[0].selfScore).toBeNull()
    expect(recent[0].opponentScore).toBeNull()
  })
})
