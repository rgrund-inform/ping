import { describe, expect, test } from 'bun:test'
import type { Player, PlayerId, Tournament } from '../types'
import { generateFacts, pickFact } from './facts'

const NOW = new Date('2026-05-07T15:00:00Z').getTime()
const TODAY = new Date('2026-05-07T10:00:00Z').getTime()
const YESTERDAY = new Date('2026-05-06T10:00:00Z').getTime()
const LAST_MONTH = new Date('2026-04-01T10:00:00Z').getTime()

function p(id: string, name: string): Player {
  return { id, name, createdAt: 0 }
}

function makeTournament(opts: {
  id: string
  matches: { a: PlayerId; b: PlayerId; winner: PlayerId; loserScore: number | null; at: number }[]
  maxScore?: number
  scoring?: 'points' | 'wins'
}): Tournament {
  const max = opts.maxScore ?? 11
  return {
    id: opts.id,
    name: opts.id,
    mode: 'round-robin',
    scoring: opts.scoring ?? 'points',
    maxScore: max,
    status: 'completed',
    createdAt: 0,
    players: [...new Set(opts.matches.flatMap((m) => [m.a, m.b]))],
    matches: opts.matches.map((m, i) => ({
      id: `m${opts.id}-${i}`,
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

describe('generateFacts', () => {
  test('produces a head-to-head dominance fact when one player wins ≥ 70% over ≥ 5 games', () => {
    const players = { a1: p('a1', 'Marcel'), a2: p('a2', 'Moritz') }
    const t = makeTournament({
      id: 'h2h',
      matches: Array.from({ length: 7 }, (_, i) => ({
        a: 'a1',
        b: 'a2',
        winner: i < 6 ? 'a1' : 'a2',
        loserScore: 5,
        at: LAST_MONTH + i,
      })),
    })
    const facts = generateFacts({ players, tournaments: [t], now: NOW })
    expect(facts.some((f) => f.id.startsWith('h2h:a1:a2'))).toBe(true)
    expect(facts.find((f) => f.id.startsWith('h2h:a1:a2'))!.text).toContain('Marcel')
  })

  test('emits a hot-streak fact when a player wins ≥ 3 in a row today', () => {
    const players = { p1: p('p1', 'Moritz'), p2: p('p2', 'Anna') }
    const t = makeTournament({
      id: 'streak',
      matches: [
        { a: 'p1', b: 'p2', winner: 'p1', loserScore: 4, at: TODAY + 1 },
        { a: 'p1', b: 'p2', winner: 'p1', loserScore: 6, at: TODAY + 2 },
        { a: 'p1', b: 'p2', winner: 'p1', loserScore: 7, at: TODAY + 3 },
      ],
    })
    const facts = generateFacts({ players, tournaments: [t], now: NOW })
    expect(facts.some((f) => f.id === 'streak:p1')).toBe(true)
  })

  test('newcomer first win surfaces when a player has only won today', () => {
    const players = { newp: p('newp', 'Lisa'), other: p('other', 'Tom') }
    const t = makeTournament({
      id: 'first',
      matches: [{ a: 'newp', b: 'other', winner: 'newp', loserScore: 8, at: TODAY + 5 }],
    })
    const facts = generateFacts({ players, tournaments: [t], now: NOW })
    expect(facts.some((f) => f.id === 'firstwin:newp')).toBe(true)
  })

  test('does not surface newcomer fact when player won previously', () => {
    const players = { v: p('v', 'Veteran'), o: p('o', 'Other') }
    const t = makeTournament({
      id: 'vet',
      matches: [
        { a: 'v', b: 'o', winner: 'v', loserScore: 3, at: YESTERDAY },
        { a: 'v', b: 'o', winner: 'v', loserScore: 4, at: TODAY + 1 },
      ],
    })
    const facts = generateFacts({ players, tournaments: [t], now: NOW })
    expect(facts.some((f) => f.id === 'firstwin:v')).toBe(false)
  })
})

describe('pickFact', () => {
  test('returns null on empty input', () => {
    expect(pickFact([])).toBeNull()
  })
  test('avoids the previously shown fact when alternatives exist', () => {
    const facts = [
      { id: '1', text: 'one', weight: 1 },
      { id: '2', text: 'two', weight: 1 },
    ]
    for (let i = 0; i < 20; i++) {
      const f = pickFact(facts, '1')
      expect(f?.id).toBe('2')
    }
  })
})

describe('closest rivalry and win-only matches', () => {
  const players = { a1: p('a1', 'Marcel'), a2: p('a2', 'Moritz') }

  /** Four nail-biters: loser reaches 10 of 11 every time. */
  const tightMatches = [0, 1, 2, 3].map((i) => ({
    a: 'a1',
    b: 'a2',
    winner: i % 2 === 0 ? 'a1' : 'a2',
    loserScore: 10,
    at: LAST_MONTH + i,
  }))

  test('surfaces the fact from scored matches (positive case)', () => {
    const t = makeTournament({ id: 'tight', matches: tightMatches })
    const facts = generateFacts({ players, tournaments: [t], now: NOW })
    const tight = facts.find((f) => f.id.startsWith('tight:'))
    expect(tight).toBeDefined()
    expect(tight!.text).toContain('11-10')
  })

  test('ignores win-only matches, which carry no score (negative case)', () => {
    const quick = makeTournament({
      id: 'quick',
      scoring: 'wins',
      matches: [0, 1, 2, 3].map((i) => ({
        a: 'a1',
        b: 'a2',
        winner: i % 2 === 0 ? 'a1' : 'a2',
        loserScore: null,
        at: LAST_MONTH + i,
      })),
    })
    const facts = generateFacts({ players, tournaments: [quick], now: NOW })
    expect(facts.find((f) => f.id.startsWith('tight:'))).toBeUndefined()
  })

  test('a quick tournament does not drag the average of a scored rivalry', () => {
    const scored = makeTournament({ id: 'tight', matches: tightMatches })
    const quick = makeTournament({
      id: 'quick',
      scoring: 'wins',
      matches: [{ a: 'a1', b: 'a2', winner: 'a1', loserScore: null, at: LAST_MONTH + 9 }],
    })
    const facts = generateFacts({ players, tournaments: [scored, quick], now: NOW })
    const tight = facts.find((f) => f.id.startsWith('tight:'))
    // Averages still come out 11-10; a counted win-only match would have
    // pulled the loser average down to 8.
    expect(tight!.text).toContain('11-10')
  })
})
