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
  matches: { a: PlayerId; b: PlayerId; winner: PlayerId; loserScore: number; at: number }[]
  maxScore?: number
}): Tournament {
  const max = opts.maxScore ?? 11
  return {
    id: opts.id,
    name: opts.id,
    mode: 'round-robin',
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
