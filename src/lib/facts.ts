import type { Fact, Match, Player, PlayerId, Tournament } from '../types'

export interface FactInput {
  players: Record<PlayerId, Player>
  tournaments: Tournament[]
  /** Optional: anchor "today" to a specific time (defaults to Date.now()). */
  now?: number
}

interface PlayedMatch extends Match {
  tournament: Tournament
}

function allPlayedMatches(input: FactInput): PlayedMatch[] {
  const out: PlayedMatch[] = []
  for (const t of input.tournaments) {
    for (const m of t.matches) {
      if (m.winnerSide === null || m.bye) continue
      if (m.a === null || m.b === null) continue
      out.push({ ...m, tournament: t })
    }
  }
  return out.sort((a, b) => (a.playedAt ?? 0) - (b.playedAt ?? 0))
}

function nameOf(input: FactInput, id: PlayerId | null): string {
  if (!id) return '?'
  return input.players[id]?.name ?? '?'
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

type Generator = (input: FactInput, played: PlayedMatch[]) => Fact[]

const generators: Generator[] = [
  // Head-to-head dominance
  (input, played) => {
    const pairs = new Map<string, { a: PlayerId; b: PlayerId; aw: number; bw: number }>()
    for (const m of played) {
      const [x, y] = m.a! < m.b! ? [m.a!, m.b!] : [m.b!, m.a!]
      const key = `${x}|${y}`
      let p = pairs.get(key)
      if (!p) {
        p = { a: x, b: y, aw: 0, bw: 0 }
        pairs.set(key, p)
      }
      const winner = m.winnerSide === 'a' ? m.a! : m.b!
      if (winner === x) p.aw++
      else p.bw++
    }
    const facts: Fact[] = []
    for (const p of pairs.values()) {
      const total = p.aw + p.bw
      if (total < 5) continue
      const aRate = p.aw / total
      if (aRate >= 0.7) {
        facts.push({
          id: `h2h:${p.a}:${p.b}`,
          text: `${nameOf(input, p.a)} beats ${nameOf(input, p.b)} in ${Math.round(aRate * 100)}% of their matches (${p.aw} of ${total}).`,
          weight: 3,
          playerIds: [p.a, p.b],
        })
      } else if (1 - aRate >= 0.7) {
        facts.push({
          id: `h2h:${p.b}:${p.a}`,
          text: `${nameOf(input, p.b)} beats ${nameOf(input, p.a)} in ${Math.round((1 - aRate) * 100)}% of their matches (${p.bw} of ${total}).`,
          weight: 3,
          playerIds: [p.a, p.b],
        })
      }
    }
    return facts
  },

  // Hot streak today (>= 3 wins in a row, today)
  (input, played) => {
    const today = startOfDay(input.now ?? Date.now())
    const todays = played.filter((m) => (m.playedAt ?? 0) >= today)
    const streaks = new Map<PlayerId, number>()
    const lossSinceStreak = new Map<PlayerId, boolean>()
    for (const m of todays) {
      const winner = m.winnerSide === 'a' ? m.a! : m.b!
      const loser = m.winnerSide === 'a' ? m.b! : m.a!
      if (lossSinceStreak.get(winner)) {
        streaks.set(winner, 1)
        lossSinceStreak.set(winner, false)
      } else {
        streaks.set(winner, (streaks.get(winner) ?? 0) + 1)
      }
      lossSinceStreak.set(loser, true)
      streaks.set(loser, 0)
    }
    const facts: Fact[] = []
    for (const [pid, n] of streaks) {
      if (n >= 3) {
        facts.push({
          id: `streak:${pid}`,
          text: `${nameOf(input, pid)} is on fire — ${n} wins in a row today.`,
          weight: 4,
          playerIds: [pid],
        })
      }
    }
    return facts
  },

  // Most-played rivalry
  (input, played) => {
    const pairs = new Map<string, { a: PlayerId; b: PlayerId; n: number }>()
    for (const m of played) {
      const [x, y] = m.a! < m.b! ? [m.a!, m.b!] : [m.b!, m.a!]
      const key = `${x}|${y}`
      const p = pairs.get(key) ?? { a: x, b: y, n: 0 }
      p.n++
      pairs.set(key, p)
    }
    const top = [...pairs.values()].sort((a, b) => b.n - a.n)[0]
    if (!top || top.n < 5) return []
    return [
      {
        id: `rivalry:${top.a}:${top.b}`,
        text: `${nameOf(input, top.a)} vs ${nameOf(input, top.b)}: ${top.n} matches — the all-time top rivalry.`,
        weight: 1,
        playerIds: [top.a, top.b],
      },
    ]
  },

  // Closest rivalry: smallest avg loser-score gap (loser comes the closest to maxScore)
  (input, played) => {
    const pairs = new Map<
      string,
      { a: PlayerId; b: PlayerId; n: number; sumLoser: number; sumMax: number }
    >()
    for (const m of played) {
      const [x, y] = m.a! < m.b! ? [m.a!, m.b!] : [m.b!, m.a!]
      const key = `${x}|${y}`
      const p = pairs.get(key) ?? { a: x, b: y, n: 0, sumLoser: 0, sumMax: 0 }
      p.n++
      p.sumLoser += m.loserScore ?? 0
      p.sumMax += m.tournament.maxScore
      pairs.set(key, p)
    }
    const eligible = [...pairs.values()].filter((p) => p.n >= 4)
    if (eligible.length === 0) return []
    const tightest = eligible.sort((a, b) => {
      const aGap = a.sumMax / a.n - a.sumLoser / a.n
      const bGap = b.sumMax / b.n - b.sumLoser / b.n
      return aGap - bGap
    })[0]
    const avgLoser = Math.round(tightest.sumLoser / tightest.n)
    const avgMax = Math.round(tightest.sumMax / tightest.n)
    return [
      {
        id: `tight:${tightest.a}:${tightest.b}`,
        text: `${nameOf(input, tightest.a)} vs ${nameOf(input, tightest.b)} — average finish ${avgMax}-${avgLoser}, every game's a nail-biter.`,
        weight: 2,
        playerIds: [tightest.a, tightest.b],
      },
    ]
  },

  // Newcomer first win
  (input, played) => {
    const today = startOfDay(input.now ?? Date.now())
    const facts: Fact[] = []
    const wonBefore = new Set<PlayerId>()
    for (const m of played) {
      if ((m.playedAt ?? 0) < today) {
        const w = m.winnerSide === 'a' ? m.a! : m.b!
        wonBefore.add(w)
      }
    }
    const todaysWinners = new Set<PlayerId>()
    for (const m of played) {
      if ((m.playedAt ?? 0) >= today) {
        todaysWinners.add(m.winnerSide === 'a' ? m.a! : m.b!)
      }
    }
    for (const id of todaysWinners) {
      if (!wonBefore.has(id)) {
        facts.push({
          id: `firstwin:${id}`,
          text: `${nameOf(input, id)} just won their first match. Welcome to the wall.`,
          weight: 5,
          playerIds: [id],
        })
      }
    }
    return facts
  },

  // Today's record for the most active players
  (input, played) => {
    const today = startOfDay(input.now ?? Date.now())
    const todays = played.filter((m) => (m.playedAt ?? 0) >= today)
    const tally = new Map<PlayerId, { w: number; l: number }>()
    for (const m of todays) {
      const w = m.winnerSide === 'a' ? m.a! : m.b!
      const l = m.winnerSide === 'a' ? m.b! : m.a!
      const tw = tally.get(w) ?? { w: 0, l: 0 }
      tw.w++
      tally.set(w, tw)
      const tl = tally.get(l) ?? { w: 0, l: 0 }
      tl.l++
      tally.set(l, tl)
    }
    const facts: Fact[] = []
    for (const [pid, rec] of tally) {
      const total = rec.w + rec.l
      if (total < 4) continue
      if (rec.l === 0) {
        facts.push({
          id: `today-undefeated:${pid}`,
          text: `Today: ${nameOf(input, pid)} ${rec.w}-${rec.l}, undefeated.`,
          weight: 4,
          playerIds: [pid],
        })
      } else if (rec.w / total >= 0.75) {
        facts.push({
          id: `today-strong:${pid}`,
          text: `Today: ${nameOf(input, pid)} ${rec.w}-${rec.l}, dominating.`,
          weight: 2,
          playerIds: [pid],
        })
      }
    }
    return facts
  },
]

export function generateFacts(input: FactInput): Fact[] {
  const played = allPlayedMatches(input)
  const all: Fact[] = []
  for (const g of generators) {
    try {
      all.push(...g(input, played))
    } catch {
      // ignore one generator's failure
    }
  }
  // Deduplicate by id (keep highest weight).
  const dedup = new Map<string, Fact>()
  for (const f of all) {
    const cur = dedup.get(f.id)
    if (!cur || cur.weight < f.weight) dedup.set(f.id, f)
  }
  return [...dedup.values()]
}

/**
 * Return facts that mention at least one of the given players.
 * Used to surface hype before an upcoming match.
 */
export function factsAboutPlayers(facts: Fact[], ids: PlayerId[]): Fact[] {
  if (ids.length === 0) return []
  const set = new Set(ids)
  return facts.filter((f) => f.playerIds?.some((id) => set.has(id)))
}

/** Pick a weighted-random fact, optionally avoiding the previously shown one. */
export function pickFact(facts: Fact[], avoidId?: string): Fact | null {
  const pool = avoidId ? facts.filter((f) => f.id !== avoidId) : facts
  if (pool.length === 0) return facts[0] ?? null
  const total = pool.reduce((acc, f) => acc + f.weight, 0)
  let r = Math.random() * total
  for (const f of pool) {
    r -= f.weight
    if (r <= 0) return f
  }
  return pool[pool.length - 1]
}
