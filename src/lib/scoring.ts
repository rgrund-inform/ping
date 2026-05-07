import type { Match, PlayerId, Tournament } from '../types'
import { promoteWinner } from './bracket'

export interface Standing {
  playerId: PlayerId
  played: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  pointDiff: number
}

/** Mutates `match` to record the result. Loser score must be in [0, maxScore-1]. */
export function recordMatchResult(
  match: Match,
  winnerSide: 'a' | 'b',
  loserScore: number,
  maxScore: number,
): void {
  if (loserScore < 0 || loserScore >= maxScore) {
    throw new Error(`loserScore must be in [0, ${maxScore - 1}]`)
  }
  match.winnerSide = winnerSide
  match.loserScore = loserScore
  match.playedAt = Date.now()
}

/** Apply a result to a tournament; for knockouts also promotes the winner. */
export function applyResult(
  tournament: Tournament,
  matchId: string,
  winnerSide: 'a' | 'b',
  loserScore: number,
): void {
  const match = tournament.matches.find((m) => m.id === matchId)
  if (!match) throw new Error('match not found')
  recordMatchResult(match, winnerSide, loserScore, tournament.maxScore)
  if (tournament.mode === 'knockout') {
    promoteWinner(tournament.matches, match)
  }
  if (isComplete(tournament) && tournament.status === 'running') {
    tournament.status = 'completed'
    tournament.completedAt = Date.now()
  }
}

export function isComplete(t: Tournament): boolean {
  if (t.matches.length === 0) return false
  if (t.mode === 'round-robin') {
    return t.matches.every((m) => m.winnerSide !== null)
  }
  // knockout: completed when the final match (max round) has a winner.
  const finalRound = t.matches.reduce((max, m) => Math.max(max, m.round), 0)
  const finalMatch = t.matches.find((m) => m.round === finalRound)
  return !!finalMatch && finalMatch.winnerSide !== null
}

export function nextMatches(t: Tournament, n = 5): Match[] {
  return t.matches
    .filter((m) => m.winnerSide === null && m.a !== null && m.b !== null)
    .sort((x, y) => x.round - y.round || (x.slot ?? 0) - (y.slot ?? 0))
    .slice(0, n)
}

export function standings(t: Tournament): Standing[] {
  const map = new Map<PlayerId, Standing>()
  for (const id of t.players) {
    map.set(id, {
      playerId: id,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
    })
  }
  for (const m of t.matches) {
    if (m.winnerSide === null || m.bye) continue
    if (m.a === null || m.b === null) continue
    const winner = m.winnerSide === 'a' ? m.a : m.b
    const loser = m.winnerSide === 'a' ? m.b : m.a
    const w = map.get(winner)
    const l = map.get(loser)
    if (!w || !l) continue
    w.wins++
    w.played++
    w.pointsFor += t.maxScore
    w.pointsAgainst += m.loserScore ?? 0
    l.losses++
    l.played++
    l.pointsFor += m.loserScore ?? 0
    l.pointsAgainst += t.maxScore
  }
  const list = [...map.values()]
  for (const s of list) s.pointDiff = s.pointsFor - s.pointsAgainst
  list.sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff)
  return list
}

/** Champion of a completed knockout (the winner of the final). */
export function champion(t: Tournament): PlayerId | null {
  if (t.mode !== 'knockout') return null
  const finalRound = t.matches.reduce((max, m) => Math.max(max, m.round), 0)
  const finalMatch = t.matches.find((m) => m.round === finalRound)
  if (!finalMatch || finalMatch.winnerSide === null) return null
  return finalMatch.winnerSide === 'a' ? finalMatch.a : finalMatch.b
}
