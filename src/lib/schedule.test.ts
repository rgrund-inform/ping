import { describe, expect, test } from 'bun:test'
import { buildRoundRobinMatches, regenerateRoundRobin, roundRobinPairings } from './schedule'

describe('roundRobinPairings', () => {
  test('returns empty for fewer than two players', () => {
    expect(roundRobinPairings([])).toEqual([])
    expect(roundRobinPairings(['a'])).toEqual([])
  })

  test('every pair appears exactly once for 4 players', () => {
    const rounds = roundRobinPairings(['a', 'b', 'c', 'd'])
    expect(rounds.length).toBe(3)
    const seen = new Set<string>()
    for (const round of rounds) {
      // each round has 2 matches and uses each player once
      const playersInRound = round.flat().filter(Boolean)
      expect(new Set(playersInRound).size).toBe(playersInRound.length)
      for (const [a, b] of round) {
        const key = [a, b].filter(Boolean).sort().join('|')
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
    expect(seen.size).toBe(6) // C(4,2) = 6
  })

  test('odd player count introduces sit-outs', () => {
    const rounds = roundRobinPairings(['a', 'b', 'c'])
    expect(rounds.length).toBe(3)
    const sitOuts = rounds.flat().filter(([a, b]) => a === null || b === null)
    expect(sitOuts.length).toBe(3) // one per round
  })
})

describe('buildRoundRobinMatches', () => {
  test('skips sit-out pairings, leaving real matches only', () => {
    const matches = buildRoundRobinMatches(['a', 'b', 'c'])
    expect(matches.length).toBe(3) // C(3,2) = 3
    for (const m of matches) {
      expect(m.a).not.toBeNull()
      expect(m.b).not.toBeNull()
      expect(m.winnerSide).toBeNull()
    }
  })
})

describe('regenerateRoundRobin', () => {
  test('keeps played matches and avoids regenerating already-played pairings', () => {
    const initial = buildRoundRobinMatches(['a', 'b', 'c'])
    initial[0].winnerSide = 'a'
    initial[0].loserScore = 5
    const playedPair = [initial[0].a, initial[0].b].sort().join('|')
    const next = regenerateRoundRobin(initial, ['a', 'b', 'c', 'd'])
    const played = next.filter((m) => m.winnerSide !== null)
    expect(played.length).toBe(1)
    // Should not include another match between the originally played pair.
    const dupes = next.filter(
      (m) => m.winnerSide === null && [m.a, m.b].sort().join('|') === playedPair,
    )
    expect(dupes.length).toBe(0)
    // 4 players → 6 total pairings; 1 already played → 5 unplayed expected
    expect(next.filter((m) => m.winnerSide === null).length).toBe(5)
  })
})
