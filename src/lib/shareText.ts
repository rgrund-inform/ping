import type { Player, PlayerId, Tournament } from '../types'
import { champion, standings } from './scoring'

/**
 * Plain-text summary for the messenger share sheet: a headline, a progress
 * line, and the top of the table (or the champion). The link is appended by
 * the caller. Kept short so it reads well above a long URL in a chat bubble.
 */
export function shareSummaryText(
  tournament: Tournament,
  players: Record<PlayerId, Player>,
): string {
  const nameOf = (id: PlayerId | null) => (id ? players[id]?.name ?? '?' : '?')
  const playable = tournament.matches.filter((m) => !m.bye)
  const played = playable.filter((m) => m.winnerSide !== null).length
  const mode = tournament.mode === 'round-robin' ? 'Round-robin' : 'Knockout'
  const completed = tournament.status === 'completed'

  const lines = [
    `🏓 ${tournament.name}`,
    `${mode} · ${tournament.players.length} players · ${played}/${playable.length} matches`,
  ]

  if (played === 0) {
    lines.push('No matches played yet.')
  } else if (tournament.mode === 'knockout') {
    const champ = champion(tournament)
    lines.push(champ ? `🏆 ${nameOf(champ)}` : 'Bracket still in play.')
  } else {
    const top = standings(tournament)
      .filter((s) => s.played > 0)
      .slice(0, 3)
      .map((s, i) => {
        const rank = i === 0 && completed ? '🏆' : `${i + 1}.`
        return `${rank} ${nameOf(s.playerId)} ${s.wins}–${s.losses}`
      })
    lines.push(`${completed ? 'Final' : 'Leading'}: ${top.join(' · ')}`)
  }

  return lines.join('\n')
}
