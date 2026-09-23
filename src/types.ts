export type PlayerId = string
export type MatchId = string
export type TournamentId = string

export type TournamentMode = 'round-robin' | 'knockout'
/** How a result is recorded: full scoreline, or just the winner (quick mode). */
export type ScoringMode = 'points' | 'wins'
export type TournamentStatus = 'setup' | 'running' | 'completed'
export type Seeding = 'win-rate' | 'random'

export interface Player {
  id: PlayerId
  name: string
  createdAt: number
}

export interface Match {
  id: MatchId
  round: number
  /** Bracket-only: index of the slot in this round (0-based, left-to-right). */
  slot?: number
  a: PlayerId | null
  b: PlayerId | null
  winnerSide: 'a' | 'b' | null
  /**
   * 0..maxScore-1; null when the match is unplayed, an auto-bye, or was
   * recorded in a win-only tournament (`scoring: 'wins'`).
   */
  loserScore: number | null
  playedAt?: number
  /** Auto-advanced bye match (knockout only). */
  bye?: boolean
}

export interface Tournament {
  id: TournamentId
  name: string
  mode: TournamentMode
  /**
   * How results are recorded. 'points' stores the loser's score; 'wins'
   * records only the winner (quick mode). Undefined on tournaments created
   * before quick mode existed — treat it as 'points'.
   */
  scoring?: ScoringMode
  /** Winning score. Meaningless (and hidden) when `scoring` is 'wins'. */
  maxScore: number
  seeding?: Seeding
  status: TournamentStatus
  createdAt: number
  startedAt?: number
  completedAt?: number
  players: PlayerId[]
  matches: Match[]
  bracketLocked: boolean
}

export interface PingStore {
  version: 1
  players: Record<PlayerId, Player>
  tournaments: Tournament[]
}

export interface Fact {
  id: string
  text: string
  weight: number
  /** Players the fact is about, used to prefer relevant hype on the next-match screen. */
  playerIds?: PlayerId[]
}
