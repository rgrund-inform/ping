import type { Player, PlayerId, Tournament } from '../types'

export interface SuggestedPlayer {
  player: Player
  appearances: number
  lastSeen: number
  score: number
}

/**
 * Rank players for the "new tournament" picker.
 * Score is `appearances * recencyDecay`, where recency decays over ~14 days.
 */
export function suggestPlayers(
  players: Record<PlayerId, Player>,
  tournaments: Tournament[],
  now: number = Date.now(),
): SuggestedPlayer[] {
  const stats = new Map<PlayerId, { appearances: number; lastSeen: number }>()
  for (const t of tournaments) {
    const seenAt = t.startedAt ?? t.createdAt
    for (const pid of t.players) {
      const s = stats.get(pid) ?? { appearances: 0, lastSeen: 0 }
      s.appearances++
      s.lastSeen = Math.max(s.lastSeen, seenAt)
      stats.set(pid, s)
    }
  }
  const out: SuggestedPlayer[] = []
  for (const [pid, s] of stats) {
    const player = players[pid]
    if (!player) continue
    const days = Math.max(0, (now - s.lastSeen) / (1000 * 60 * 60 * 24))
    const decay = Math.exp(-days / 14)
    out.push({
      player,
      appearances: s.appearances,
      lastSeen: s.lastSeen,
      score: s.appearances * decay,
    })
  }
  out.sort((a, b) => b.score - a.score)
  return out
}

/** Historical win-rate for seeding (used by knockout `seeding: 'win-rate'`). */
export function historicalWinRate(
  pid: PlayerId,
  tournaments: Tournament[],
): number {
  let wins = 0
  let total = 0
  for (const t of tournaments) {
    for (const m of t.matches) {
      if (m.winnerSide === null || m.bye) continue
      if (m.a === null || m.b === null) continue
      if (m.a !== pid && m.b !== pid) continue
      total++
      const winner = m.winnerSide === 'a' ? m.a : m.b
      if (winner === pid) wins++
    }
  }
  if (total === 0) return 0.5 // neutral default for newcomers
  return wins / total
}
