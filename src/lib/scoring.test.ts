import { describe, expect, test } from 'bun:test'
import type { Tournament } from '../types'
import { applyResult, champion, isComplete, nextMatches, recordMatchResult, standings } from './scoring'
import { buildRoundRobinMatches } from './schedule'
import { buildBracket } from './bracket'

function rrTournament(players: string[], maxScore = 11): Tournament {
  return {
    id: 't',
    name: 'T',
    mode: 'round-robin',
    maxScore,
    status: 'running',
    createdAt: 0,
    players,
    matches: buildRoundRobinMatches(players),
    bracketLocked: false,
  }
}

function knockoutTournament(players: string[], maxScore = 11): Tournament {
  return {
    id: 't',
    name: 'T',
    mode: 'knockout',
    maxScore,
    seeding: 'random',
    status: 'running',
    createdAt: 0,
    players,
    matches: buildBracket(players),
    bracketLocked: true,
  }
}

describe('recordMatchResult', () => {
  test('rejects scores >= maxScore', () => {
    const t = rrTournament(['a', 'b'])
    expect(() => recordMatchResult(t.matches[0], 'a', 11, 11)).toThrow()
    expect(() => recordMatchResult(t.matches[0], 'a', -1, 11)).toThrow()
  })

  test('accepts valid score', () => {
    const t = rrTournament(['a', 'b'])
    recordMatchResult(t.matches[0], 'a', 7, 11)
    expect(t.matches[0].winnerSide).toBe('a')
    expect(t.matches[0].loserScore).toBe(7)
  })
})

describe('standings + isComplete (round-robin)', () => {
  test('full 3-player tournament: rank by wins, then point diff', () => {
    const t = rrTournament(['a', 'b', 'c'])
    // a beats b 11-3, a beats c 11-9, b beats c 11-2
    applyResult(t, t.matches.find((m) => sameMatch(m, 'a', 'b'))!.id, winnerOf(t, 'a', 'a', 'b'), 3)
    applyResult(t, t.matches.find((m) => sameMatch(m, 'a', 'c'))!.id, winnerOf(t, 'a', 'a', 'c'), 9)
    applyResult(t, t.matches.find((m) => sameMatch(m, 'b', 'c'))!.id, winnerOf(t, 'b', 'b', 'c'), 2)
    expect(isComplete(t)).toBe(true)
    const s = standings(t)
    expect(s[0].playerId).toBe('a')
    expect(s[0].wins).toBe(2)
    expect(s[1].playerId).toBe('b')
  })
})

function sameMatch(m: { a: string | null; b: string | null }, x: string, y: string): boolean {
  return (m.a === x && m.b === y) || (m.a === y && m.b === x)
}

function winnerOf(t: Tournament, winner: string, x: string, y: string): 'a' | 'b' {
  const m = t.matches.find((m) => sameMatch(m, x, y))!
  return m.a === winner ? 'a' : 'b'
}

describe('nextMatches', () => {
  test('returns unplayed matches in round/slot order', () => {
    const t = rrTournament(['a', 'b', 'c', 'd'])
    const next = nextMatches(t, 100)
    expect(next.length).toBe(t.matches.length)
    expect(next[0].round).toBeLessThanOrEqual(next[next.length - 1].round)
  })
})

describe('knockout completion + champion', () => {
  test('champion is the final-round winner', () => {
    const t = knockoutTournament(['a', 'b', 'c', 'd'])
    // For size 4 standard seeding the round-1 pairs are (seed1 vs seed4) and (seed2 vs seed3),
    // i.e. (a, d) and (b, c). Walk the matches generically rather than assuming pairings.
    const r1 = t.matches.filter((m) => m.round === 1).sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0))
    expect(r1.length).toBe(2)
    // First R1 match: pick `a`'s side as winner (whichever side it's on).
    applyResult(t, r1[0].id, r1[0].a === 'a' ? 'a' : 'b', 5)
    // Second R1 match: pick `b`'s side as winner.
    applyResult(t, r1[1].id, r1[1].a === 'b' ? 'a' : 'b', 7)
    // Final: a vs b, a wins.
    const final = t.matches.find((m) => m.round === 2)!
    expect(final.a).not.toBeNull()
    expect(final.b).not.toBeNull()
    applyResult(t, final.id, final.a === 'a' ? 'a' : 'b', 4)
    expect(isComplete(t)).toBe(true)
    expect(champion(t)).toBe('a')
  })
})
