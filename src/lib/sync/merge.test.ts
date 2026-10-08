import { afterAll, describe, expect, setSystemTime, test } from 'bun:test'
import type { Match, PingStore, Player, Tournament, TournamentMode } from '../../types'
import { buildBracket } from '../bracket'
import { buildRoundRobinMatches, regenerateRoundRobin, shuffleUpcomingMatches } from '../schedule'
import { applyResult, editResult } from '../scoring'
import type { SyncRow } from './protocol'
import {
  applyRows,
  mergeMatch,
  mergePlayer,
  mergeRow,
  mergeTournament,
  normalizeTournament,
  rowsFor,
  stableStringify,
} from './merge'

const T0 = 1_760_000_000_000

afterAll(() => {
  setSystemTime()
})

// ---- fixture factories ----

function player(id: string, updatedAt = T0, name = id.toUpperCase()): Player {
  return { id, name, createdAt: T0, updatedAt }
}

function setupTournament(mode: TournamentMode, players: string[], id = `t-${mode}`): Tournament {
  return {
    id,
    name: 'Friday',
    mode,
    scoring: 'points',
    maxScore: 7,
    seeding: mode === 'knockout' ? 'win-rate' : undefined,
    status: 'setup',
    createdAt: T0,
    updatedAt: T0,
    players: [...players],
    matches: [],
    bracketLocked: false,
  }
}

/** Mirrors the store's startTournament with fixed time and no side flips. */
function start(t: Tournament, at = T0 + 1): Tournament {
  setSystemTime(new Date(at))
  const out = structuredClone(t)
  out.matches =
    t.mode === 'knockout' ? buildBracket(t.players) : buildRoundRobinMatches(t.players, () => 0.9)
  out.bracketLocked = t.mode === 'knockout'
  out.status = 'running'
  out.startedAt = at
  out.updatedAt = at
  return out
}

function findPair(t: Tournament, x: string, y: string, played = false): Match {
  const m = t.matches.find(
    (m) =>
      (m.winnerSide !== null) === played &&
      ((m.a === x && m.b === y) || (m.a === y && m.b === x)),
  )
  if (!m) throw new Error(`no ${played ? 'played' : 'unplayed'} match ${x} v ${y}`)
  return m
}

/** Record `winner` beating `loser` through applyResult, at a fixed time. Returns a copy. */
function play(t: Tournament, winner: string, loser: string, loserScore: number, at: number): Tournament {
  const out = structuredClone(t)
  const m = findPair(out, winner, loser)
  setSystemTime(new Date(at))
  applyResult(out, m.id, m.a === winner ? 'a' : 'b', loserScore)
  return out
}

/** Re-score an already-played match through editResult. Returns a copy. */
function edit(t: Tournament, winner: string, loser: string, loserScore: number, at: number): Tournament {
  const out = structuredClone(t)
  const m = findPair(out, winner, loser, true)
  setSystemTime(new Date(at))
  editResult(out, m.id, m.a === winner ? 'a' : 'b', loserScore)
  return out
}

const pairOf = (m: Match) => [m.a, m.b].sort().join('|')
const same = (x: unknown, y: unknown) => expect(stableStringify(x)).toBe(stableStringify(y))
const byRoundSlot = (t: Tournament, round: number, slot: number) =>
  t.matches.find((m) => m.round === round && m.slot === slot)!

// ---- scenarios (shared by the targeted tests and the property tests) ----

const RR = ['p1', 'p2', 'p3', 'p4']

function rrDisjoint() {
  const base = start(setupTournament('round-robin', RR))
  return { base, a: play(base, 'p1', 'p2', 3, T0 + 10), b: play(base, 'p3', 'p4', 5, T0 + 20) }
}

function rrSameMatch() {
  const base = start(setupTournament('round-robin', RR))
  return { base, a: play(base, 'p1', 'p2', 3, T0 + 10), b: play(base, 'p2', 'p1', 6, T0 + 20) }
}

function rrPlayedVsNewerUnplayed() {
  const base = start(setupTournament('round-robin', RR))
  const a = play(base, 'p1', 'p2', 3, T0 + 10)
  // B touched the schedule later (rename) but never recorded the match.
  const b = { ...structuredClone(base), name: 'Renamed', updatedAt: T0 + 50 }
  return { base, a, b }
}

function rrRosterAdd() {
  const base = start(setupTournament('round-robin', RR))
  const a = structuredClone(base)
  a.players.push('p5')
  a.matches = regenerateRoundRobin(a.matches, a.players, () => 0.9)
  a.updatedAt = T0 + 30
  const b = play(base, 'p1', 'p2', 4, T0 + 40)
  return { base, a, b }
}

function rrShuffle() {
  const base = play(start(setupTournament('round-robin', RR)), 'p1', 'p2', 1, T0 + 5)
  const a = structuredClone(base)
  let seed = 7
  a.matches = shuffleUpcomingMatches(a.matches, () => ((seed = (seed * 9301 + 49297) % 233280) / 233280))
  a.updatedAt = T0 + 30
  const b = play(base, 'p3', 'p4', 2, T0 + 40)
  return { base, a, b }
}

const KO4 = ['p1', 'p2', 'p3', 'p4'] // R1: slot 0 = (p1,p4), slot 1 = (p2,p3)

function koParallelR1() {
  const base = start(setupTournament('knockout', KO4))
  return { base, a: play(base, 'p1', 'p4', 3, T0 + 10), b: play(base, 'p3', 'p2', 5, T0 + 20) }
}

const KO5 = ['p1', 'p2', 'p3', 'p4', 'p5']
// Slots [p1, -, p4, p5, p2, -, p3, -]: R1 slot 0/2/3 are byes, slot 1 = (p4,p5);
// R2 slot 0 = (p1, winner p4/p5), slot 1 = (p2, p3); R3 is the final.

function koByes() {
  const base = start(setupTournament('knockout', KO5))
  const a = play(play(base, 'p4', 'p5', 2, T0 + 10), 'p1', 'p4', 3, T0 + 20)
  const b = play(base, 'p2', 'p3', 4, T0 + 15)
  const merged = mergeTournament(a, b)
  const final = play(merged, 'p2', 'p1', 6, T0 + 30)
  return { base, a, b, merged, final }
}

function koEditConflict() {
  const shared = play(play(start(setupTournament('knockout', KO4)), 'p1', 'p4', 3, T0 + 10), 'p2', 'p3', 4, T0 + 11)
  const a = edit(shared, 'p4', 'p1', 5, T0 + 30)
  const b = play(shared, 'p1', 'p2', 6, T0 + 20)
  return { shared, a, b }
}

function setupVsStarted() {
  const setup = setupTournament('round-robin', RR)
  const b = start(setup, T0 + 50)
  const a = { ...structuredClone(setup), name: 'Renamed', players: ['p4', 'p3', 'p2', 'p1'], updatedAt: T0 + 100 }
  return { a, b }
}

// ---- tests ----

describe('stableStringify', () => {
  test('sorts keys at every depth and skips undefined like JSON.stringify', () => {
    expect(stableStringify({ b: 1, a: { d: [1, undefined], c: undefined } })).toBe(
      '{"a":{"d":[1,null]},"b":1}',
    )
    expect(stableStringify({ x: 1, y: 2 })).toBe(stableStringify({ y: 2, x: 1 }))
    expect(stableStringify(null)).toBe('null')
    expect(stableStringify('s')).toBe('"s"')
  })
})

describe('1. mergePlayer', () => {
  test('newer updatedAt wins', () => {
    const old = player('p1', T0, 'Old')
    const fresh = player('p1', T0 + 5, 'New')
    expect(mergePlayer(old, fresh).name).toBe('New')
    expect(mergePlayer(fresh, old).name).toBe('New')
  })

  test('tie is deterministic and symmetric', () => {
    const x = player('p1', T0, 'Anna')
    const y = player('p1', T0, 'Zoe')
    same(mergePlayer(x, y), mergePlayer(y, x))
    expect(mergePlayer(x, y).name).toBe('Anna')
  })
})

describe('2. tombstones', () => {
  const tomb: SyncRow = { kind: 'player', id: 'p1', body: null, deletedAt: T0 + 1 }
  const later: SyncRow = { kind: 'player', id: 'p1', body: player('p1', T0 + 999) }

  test('a tombstone beats a later-updated body in either order', () => {
    expect(mergeRow(tomb, later)).toEqual(tomb)
    expect(mergeRow(later, tomb)).toEqual(tomb)
  })

  test('the first tombstone is kept (no churn)', () => {
    const other: SyncRow = { kind: 'player', id: 'p1', body: null, deletedAt: T0 + 50 }
    expect(mergeRow(tomb, other)).toEqual(tomb)
  })

  test('applyRows deletes and never resurrects', () => {
    const store: PingStore = {
      version: 2,
      players: { p1: player('p1'), p2: player('p2') },
      tournaments: [],
      tombstones: {},
    }
    const deleted = applyRows(store, [tomb])
    expect(deleted.players.p1).toBeUndefined()
    expect(deleted.tombstones.p1).toEqual({ kind: 'player', id: 'p1', deletedAt: T0 + 1 })
    const again = applyRows(deleted, [later])
    expect(again.players.p1).toBeUndefined()
    // Input untouched.
    expect(store.players.p1).toBeDefined()
    expect(store.tombstones).toEqual({})
  })
})

describe('3–7. round-robin', () => {
  test('3. disjoint results from two devices are both kept, no duplicate pairings', () => {
    const { a, b } = rrDisjoint()
    const m = mergeTournament(a, b)
    expect(m.matches).toHaveLength(6)
    expect(new Set(m.matches.map(pairOf)).size).toBe(6)
    expect(findPair(m, 'p1', 'p2', true).winnerSide).not.toBeNull()
    expect(findPair(m, 'p3', 'p4', true).loserScore).toBe(5)
    expect(m.status).toBe('running')
  })

  test('4. the same match played twice → later playedAt wins', () => {
    const { a, b } = rrSameMatch()
    for (const m of [mergeTournament(a, b), mergeTournament(b, a)]) {
      const match = findPair(m, 'p1', 'p2', true)
      expect(match.playedAt).toBe(T0 + 20)
      expect(match.loserScore).toBe(6)
      expect(match[match.winnerSide!]).toBe('p2')
    }
  })

  test('5. played beats unplayed even when the unplayed side is newer', () => {
    const { a, b } = rrPlayedVsNewerUnplayed()
    const m = mergeTournament(a, b)
    expect(findPair(m, 'p1', 'p2', true).loserScore).toBe(3)
    expect(m.name).toBe('Renamed')
    expect(m.updatedAt).toBe(T0 + 50)
  })

  test('6. roster add + concurrent old-id result: result kept, roster from the add', () => {
    const { a, b } = rrRosterAdd()
    const m = mergeTournament(a, b)
    expect(m.players).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(m.matches).toHaveLength(10)
    expect(new Set(m.matches.map(pairOf)).size).toBe(10)
    const played = findPair(m, 'p1', 'p2', true)
    // The old match id from B survives so both devices converge on it.
    expect(played.id).toBe(findPair(b, 'p1', 'p2', true).id)
    expect(played.loserScore).toBe(4)
  })

  test('7. shuffle + concurrent result: result kept, shuffled order kept, rounds renumbered', () => {
    const { a, b } = rrShuffle()
    const m = mergeTournament(a, b)
    const played = m.matches.filter((x) => x.winnerSide !== null)
    const upcoming = m.matches.filter((x) => x.winnerSide === null)
    expect(played.map(pairOf)).toEqual(['p1|p2', 'p3|p4'])
    const p34 = findPair(b, 'p3', 'p4', true).id
    expect(upcoming.map((x) => x.id)).toEqual(
      a.matches.filter((x) => x.winnerSide === null && x.id !== p34).map((x) => x.id),
    )
    const maxPlayed = Math.max(...played.map((x) => x.round))
    expect(upcoming.map((x) => x.round)).toEqual(upcoming.map((_, i) => maxPlayed + i + 1))
  })
})

describe('8–10. knockout', () => {
  test('8. parallel round-1 results both feed round 2', () => {
    const { a, b } = koParallelR1()
    const m = mergeTournament(a, b)
    const r2 = byRoundSlot(m, 2, 0)
    expect(r2.a).toBe('p1')
    expect(r2.b).toBe('p3')
    expect(r2.winnerSide).toBeNull()
    expect(m.status).toBe('running')
  })

  test('9. five players: byes survive, final completes the merge', () => {
    const { a, b, merged, final } = koByes()
    const byes = merged.matches.filter((x) => x.bye)
    expect(byes.map((x) => x.slot)).toEqual([0, 2, 3])
    expect(byes.every((x) => x.round === 1 && x.winnerSide === 'a')).toBe(true)
    expect(byRoundSlot(merged, 3, 0).a).toBe('p1')
    expect(byRoundSlot(merged, 3, 0).b).toBe('p2')
    expect(merged.status).toBe('running')
    expect(merged.completedAt).toBeUndefined()

    for (const stale of [a, b]) {
      const m = mergeTournament(final, stale)
      expect(m.status).toBe('completed')
      expect(m.completedAt).toBe(T0 + 30)
      expect(m.matches.filter((x) => x.bye)).toHaveLength(3)
    }
  })

  test('10. an edited round-1 winner clears a round-2 result recorded with the old winner', () => {
    const { a, b } = koEditConflict()
    expect(b.status).toBe('completed')
    const m = mergeTournament(a, b)
    const r1 = byRoundSlot(m, 1, 0)
    expect(r1[r1.winnerSide!]).toBe('p4')
    const r2 = byRoundSlot(m, 2, 0)
    expect(r2.a).toBe('p4')
    expect(r2.b).toBe('p2')
    expect(r2.winnerSide).toBeNull()
    expect(r2.playedAt).toBeUndefined()
    expect(m.status).toBe('running')
    expect(m.completedAt).toBeUndefined()
  })
})

describe('11. schedule ownership', () => {
  test('the started side owns the schedule regardless of updatedAt', () => {
    const { a, b } = setupVsStarted()
    for (const m of [mergeTournament(a, b), mergeTournament(b, a)]) {
      expect(m.status).toBe('running')
      expect(m.players).toEqual(b.players)
      expect(m.matches.map((x) => x.id)).toEqual(b.matches.map((x) => x.id))
      expect(m.startedAt).toBe(T0 + 50)
      // Metadata still comes from the newer side.
      expect(m.name).toBe('Renamed')
      expect(m.updatedAt).toBe(T0 + 100)
    }
  })
})

describe('12. properties', () => {
  const pairs: [string, Tournament, Tournament][] = []
  const add = (name: string, x: Tournament, y: Tournament) => pairs.push([name, x, y])
  {
    const s = rrDisjoint()
    add('rr disjoint', s.a, s.b)
    add('rr base vs a', s.base, s.a)
  }
  {
    const s = rrSameMatch()
    add('rr same match', s.a, s.b)
  }
  {
    const s = rrPlayedVsNewerUnplayed()
    add('rr played vs newer unplayed', s.a, s.b)
  }
  {
    const s = rrRosterAdd()
    add('rr roster add', s.a, s.b)
    add('rr roster add vs base', s.a, s.base)
  }
  {
    const s = rrShuffle()
    add('rr shuffle', s.a, s.b)
  }
  {
    const s = koParallelR1()
    add('ko parallel r1', s.a, s.b)
  }
  {
    const s = koByes()
    add('ko byes', s.a, s.b)
    add('ko byes final vs a', s.final, s.a)
    add('ko byes final vs b', s.final, s.b)
    add('ko byes merged vs base', s.merged, s.base)
  }
  {
    const s = koEditConflict()
    add('ko edit conflict', s.a, s.b)
    add('ko edit vs shared', s.a, s.shared)
  }
  {
    const s = setupVsStarted()
    add('setup vs started', s.a, s.b)
  }

  test.each(pairs)('%s: merge is commutative', (_, x, y) => {
    same(mergeTournament(x, y), mergeTournament(y, x))
  })

  test.each(pairs)('%s: merge is idempotent', (_, x, y) => {
    const m = mergeTournament(x, y)
    same(mergeTournament(m, y), m)
    same(mergeTournament(m, x), m)
    same(mergeTournament(m, m), m)
  })

  test.each(pairs)('%s: normalizeTournament is idempotent', (_, x, y) => {
    for (const t of [x, y, mergeTournament(x, y)]) {
      same(normalizeTournament(normalizeTournament(t)), normalizeTournament(t))
    }
  })

  test.each(pairs)('%s: merge does not mutate its inputs', (_, x, y) => {
    const before = [stableStringify(x), stableStringify(y)]
    mergeTournament(x, y)
    expect([stableStringify(x), stableStringify(y)]).toEqual(before)
  })

  test('normalize leaves a setup tournament without matches alone', () => {
    const t = setupTournament('knockout', KO4)
    same(normalizeTournament(t), t)
  })
})

describe('mergeMatch', () => {
  const base: Match = { id: 'm', round: 1, a: 'x', b: 'y', winnerSide: null, loserScore: null }
  const p1: Match = { ...base, winnerSide: 'a', loserScore: 3, playedAt: T0 + 1 }
  const p2: Match = { ...base, winnerSide: 'b', loserScore: 4, playedAt: T0 + 2 }

  test('played beats unplayed, later beats earlier, ties are symmetric', () => {
    expect(mergeMatch(base, p1)).toEqual(p1)
    expect(mergeMatch(p2, p1)).toEqual(p2)
    const tie: Match = { ...p1, winnerSide: 'b' }
    same(mergeMatch(p1, tie), mergeMatch(tie, p1))
  })
})

describe('mergeRow', () => {
  test('first row for an id is normalized for tournaments', () => {
    const { a } = koParallelR1()
    const stale = { ...structuredClone(a), status: 'setup' as const }
    const row = mergeRow(undefined, { kind: 'tournament', id: a.id, body: stale })
    expect(row.body && 'status' in row.body && row.body.status).toBe('running')
  })

  test('merges bodies of the same kind', () => {
    const row = mergeRow(
      { kind: 'player', id: 'p1', body: player('p1', T0, 'Old') },
      { kind: 'player', id: 'p1', body: player('p1', T0 + 1, 'New') },
    )
    expect(row.body && 'name' in row.body && row.body.name).toBe('New')
  })
})

describe('applyRows / rowsFor', () => {
  function store(): PingStore {
    const { a } = rrDisjoint()
    const other = { ...setupTournament('knockout', KO4, 't-other') }
    return {
      version: 2,
      players: { p1: player('p1'), p2: player('p2'), p3: player('p3'), p4: player('p4') },
      tournaments: [a, other],
      tombstones: { gone: { kind: 'tournament', id: 'gone', deletedAt: T0 } },
    }
  }

  test('merges into existing tournaments in place and appends new ones', () => {
    const s = store()
    const { b } = rrDisjoint()
    b.id = s.tournaments[0].id
    const fresh = { ...setupTournament('round-robin', ['p1', 'p2'], 't-new') }
    const out = applyRows(s, [
      { kind: 'tournament', id: fresh.id, body: fresh },
      { kind: 'tournament', id: b.id, body: b },
      { kind: 'player', id: 'p5', body: player('p5') },
    ])
    expect(out.tournaments.map((t) => t.id)).toEqual([s.tournaments[0].id, 't-other', 't-new'])
    expect(out.tournaments[0].matches.filter((m) => m.winnerSide !== null)).toHaveLength(2)
    expect(out.players.p5.name).toBe('P5')
    // Unchanged entries keep their identity; the input store is untouched.
    expect(out.tournaments[1]).toBe(s.tournaments[1])
    expect(s.tournaments).toHaveLength(2)
    expect(s.players.p5).toBeUndefined()
  })

  test('ignores bodies for tombstoned ids and removes tombstoned tournaments', () => {
    const s = store()
    const revived = { ...setupTournament('round-robin', ['p1', 'p2'], 'gone') }
    const out = applyRows(s, [
      { kind: 'tournament', id: 'gone', body: revived },
      { kind: 'tournament', id: 't-other', body: null, deletedAt: T0 + 5 },
    ])
    expect(out.tournaments.map((t) => t.id)).toEqual([s.tournaments[0].id])
    expect(out.tombstones['t-other']).toEqual({ kind: 'tournament', id: 't-other', deletedAt: T0 + 5 })
  })

  test('rowsFor emits bodies, tombstones, and skips unknown ids', () => {
    const s = store()
    const rows = rowsFor(s, { p1: 'player', [s.tournaments[0].id]: 'tournament', gone: 'tournament', nope: 'player' })
    expect(rows.map((r) => [r.kind, r.id, r.body === null])).toEqual([
      ['player', 'p1', false],
      ['tournament', s.tournaments[0].id, false],
      ['tournament', 'gone', true],
    ])
    expect(rows[2].deletedAt).toBe(T0)
  })

  test('rowsFor → applyRows round-trips into an empty store', () => {
    const s = store()
    const dirty: Record<string, 'player' | 'tournament'> = {}
    for (const id of Object.keys(s.players)) dirty[id] = 'player'
    for (const t of s.tournaments) dirty[t.id] = 'tournament'
    dirty.gone = 'tournament'
    const out = applyRows({ version: 2, players: {}, tournaments: [], tombstones: {} }, rowsFor(s, dirty))
    same(out.players, s.players)
    same(out.tombstones, s.tombstones)
    same(out.tournaments, s.tournaments.map(normalizeTournament))
  })
})
