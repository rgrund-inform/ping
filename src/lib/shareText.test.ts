import { describe, expect, test } from 'bun:test'
import type { Match, Player, Tournament } from '../types'
import { shareSummaryText } from './shareText'

const players: Record<string, Player> = {
  a: { id: 'a', name: 'Alice', createdAt: 1 },
  b: { id: 'b', name: 'Bob', createdAt: 2 },
  c: { id: 'c', name: 'Carol', createdAt: 3 },
  d: { id: 'd', name: 'Dave', createdAt: 4 },
}

function rr(matches: Match[], status: Tournament['status']): Tournament {
  return {
    id: 't',
    name: 'Friday Night Open',
    mode: 'round-robin',
    maxScore: 11,
    status,
    createdAt: 0,
    players: ['a', 'b', 'c', 'd'],
    matches,
    bracketLocked: false,
  }
}

const m = (id: string, a: string, b: string, winner: 'a' | 'b' | null, loserScore: number | null = null): Match => ({
  id,
  round: 1,
  a,
  b,
  winnerSide: winner,
  loserScore,
})

describe('shareSummaryText', () => {
  test('round-robin in progress lists the leaders', () => {
    const t = rr(
      [m('1', 'a', 'b', 'a', 5), m('2', 'c', 'd', 'b', 3), m('3', 'a', 'c', 'a', 7), m('4', 'b', 'd', null)],
      'running',
    )
    const text = shareSummaryText(t, players)
    expect(text.split('\n')).toEqual([
      '🏓 Friday Night Open',
      'Round-robin · 4 players · 3/4 matches',
      'Leading: 1. Alice 2–0 · 2. Dave 1–0 · 3. Bob 0–1',
    ])
  })

  test('completed round-robin crowns the winner', () => {
    // Alice wins 11–3, Carol 11–5: tied on wins, Alice ahead on point difference.
    const t = rr([m('1', 'a', 'b', 'a', 3), m('2', 'c', 'd', 'a', 5)], 'completed')
    const text = shareSummaryText(t, players)
    expect(text).toContain('Final: 🏆 Alice 1–0 · 2. Carol 1–0')
  })

  test('players who have not played are left out of the leaders', () => {
    const t = rr([m('1', 'a', 'b', 'a', 5), m('2', 'c', 'd', null)], 'running')
    const text = shareSummaryText(t, players)
    expect(text).toContain('Leading: 1. Alice 1–0 · 2. Bob 0–1')
    expect(text).not.toContain('Carol')
  })

  test('no results yet', () => {
    const t = rr([m('1', 'a', 'b', null)], 'running')
    expect(shareSummaryText(t, players)).toContain('No matches played yet.')
  })

  test('knockout names the champion or says the bracket is open', () => {
    const t: Tournament = {
      ...rr([], 'completed'),
      mode: 'knockout',
      bracketLocked: true,
      players: ['a', 'b', 'c'],
      matches: [
        { id: '1', round: 1, slot: 0, a: 'a', b: null, winnerSide: 'a', loserScore: null, bye: true },
        { id: '2', round: 1, slot: 1, a: 'b', b: 'c', winnerSide: 'b', loserScore: 5 },
        { id: '3', round: 2, slot: 0, a: 'a', b: 'c', winnerSide: 'b', loserScore: 9 },
      ],
    }
    const done = shareSummaryText(t, players)
    // The bye does not count as a match.
    expect(done).toContain('Knockout · 3 players · 2/2 matches')
    expect(done).toContain('🏆 Carol')

    t.matches[2].winnerSide = null
    t.status = 'running'
    expect(shareSummaryText(t, players)).toContain('Bracket still in play.')
  })
})

describe('quick tournaments', () => {
  /** Same fixture as a scored round-robin, but win-only: no loser scores. */
  function quick(status: Tournament['status'] = 'running'): Tournament {
    return {
      ...rr(
        [m('1', 'a', 'b', 'a'), m('2', 'c', 'd', 'b'), m('3', 'a', 'c', 'a'), m('4', 'b', 'd', null)],
        status,
      ),
      scoring: 'wins',
    }
  }

  test('the headline says Quick, not Round-robin', () => {
    const text = shareSummaryText(quick(), players)
    expect(text).toContain('Quick · 4 players · 3/4 matches')
    expect(text).not.toContain('Round-robin')
  })

  test('the standings line still reports wins and losses', () => {
    const text = shareSummaryText(quick(), players)
    expect(text).toContain('Leading: 1. Alice 2–0 · 2. Dave 1–0 · 3. Bob 0–1')
  })

  test('a completed quick tournament still crowns a winner', () => {
    expect(shareSummaryText(quick('completed'), players)).toContain('Final: 🏆 Alice 2–0')
  })
})
