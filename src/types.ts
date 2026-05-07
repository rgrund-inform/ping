export type PlayerId = string
export type MatchId = string
export type TournamentId = string

export type TournamentMode = 'round-robin' | 'knockout'
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
  /** 0..maxScore-1; null when match not yet played or auto-bye. */
  loserScore: number | null
  playedAt?: number
  /** Auto-advanced bye match (knockout only). */
  bye?: boolean
}

export interface Tournament {
  id: TournamentId
  name: string
  mode: TournamentMode
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
