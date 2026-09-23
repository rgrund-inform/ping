import type { Tournament } from '../types'

type ModeFields = Pick<Tournament, 'mode' | 'scoring'>

/**
 * Quick mode: results record only the winner, no scores. Stored as a
 * round-robin with `scoring: 'wins'` so every round-robin code path (schedule,
 * regeneration, standings, roster edits) keeps working unchanged.
 */
export function isWinOnly(t: ModeFields): boolean {
  return t.scoring === 'wins'
}

/** Human label for the tournament's mode, as shown on cards and tags. */
export function modeLabel(t: ModeFields): string {
  if (t.mode === 'knockout') return 'Knockout'
  return isWinOnly(t) ? 'Quick' : 'Round-robin'
}
