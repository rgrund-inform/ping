import { describe, expect, test } from 'bun:test'
import type { Player, PlayerId, Tournament } from '../types'
import {
  currentStreak,
  globalPlayerStats,
  playerHeadToHead,
  playerRivals,
  recentResults,
  rivalryGap,
} from './stats'

function p(id: string, name: string): Player {
  return { id, name, createdAt: 0, updatedAt: 0 }
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
    updatedAt: 0,
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

  test('averages the finish normalised to a game to 7', () => {
    const to11 = tournament({
      id: 'n11',
      players: ['x', 'y'],
      maxScore: 11,
      matches: [{ a: 'x', b: 'y', winner: 'x', loserScore: 0, at: 100 }],
    })
    const to7 = tournament({
      id: 'n7',
      players: ['x', 'y'],
      maxScore: 7,
      matches: [{ a: 'x', b: 'y', winner: 'y', loserScore: 5, at: 200 }],
    })
    const quick = tournament({
      id: 'nq',
      players: ['x', 'y'],
      scoring: 'wins',
      matches: [{ a: 'x', b: 'y', winner: 'x', loserScore: null, at: 300 }],
    })
    const vsY = playerHeadToHead('x', players, [to11, to7, quick])[0]
    expect(vsY.matches).toBe(3)
    expect(vsY.scoredMatches).toBe(2)
    // 11–0 → 7–0, 5–7 stays: (7 + 5) / 2 and (0 + 7) / 2.
    expect(vsY.avgFor).toBe(6)
    expect(vsY.avgAgainst).toBe(3.5)
  })

  test('has no average without a scoreline', () => {
    const quick = tournament({
      id: 'nq',
      players: ['x', 'y'],
      scoring: 'wins',
      matches: [{ a: 'x', b: 'y', winner: 'x', loserScore: null, at: 100 }],
    })
    const vsY = playerHeadToHead('x', players, [quick])[0]
    expect(vsY.avgFor).toBeNull()
    expect(vsY.avgAgainst).toBeNull()
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

describe('playerRivals', () => {
  const day = 24 * 60 * 60 * 1000
  const now = 100 * day
  const four = { ...players, w: p('w', 'W') }

  test('picks the closest opponent, not the most played', () => {
    const t = tournament({
      id: 'rv',
      players: ['x', 'y', 'z'],
      matches: [
        // x beats y 4 times: lots of matches, one-sided.
        { a: 'x', b: 'y', winner: 'x', loserScore: 2, at: now - 50 * day },
        { a: 'x', b: 'y', winner: 'x', loserScore: 3, at: now - 50 * day },
        { a: 'x', b: 'y', winner: 'x', loserScore: 1, at: now - 50 * day },
        { a: 'x', b: 'y', winner: 'x', loserScore: 4, at: now - 50 * day },
        // x and z split 3 close matches.
        { a: 'x', b: 'z', winner: 'x', loserScore: 9, at: now - 50 * day },
        { a: 'x', b: 'z', winner: 'z', loserScore: 9, at: now - 50 * day },
        { a: 'x', b: 'z', winner: 'z', loserScore: 10, at: now - 50 * day },
      ],
    })
    const r = playerRivals('x', players, [t], now)
    expect(r.allTime?.opponentId).toBe('z')
  })

  test('needs 3 matches all-time and 2 in the last 30 days', () => {
    const t = tournament({
      id: 'rv',
      players: ['x', 'y', 'z'],
      matches: [
        { a: 'x', b: 'y', winner: 'x', loserScore: 10, at: now - 40 * day },
        { a: 'x', b: 'y', winner: 'y', loserScore: 10, at: now - 1 * day },
        { a: 'x', b: 'z', winner: 'x', loserScore: 5, at: now - 2 * day },
      ],
    })
    const r = playerRivals('x', players, [t], now)
    expect(r.allTime).toBeNull()
    expect(r.current).toBeNull()
  })

  test('current rival only looks at the last 30 days', () => {
    const t = tournament({
      id: 'rv',
      players: ['x', 'y', 'z', 'w'],
      matches: [
        // Dead-even with y, but long ago.
        { a: 'x', b: 'y', winner: 'x', loserScore: 10, at: now - 60 * day },
        { a: 'x', b: 'y', winner: 'y', loserScore: 10, at: now - 60 * day },
        { a: 'x', b: 'y', winner: 'x', loserScore: 10, at: now - 60 * day },
        { a: 'x', b: 'y', winner: 'y', loserScore: 10, at: now - 60 * day },
        // Lately: close with z, one-sided with w.
        { a: 'x', b: 'z', winner: 'x', loserScore: 8, at: now - 3 * day },
        { a: 'x', b: 'z', winner: 'z', loserScore: 9, at: now - 2 * day },
        { a: 'x', b: 'w', winner: 'x', loserScore: 1, at: now - 3 * day },
        { a: 'x', b: 'w', winner: 'x', loserScore: 0, at: now - 2 * day },
      ],
    })
    const r = playerRivals('x', four, [t], now)
    expect(r.allTime?.opponentId).toBe('y')
    expect(r.current?.opponentId).toBe('z')
    expect(r.current?.matches).toBe(2)
  })

  test('gap is 0 for an even record and 1 for a whitewash', () => {
    const even = tournament({
      id: 'g1',
      players: ['x', 'y'],
      matches: [
        { a: 'x', b: 'y', winner: 'x', loserScore: 5, at: 1 },
        { a: 'x', b: 'y', winner: 'y', loserScore: 5, at: 2 },
      ],
    })
    expect(rivalryGap(playerHeadToHead('x', players, [even])[0])).toBe(0)
    const whitewash = tournament({
      id: 'g2',
      players: ['x', 'y'],
      matches: [{ a: 'x', b: 'y', winner: 'x', loserScore: 0, at: 1 }],
    })
    expect(rivalryGap(playerHeadToHead('x', players, [whitewash])[0])).toBe(1)
  })
})
