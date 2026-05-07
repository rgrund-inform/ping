import { describe, expect, test } from 'bun:test'
import { buildBracket, nextPowerOfTwo, seedOrder } from './bracket'

describe('nextPowerOfTwo', () => {
  test('common cases', () => {
    expect(nextPowerOfTwo(1)).toBe(1)
    expect(nextPowerOfTwo(2)).toBe(2)
    expect(nextPowerOfTwo(3)).toBe(4)
    expect(nextPowerOfTwo(5)).toBe(8)
    expect(nextPowerOfTwo(8)).toBe(8)
    expect(nextPowerOfTwo(9)).toBe(16)
  })
})

describe('seedOrder', () => {
  test('size 8 produces standard placement', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })
})

describe('buildBracket', () => {
  test('5 players → bracket of 8 with top 3 seeds receiving byes', () => {
    const players = ['s1', 's2', 's3', 's4', 's5']
    const matches = buildBracket(players)
    const r1 = matches.filter((m) => m.round === 1).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
    expect(r1.length).toBe(4)
    const byeR1 = r1.filter((m) => m.bye)
    expect(byeR1.length).toBe(3)
    // The three top seeds (s1, s2, s3) should be the ones with byes.
    const byeWinners = byeR1.map((m) => (m.winnerSide === 'a' ? m.a : m.b))
    expect(byeWinners.sort()).toEqual(['s1', 's2', 's3'])
  })

  test('round 2 receives bye-advanced players', () => {
    const matches = buildBracket(['s1', 's2', 's3', 's4', 's5'])
    const r2 = matches.filter((m) => m.round === 2).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
    expect(r2.length).toBe(2)
    // Top seed (s1) should have advanced into round 2 slot 0, side 'a'
    expect(r2[0].a).toBe('s1')
    // Slot 0 side 'b' came from match between s4 and s5 (still null until played)
    expect(r2[0].b).toBeNull()
  })

  test('exact power-of-two has no byes', () => {
    const matches = buildBracket(['a', 'b', 'c', 'd'])
    const r1 = matches.filter((m) => m.round === 1)
    expect(r1.length).toBe(2)
    expect(r1.filter((m) => m.bye).length).toBe(0)
  })

  test('total rounds = log2(bracketSize)', () => {
    const matches = buildBracket(['a', 'b', 'c', 'd', 'e'])
    const maxRound = matches.reduce((m, x) => Math.max(m, x.round), 0)
    expect(maxRound).toBe(3) // log2(8) = 3
  })
})
