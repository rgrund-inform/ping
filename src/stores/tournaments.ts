import { defineStore } from 'pinia'
import type {
  Match,
  Player,
  PlayerId,
  Seeding,
  Tournament,
  TournamentId,
  TournamentMode,
} from '@/types'
import { uid } from '@/lib/id'
import { buildRoundRobinMatches, regenerateRoundRobin } from '@/lib/schedule'
import { buildSeededBracket } from '@/lib/bracket'
import { applyResult, isComplete, nextMatches, standings } from '@/lib/scoring'
import { historicalWinRate, suggestPlayers } from '@/lib/suggestions'

interface State {
  version: 1
  players: Record<PlayerId, Player>
  tournaments: Tournament[]
}

export const useTournamentsStore = defineStore('ping', {
  state: (): State => ({
    version: 1,
    players: {},
    tournaments: [],
  }),

  getters: {
    tournament:
      (state) =>
      (id: TournamentId): Tournament | undefined =>
        state.tournaments.find((t) => t.id === id),

    sortedTournaments: (state) =>
      [...state.tournaments].sort((a, b) => b.createdAt - a.createdAt),

    playerList: (state) =>
      Object.values(state.players).sort((a, b) => a.name.localeCompare(b.name)),

    suggested:
      (state): ReturnType<typeof suggestPlayers> =>
        suggestPlayers(state.players, state.tournaments),
  },

  actions: {
    // ---- players ----
    upsertPlayer(name: string): Player {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('name required')
      const existing = Object.values(this.players).find(
        (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
      )
      if (existing) return existing
      const player: Player = { id: uid(), name: trimmed, createdAt: Date.now() }
      this.players[player.id] = player
      return player
    },

    renamePlayer(id: PlayerId, name: string): void {
      const p = this.players[id]
      if (!p) return
      const trimmed = name.trim()
      if (!trimmed) return
      p.name = trimmed
    },

    deletePlayer(id: PlayerId): void {
      const inUse = this.tournaments.some((t) => t.players.includes(id))
      if (inUse) throw new Error('player participated in a tournament; cannot delete')
      delete this.players[id]
    },

    // ---- tournaments ----
    createTournament(input: {
      name: string
      mode: TournamentMode
      maxScore: number
      seeding?: Seeding
      players: PlayerId[]
    }): Tournament {
      const t: Tournament = {
        id: uid(),
        name: input.name.trim() || 'Tournament',
        mode: input.mode,
        maxScore: input.maxScore,
        seeding: input.mode === 'knockout' ? input.seeding ?? 'win-rate' : undefined,
        status: 'setup',
        createdAt: Date.now(),
        players: [...input.players],
        matches: [],
        bracketLocked: false,
      }
      this.tournaments.push(t)
      return t
    },

    setSeedOrder(id: TournamentId, order: PlayerId[]): void {
      const t = this.tournament(id)
      if (!t || t.status !== 'setup') return
      // Replace the roster with the given order; only allowed for knockout.
      if (t.mode !== 'knockout') return
      t.players = [...order]
    },

    startTournament(id: TournamentId): void {
      const t = this.tournament(id)
      if (!t || t.status !== 'setup') return
      if (t.players.length < 2) throw new Error('need at least 2 players')

      if (t.mode === 'round-robin') {
        t.matches = buildRoundRobinMatches(t.players)
      } else {
        t.matches = buildSeededBracket(
          t.players,
          t.seeding ?? 'win-rate',
          (pid) => historicalWinRate(pid, this.tournaments),
        )
        t.bracketLocked = true
      }
      t.status = 'running'
      t.startedAt = Date.now()
    },

    addPlayerToTournament(id: TournamentId, pid: PlayerId): void {
      const t = this.tournament(id)
      if (!t) return
      if (t.players.includes(pid)) return
      if (t.mode === 'knockout' && t.bracketLocked) {
        throw new Error('knockout brackets are locked once started')
      }
      t.players.push(pid)
      if (t.status === 'running' && t.mode === 'round-robin') {
        t.matches = regenerateRoundRobin(t.matches, t.players)
      }
    },

    removePlayerFromTournament(id: TournamentId, pid: PlayerId): void {
      const t = this.tournament(id)
      if (!t) return
      if (t.mode === 'knockout' && t.bracketLocked) {
        throw new Error('knockout brackets are locked once started')
      }
      t.players = t.players.filter((p) => p !== pid)
      if (t.status === 'running' && t.mode === 'round-robin') {
        t.matches = regenerateRoundRobin(t.matches, t.players)
      }
    },

    recordResult(
      tournamentId: TournamentId,
      matchId: string,
      winnerSide: 'a' | 'b',
      loserScore: number,
    ): void {
      const t = this.tournament(tournamentId)
      if (!t) return
      applyResult(t, matchId, winnerSide, loserScore)
    },

    // ---- views ----
    nextMatchesFor(id: TournamentId, n = 5): Match[] {
      const t = this.tournament(id)
      return t ? nextMatches(t, n) : []
    },

    standingsFor(id: TournamentId): ReturnType<typeof standings> {
      const t = this.tournament(id)
      return t ? standings(t) : []
    },

    isCompletedTournament(id: TournamentId): boolean {
      const t = this.tournament(id)
      return t ? isComplete(t) : false
    },

    deleteTournament(id: TournamentId): void {
      this.tournaments = this.tournaments.filter((t) => t.id !== id)
    },
  },

  persist: {
    key: 'ping.v1',
    storage: localStorage,
  },
})
