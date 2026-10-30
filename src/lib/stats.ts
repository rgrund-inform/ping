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
  /** Matches with a scoreline (win-only results have none). */
  scoredMatches: number
  /**
   * Average finish with each match scaled to a game to 7, so tournaments with
   * different `maxScore` compare. null when no match has a scoreline.
   */
  avgFor: number | null
  avgAgainst: number | null
}

/** Score scale `avgFor` / `avgAgainst` are normalised to. */
export const NORMALISED_MAX_SCORE = 7

export interface RecentResult {
  matchId: string
  tournamentId: string
  tournamentName: string
  opponentId: PlayerId
  opponentName: string
  win: boolean
  /** null for a win-only (quick mode) result, which has no scoreline. */
  selfScore: number | null
  /** null for a win-only (quick mode) result, which has no scoreline. */
  opponentScore: number | null
  playedAt: number
}

interface RealMatch {
  id: string
  a: PlayerId
  b: PlayerId
  winnerSide: 'a' | 'b'
  /** null when the match was recorded win-only (quick mode). */
  loserScore: number | null
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
        loserScore: m.loserScore,
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
    if (w.lastResults.length < 10) w.lastResults.push('W')
    l.matches++
    l.losses++
    if (l.lastResults.length < 10) l.lastResults.push('L')
    // Win-only results count towards matches, W/L and win rate, but have no
    // scoreline to fold into the points columns.
    if (m.loserScore !== null) {
      w.pointsFor += m.maxScore
      w.pointsAgainst += m.loserScore
      l.pointsFor += m.loserScore
      l.pointsAgainst += m.maxScore
    }
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

/** `since` limits the matches to those played at or after that timestamp. */
export function playerHeadToHead(
  pid: PlayerId,
  players: Record<PlayerId, Player>,
  tournaments: Tournament[],
  since = 0,
): HeadToHead[] {
  const map = new Map<PlayerId, HeadToHead>()
  // Running totals of the normalised scores, averaged once at the end.
  const sums = new Map<PlayerId, { for: number; against: number }>()
  for (const m of realMatches(tournaments)) {
    if (m.a !== pid && m.b !== pid) continue
    if (m.playedAt < since) continue
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
        scoredMatches: 0,
        avgFor: null,
        avgAgainst: null,
      }
      map.set(opponent, h)
      sums.set(opponent, { for: 0, against: 0 })
    }
    h.matches++
    if (isWin) h.wins++
    else h.losses++
    if (m.loserScore !== null) {
      const self = isWin ? m.maxScore : m.loserScore
      const other = isWin ? m.loserScore : m.maxScore
      h.pointsFor += self
      h.pointsAgainst += other
      h.scoredMatches++
      const scale = NORMALISED_MAX_SCORE / m.maxScore
      const sum = sums.get(opponent)!
      sum.for += self * scale
      sum.against += other * scale
    }
  }
  for (const h of map.values()) {
    h.winRate = h.matches === 0 ? 0 : h.wins / h.matches
    if (h.scoredMatches > 0) {
      const sum = sums.get(h.opponentId)!
      h.avgFor = sum.for / h.scoredMatches
      h.avgAgainst = sum.against / h.scoredMatches
    }
  }
  return [...map.values()].sort(
    (a, b) => b.matches - a.matches || b.winRate - a.winRate,
  )
}

export interface Rival extends HeadToHead {
  /** 0 = dead even, 1 = completely one-sided. */
  gap: number
}

export interface Rivals {
  allTime: Rival | null
  /** Only matches from the last `RIVAL_WINDOW_DAYS` days. */
  current: Rival | null
}

export const RIVAL_WINDOW_DAYS = 30
const RIVAL_MIN_MATCHES_ALL_TIME = 3
const RIVAL_MIN_MATCHES_CURRENT = 2

/**
 * How one-sided a head-to-head is: the mean of the W-L imbalance and the
 * normalised score margin (W-L only when no match has a scoreline).
 */
export function rivalryGap(h: HeadToHead): number {
  const balance = Math.abs(h.wins - h.losses) / h.matches
  if (h.avgFor === null || h.avgAgainst === null) return balance
  const margin = Math.abs(h.avgFor - h.avgAgainst) / NORMALISED_MAX_SCORE
  return (balance + margin) / 2
}

/** The closest opponent with enough matches; more matches break ties. */
function closest(rows: HeadToHead[], minMatches: number): Rival | null {
  const ranked = rows
    .filter((h) => h.matches >= minMatches)
    .map((h) => ({ ...h, gap: rivalryGap(h) }))
    .sort(
      (a, b) =>
        a.gap - b.gap ||
        b.matches - a.matches ||
        a.opponentName.localeCompare(b.opponentName),
    )
  return ranked[0] ?? null
}

export function playerRivals(
  pid: PlayerId,
  players: Record<PlayerId, Player>,
  tournaments: Tournament[],
  now: number = Date.now(),
): Rivals {
  const since = now - RIVAL_WINDOW_DAYS * 24 * 60 * 60 * 1000
  return {
    allTime: closest(playerHeadToHead(pid, players, tournaments), RIVAL_MIN_MATCHES_ALL_TIME),
    current: closest(
      playerHeadToHead(pid, players, tournaments, since),
      RIVAL_MIN_MATCHES_CURRENT,
    ),
  }
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
      selfScore: m.loserScore === null ? null : win ? m.maxScore : m.loserScore,
      opponentScore: m.loserScore === null ? null : win ? m.loserScore : m.maxScore,
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
