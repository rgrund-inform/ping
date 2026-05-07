import type { Match, PlayerId } from '../types'
import { uid } from './id'

/**
 * Round-robin scheduling using the circle method.
 * Returns a list of rounds; each round is a list of [a, b] pairings.
 * Pairs containing `null` mean a sit-out (only when the player count is odd).
 */
export function roundRobinPairings(players: PlayerId[]): [PlayerId | null, PlayerId | null][][] {
  const ps: (PlayerId | null)[] = [...players]
  if (ps.length < 2) return []
  if (ps.length % 2 === 1) ps.push(null)

  const n = ps.length
  const rounds: [PlayerId | null, PlayerId | null][][] = []
  // Fix the first player; rotate the rest.
  const fixed = ps[0]
  let rotating = ps.slice(1)

  for (let r = 0; r < n - 1; r++) {
    const arrangement = [fixed, ...rotating]
    const round: [PlayerId | null, PlayerId | null][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = arrangement[i]
      const b = arrangement[n - 1 - i]
      round.push([a ?? null, b ?? null])
    }
    rounds.push(round)
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)]
  }
  return rounds
}

export function buildRoundRobinMatches(players: PlayerId[]): Match[] {
  const rounds = roundRobinPairings(players)
  const matches: Match[] = []
  rounds.forEach((round, ri) => {
    round.forEach(([a, b]) => {
      if (a === null || b === null) return // skip sit-outs entirely
      matches.push({
        id: uid(),
        round: ri + 1,
        a,
        b,
        winnerSide: null,
        loserScore: null,
      })
    })
  })
  return matches
}

/**
 * Regenerate matches after the roster changes mid-tournament.
 * Rules:
 *  - Played matches (winnerSide !== null) are kept verbatim, even if a player has been removed.
 *  - All unplayed matches are discarded and regenerated for the current roster, *minus*
 *    pairings that have already been played (no rematches).
 *  - The new unplayed matches start at the next round number after the highest played round.
 */
export function regenerateRoundRobin(
  currentMatches: Match[],
  newRoster: PlayerId[],
): Match[] {
  const played = currentMatches.filter((m) => m.winnerSide !== null)
  const playedPair = new Set<string>()
  for (const m of played) {
    playedPair.add(pairKey(m.a!, m.b!))
  }

  const startRound = played.reduce((max, m) => Math.max(max, m.round), 0)
  const fresh = buildRoundRobinMatches(newRoster).filter(
    (m) => !playedPair.has(pairKey(m.a!, m.b!)),
  )
  const renumbered = fresh.map((m) => ({ ...m, round: m.round + startRound }))

  return [...played, ...renumbered]
}

function pairKey(a: PlayerId, b: PlayerId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}
