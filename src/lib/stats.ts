import type { Player, PlayerId, Tournament } from '../types'

export interface PlayerGlobalStats {
  playerId: PlayerId
  name: string
  tournaments: number
  matches: number
  wins: number
  losses: number
  winRate: number
  pointsFor: number
  pointsAgainst: number
  pointDiff: number
  /** Win count of the most recent matches first; useful for streak indicators. */
  lastResults: ('W' | 'L')[]
}

export interface HeadToHead {
  opponentId: PlayerId
  opponentName: string
  matches: number
  wins: number
  losses: number
  winRate: number
  pointsFor: number
  pointsAgainst: number
}

export interface RecentResult {
  matchId: string
  tournamentId: string
  tournamentName: string
  opponentId: PlayerId
  opponentName: string
  win: boolean
  selfScore: number
  opponentScore: number
  playedAt: number
}

interface RealMatch {
  id: string
  a: PlayerId
  b: PlayerId
  winnerSide: 'a' | 'b'
  loserScore: number
  maxScore: number
  playedAt: number
  tournamentId: string
  tournamentName: string
}

function realMatches(tournaments: Tournament[]): RealMatch[] {
  const out: RealMatch[] = []
  for (const t of tournaments) {
    for (const m of t.matches) {
      if (m.bye) continue
      if (m.winnerSide === null) continue
      if (m.a === null || m.b === null) continue
      out.push({
        id: m.id,
        a: m.a,
        b: m.b,
        winnerSide: m.winnerSide,
        loserScore: m.loserScore ?? 0,
        maxScore: t.maxScore,
        playedAt: m.playedAt ?? t.startedAt ?? t.createdAt,
        tournamentId: t.id,
        tournamentName: t.name,
      })
    }
  }
  return out
}

function nameOf(players: Record<PlayerId, Player>, id: PlayerId): string {
  return players[id]?.name ?? '?'
}

export function globalPlayerStats(
  players: Record<PlayerId, Player>,
  tournaments: Tournament[],
): PlayerGlobalStats[] {
  const stats = new Map<PlayerId, PlayerGlobalStats>()
  const tournamentSets = new Map<PlayerId, Set<string>>()

  for (const player of Object.values(players)) {
    stats.set(player.id, {
      playerId: player.id,
      name: player.name,
      tournaments: 0,
      matches: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      lastResults: [],
    })
    tournamentSets.set(player.id, new Set())
  }

  for (const t of tournaments) {
    for (const pid of t.players) {
      const set = tournamentSets.get(pid)
      if (set) set.add(t.id)
    }
  }

  const matches = realMatches(tournaments).sort((a, b) => b.playedAt - a.playedAt)
  for (const m of matches) {
    const winner = m.winnerSide === 'a' ? m.a : m.b
    const loser = m.winnerSide === 'a' ? m.b : m.a
    const w = stats.get(winner)
    const l = stats.get(loser)
    if (!w || !l) continue
    w.matches++
    w.wins++
    w.pointsFor += m.maxScore
    w.pointsAgainst += m.loserScore
    if (w.lastResults.length < 10) w.lastResults.push('W')
    l.matches++
    l.losses++
    l.pointsFor += m.loserScore
    l.pointsAgainst += m.maxScore
    if (l.lastResults.length < 10) l.lastResults.push('L')
  }

  for (const s of stats.values()) {
    s.tournaments = tournamentSets.get(s.playerId)?.size ?? 0
    s.winRate = s.matches === 0 ? 0 : s.wins / s.matches
    s.pointDiff = s.pointsFor - s.pointsAgainst
  }
  return [...stats.values()].sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches
    return b.winRate - a.winRate
  })
}

export function playerHeadToHead(
  pid: PlayerId,
  players: Record<PlayerId, Player>,
  tournaments: Tournament[],
): HeadToHead[] {
  const map = new Map<PlayerId, HeadToHead>()
  for (const m of realMatches(tournaments)) {
    if (m.a !== pid && m.b !== pid) continue
    const opponent = m.a === pid ? m.b : m.a
    const winnerId = m.winnerSide === 'a' ? m.a : m.b
    const isWin = winnerId === pid
    let h = map.get(opponent)
    if (!h) {
      h = {
        opponentId: opponent,
        opponentName: nameOf(players, opponent),
        matches: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      }
      map.set(opponent, h)
    }
    h.matches++
    if (isWin) {
      h.wins++
      h.pointsFor += m.maxScore
      h.pointsAgainst += m.loserScore
    } else {
      h.losses++
      h.pointsFor += m.loserScore
      h.pointsAgainst += m.maxScore
    }
  }
  for (const h of map.values()) {
    h.winRate = h.matches === 0 ? 0 : h.wins / h.matches
  }
  return [...map.values()].sort(
    (a, b) => b.matches - a.matches || b.winRate - a.winRate,
  )
}

export function recentResults(
  pid: PlayerId,
  players: Record<PlayerId, Player>,
  tournaments: Tournament[],
  n = 10,
): RecentResult[] {
  const out: RecentResult[] = []
  for (const m of realMatches(tournaments)) {
    if (m.a !== pid && m.b !== pid) continue
    const opponent = m.a === pid ? m.b : m.a
    const winnerId = m.winnerSide === 'a' ? m.a : m.b
    const win = winnerId === pid
    out.push({
      matchId: m.id,
      tournamentId: m.tournamentId,
      tournamentName: m.tournamentName,
      opponentId: opponent,
      opponentName: nameOf(players, opponent),
      win,
      selfScore: win ? m.maxScore : m.loserScore,
      opponentScore: win ? m.loserScore : m.maxScore,
      playedAt: m.playedAt,
    })
  }
  return out.sort((a, b) => b.playedAt - a.playedAt).slice(0, n)
}

export function currentStreak(results: ('W' | 'L')[]): { kind: 'W' | 'L'; n: number } | null {
  if (results.length === 0) return null
  const kind = results[0]
  let n = 0
  for (const r of results) {
    if (r === kind) n++
    else break
  }
  return { kind, n }
}
