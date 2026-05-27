import type { Match, PlayerId, Tournament } from '../types'
import { promoteWinner } from './bracket'

/** The next-round match an edge feeds into (knockout only). */
function nextBracketMatch(matches: Match[], m: Match): Match | undefined {
  return matches.find(
    (x) => x.round === m.round + 1 && x.slot === Math.floor((m.slot ?? 0) / 2),
  )
}

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
  if (match.winnerSide !== null) throw new Error('match already played; results are final')
  recordMatchResult(match, winnerSide, loserScore, tournament.maxScore)
  if (tournament.mode === 'knockout') {
    promoteWinner(tournament.matches, match)
  }
  if (isComplete(tournament) && tournament.status === 'running') {
    tournament.status = 'completed'
    tournament.completedAt = Date.now()
  }
}

/**
 * True if a played match can be safely re-scored. Round-robin matches are always
 * editable; knockout matches are editable only as long as the winner hasn't played
 * their next round yet (otherwise we'd have to cascade-clear results).
 */
export function canEditMatch(t: Tournament, m: Match): boolean {
  if (m.bye) return false
  if (m.a === null || m.b === null) return false
  if (m.winnerSide === null) return true
  if (t.mode === 'round-robin') return true
  const next = nextBracketMatch(t.matches, m)
  if (!next) return true
  return next.winnerSide === null
}

/**
 * Re-score an already-played match. For round-robin, just rewrites winner/score.
 * For knockout, also fixes the next-round slot if the winner changed; refuses if
 * the next-round match has already been played.
 */
export function editResult(
  tournament: Tournament,
  matchId: string,
  winnerSide: 'a' | 'b',
  loserScore: number,
): void {
  const match = tournament.matches.find((m) => m.id === matchId)
  if (!match) throw new Error('match not found')
  if (match.winnerSide === null) throw new Error('match has not been played; use recordResult')
  if (match.bye) throw new Error('cannot edit a bye')
  if (loserScore < 0 || loserScore >= tournament.maxScore) {
    throw new Error(`loserScore must be in [0, ${tournament.maxScore - 1}]`)
  }

  if (tournament.mode === 'knockout') {
    const next = nextBracketMatch(tournament.matches, match)
    if (next && next.winnerSide !== null) {
      throw new Error('downstream match already played; cannot edit')
    }
    const oldWinner = match.winnerSide === 'a' ? match.a : match.b
    const newWinner = winnerSide === 'a' ? match.a : match.b
    if (next && oldWinner !== newWinner) {
      const side = (match.slot ?? 0) % 2 === 0 ? 'a' : 'b'
      if (side === 'a') next.a = newWinner
      else next.b = newWinner
    }
  }

  match.winnerSide = winnerSide
  match.loserScore = loserScore
  match.playedAt = Date.now()

  // Recompute completion status; in practice this only flips if the final's
  // winner changed in a knockout (it stays completed either way).
  if (isComplete(tournament)) {
    if (tournament.status !== 'completed') {
      tournament.status = 'completed'
      tournament.completedAt = Date.now()
    }
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
