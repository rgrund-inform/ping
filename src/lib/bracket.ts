import type { Match, PlayerId } from '../types'
import { uid } from './id'

export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1
  return 1 << Math.ceil(Math.log2(n))
}

/**
 * Standard tournament seed order for a bracket of given size (must be power of 2).
 * Returns an array of length `size` where index i is the seed (1-based) at slot i.
 *
 * size=2 -> [1, 2]
 * size=4 -> [1, 4, 2, 3]
 * size=8 -> [1, 8, 4, 5, 2, 7, 3, 6]
 */
export function seedOrder(size: number): number[] {
  if (size === 1) return [1]
  const half = seedOrder(size / 2)
  const out: number[] = []
  for (const s of half) {
    out.push(s)
    out.push(size + 1 - s)
  }
  return out
}

/**
 * Build a single-elimination bracket. `seededPlayers` is an ordered list where
 * index 0 is the top seed. The bracket pads to nextPow2 with byes; byes are
 * placed against the top seeds (lowest seed numbers) per standard convention.
 */
export function buildBracket(seededPlayers: PlayerId[]): Match[] {
  const n = seededPlayers.length
  if (n < 2) return []

  const size = nextPowerOfTwo(n)
  const slots = seedOrder(size).map((seed) => (seed <= n ? seededPlayers[seed - 1] : null))

  const totalRounds = Math.log2(size)
  const matches: Match[] = []

  // Round 1: pair adjacent slots.
  for (let i = 0; i < size; i += 2) {
    const a = slots[i]
    const b = slots[i + 1]
    const isBye = a === null || b === null
    const presentSide: 'a' | 'b' | null = isBye ? (a !== null ? 'a' : 'b') : null
    matches.push({
      id: uid(),
      round: 1,
      slot: i / 2,
      a,
      b,
      winnerSide: isBye ? presentSide : null,
      loserScore: null,
      bye: isBye,
      playedAt: isBye ? Date.now() : undefined,
    })
  }

  // Rounds 2..N: empty placeholder slots.
  for (let r = 2; r <= totalRounds; r++) {
    const slotsInRound = size / 2 ** r
    for (let s = 0; s < slotsInRound; s++) {
      matches.push({
        id: uid(),
        round: r,
        slot: s,
        a: null,
        b: null,
        winnerSide: null,
        loserScore: null,
      })
    }
  }

  // Promote bye winners into round 2.
  for (const m of matches.filter((m) => m.round === 1 && m.bye)) {
    promoteWinner(matches, m)
  }

  return matches
}

/**
 * Write the winner of `m` into the appropriate slot of the next-round match.
 * In round r, slot s (0-indexed): two adjacent slots (2s, 2s+1) feed slot s in round r+1
 * (slot 2s -> 'a', slot 2s+1 -> 'b').
 */
export function promoteWinner(allMatches: Match[], m: Match): void {
  if (m.winnerSide === null) return
  const winner = m.winnerSide === 'a' ? m.a : m.b
  if (!winner) return

  const nextRound = m.round + 1
  const nextSlot = Math.floor((m.slot ?? 0) / 2)
  const next = allMatches.find((x) => x.round === nextRound && x.slot === nextSlot)
  if (!next) return

  const targetSide = (m.slot ?? 0) % 2 === 0 ? 'a' : 'b'
  if (targetSide === 'a') next.a = winner
  else next.b = winner

  // If the next match is now a bye (one side is null because the opposing
  // bracket slot was a bye that already advanced), it stays a regular match
  // until both sides are known. If both sides are set and one is null because
  // of a chain of byes, auto-advance once.
  if (
    (next.a !== null && next.b === null && allByesFedSide(allMatches, next, 'b')) ||
    (next.b !== null && next.a === null && allByesFedSide(allMatches, next, 'a'))
  ) {
    next.bye = true
    next.winnerSide = next.a !== null ? 'a' : 'b'
    next.playedAt = Date.now()
    promoteWinner(allMatches, next)
  }
}

function allByesFedSide(allMatches: Match[], next: Match, side: 'a' | 'b'): boolean {
  // Walk back: the side comes from a previous-round match whose slot is 2*next.slot+sideIdx.
  const prevRound = next.round - 1
  if (prevRound < 1) return false
  const prevSlot = (next.slot ?? 0) * 2 + (side === 'a' ? 0 : 1)
  const prev = allMatches.find((x) => x.round === prevRound && x.slot === prevSlot)
  if (!prev) return false
  if (prev.bye && (prev.a === null || prev.b === null)) {
    // The "winner" was a sole present side; if THAT match also has a null side, it was a chain bye.
    return prev.a === null && prev.b === null
  }
  return false
}

/**
 * Convenience: regenerate a fresh bracket. (Knockout brackets are normally locked
 * once started, so this is mainly for the setup phase.)
 */
export function buildSeededBracket(
  players: PlayerId[],
  seeding: 'random' | 'win-rate',
  rankFn: (id: PlayerId) => number,
): Match[] {
  const ordered = orderForSeeding(players, seeding, rankFn)
  return buildBracket(ordered)
}

export function orderForSeeding(
  players: PlayerId[],
  seeding: 'random' | 'win-rate',
  rankFn: (id: PlayerId) => number,
): PlayerId[] {
  if (seeding === 'random') {
    return shuffle([...players])
  }
  // Sort by descending win-rate; rankFn returns a sortable numeric score.
  return [...players].sort((a, b) => rankFn(b) - rankFn(a))
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
