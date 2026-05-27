import { describe, expect, test } from 'bun:test'
import type { Tournament } from '../types'
import {
  applyResult,
  canEditMatch,
  champion,
  editResult,
  isComplete,
  nextMatches,
  recordMatchResult,
  standings,
} from './scoring'
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

describe('applyResult', () => {
  test('refuses to overwrite an already-played match', () => {
    const t = rrTournament(['a', 'b'])
    applyResult(t, t.matches[0].id, 'a', 5)
    expect(() => applyResult(t, t.matches[0].id, 'b', 9)).toThrow(/already played/)
    // Original result preserved.
    expect(t.matches[0].winnerSide).toBe('a')
    expect(t.matches[0].loserScore).toBe(5)
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

describe('editResult (round-robin)', () => {
  test('updates loser score for an already-played match', () => {
    const t = rrTournament(['a', 'b', 'c'])
    const m = t.matches[0]
    applyResult(t, m.id, 'a', 3)
    editResult(t, m.id, 'a', 7)
    expect(m.winnerSide).toBe('a')
    expect(m.loserScore).toBe(7)
  })

  test('flips winner and standings recompute', () => {
    const t = rrTournament(['a', 'b', 'c'])
    const m = t.matches.find((x) => sameMatch(x, 'a', 'b'))!
    applyResult(t, m.id, m.a === 'a' ? 'a' : 'b', 3)
    expect(standings(t).find((s) => s.playerId === 'a')!.wins).toBe(1)
    editResult(t, m.id, m.a === 'a' ? 'b' : 'a', 5)
    expect(standings(t).find((s) => s.playerId === 'b')!.wins).toBe(1)
    expect(standings(t).find((s) => s.playerId === 'a')!.wins).toBe(0)
  })

  test('refuses to edit a match that was never played', () => {
    const t = rrTournament(['a', 'b'])
    expect(() => editResult(t, t.matches[0].id, 'a', 3)).toThrow(/has not been played/)
  })

  test('refuses out-of-range scores', () => {
    const t = rrTournament(['a', 'b'])
    applyResult(t, t.matches[0].id, 'a', 3)
    expect(() => editResult(t, t.matches[0].id, 'a', 11)).toThrow()
    expect(() => editResult(t, t.matches[0].id, 'a', -1)).toThrow()
  })
})

describe('editResult (knockout)', () => {
  test('updates loser score when winner does not change', () => {
    const t = knockoutTournament(['a', 'b', 'c', 'd'])
    const r1 = t.matches.filter((m) => m.round === 1).sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0))
    const first = r1[0]
    applyResult(t, first.id, 'a', 3)
    const promoted = first.a
    editResult(t, first.id, 'a', 8)
    expect(first.loserScore).toBe(8)
    const final = t.matches.find((m) => m.round === 2)!
    expect(final.a).toBe(promoted)
  })

  test('flipping winner swaps the player in the next-round slot', () => {
    const t = knockoutTournament(['a', 'b', 'c', 'd'])
    const r1 = t.matches.filter((m) => m.round === 1).sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0))
    const first = r1[0]
    applyResult(t, first.id, 'a', 3)
    const aPlayer = first.a
    const bPlayer = first.b
    const final = t.matches.find((m) => m.round === 2)!
    expect(final.a).toBe(aPlayer)
    editResult(t, first.id, 'b', 4)
    expect(final.a).toBe(bPlayer)
  })

  test('refuses edit once the next-round match has been played', () => {
    const t = knockoutTournament(['a', 'b', 'c', 'd'])
    const r1 = t.matches.filter((m) => m.round === 1).sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0))
    applyResult(t, r1[0].id, 'a', 3)
    applyResult(t, r1[1].id, 'a', 4)
    const final = t.matches.find((m) => m.round === 2)!
    applyResult(t, final.id, 'a', 5)
    expect(() => editResult(t, r1[0].id, 'b', 2)).toThrow(/downstream/)
  })

  test('can edit the final even when tournament is completed', () => {
    const t = knockoutTournament(['a', 'b', 'c', 'd'])
    const r1 = t.matches.filter((m) => m.round === 1).sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0))
    applyResult(t, r1[0].id, 'a', 3)
    applyResult(t, r1[1].id, 'a', 4)
    const final = t.matches.find((m) => m.round === 2)!
    applyResult(t, final.id, 'a', 5)
    expect(t.status).toBe('completed')
    const oldChampion = champion(t)
    editResult(t, final.id, 'b', 6)
    expect(champion(t)).not.toBe(oldChampion)
    expect(t.status).toBe('completed')
  })
})

describe('canEditMatch', () => {
  test('rejects byes', () => {
    const t = knockoutTournament(['a', 'b', 'c'])
    const bye = t.matches.find((m) => m.bye)!
    expect(canEditMatch(t, bye)).toBe(false)
  })

  test('allows unplayed matches with both sides set', () => {
    const t = rrTournament(['a', 'b'])
    expect(canEditMatch(t, t.matches[0])).toBe(true)
  })

  test('round-robin: allows editing any played match', () => {
    const t = rrTournament(['a', 'b', 'c'])
    applyResult(t, t.matches[0].id, 'a', 3)
    expect(canEditMatch(t, t.matches[0])).toBe(true)
  })

  test('knockout: blocks once downstream match is played', () => {
    const t = knockoutTournament(['a', 'b', 'c', 'd'])
    const r1 = t.matches.filter((m) => m.round === 1).sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0))
    applyResult(t, r1[0].id, 'a', 3)
    applyResult(t, r1[1].id, 'a', 4)
    expect(canEditMatch(t, r1[0])).toBe(true)
    const final = t.matches.find((m) => m.round === 2)!
    applyResult(t, final.id, 'a', 5)
    expect(canEditMatch(t, r1[0])).toBe(false)
    expect(canEditMatch(t, final)).toBe(true)
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
