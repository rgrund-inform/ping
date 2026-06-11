import { describe, expect, test } from 'bun:test'
import type { PingStore, Player, Tournament } from '../types'
import {
  buildExport,
  buildTournamentExport,
  exportFilename,
  parseExport,
  parseTournamentExport,
  planPlayerImport,
  remapTournament,
  tournamentExportFilename,
} from './transfer'

function sampleStore(): PingStore {
  return {
    version: 1,
    players: {
      p1: { id: 'p1', name: 'Alice', createdAt: 1700000000000 },
      p2: { id: 'p2', name: 'Bob', createdAt: 1700000000001 },
    },
    tournaments: [
      {
        id: 't1',
        name: 'Friday Night',
        mode: 'round-robin',
        maxScore: 11,
        status: 'running',
        createdAt: 1700000000000,
        startedAt: 1700000000100,
        players: ['p1', 'p2'],
        matches: [
          {
            id: 'm1',
            round: 1,
            a: 'p1',
            b: 'p2',
            winnerSide: 'a',
            loserScore: 7,
            playedAt: 1700000000200,
          },
        ],
        bracketLocked: false,
      },
    ],
  }
}

describe('buildExport / parseExport', () => {
  test('round-trips a valid store', () => {
    const raw = buildExport(sampleStore())
    const result = parseExport(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.players.p1.name).toBe('Alice')
    expect(result.data.tournaments[0].matches[0].winnerSide).toBe('a')
  })

  test('rejects non-JSON', () => {
    const result = parseExport('not json {{{')
    expect(result.ok).toBe(false)
  })

  test('rejects unsupported version', () => {
    const raw = JSON.stringify({ app: 'ping', store: { version: 99, players: {}, tournaments: [] } })
    const result = parseExport(raw)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/version/i)
  })

  test('rejects missing players map', () => {
    const raw = JSON.stringify({ version: 1, tournaments: [] })
    const result = parseExport(raw)
    expect(result.ok).toBe(false)
  })

  test('rejects tournament with bad mode', () => {
    const store = sampleStore()
    ;(store.tournaments[0] as unknown as { mode: string }).mode = 'bogus'
    const raw = JSON.stringify({ app: 'ping', store })
    const result = parseExport(raw)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/mode/)
  })

  test('rejects malformed match entry', () => {
    const store = sampleStore()
    ;(store.tournaments[0].matches[0] as unknown as { winnerSide: string }).winnerSide = 'c'
    const raw = JSON.stringify({ app: 'ping', store })
    const result = parseExport(raw)
    expect(result.ok).toBe(false)
  })

  test('accepts a bare PingStore (no ExportFile wrapper)', () => {
    const raw = JSON.stringify(sampleStore())
    const result = parseExport(raw)
    expect(result.ok).toBe(true)
  })
})

describe('exportFilename', () => {
  test('formats YYYY-MM-DD', () => {
    expect(exportFilename(new Date(2026, 4, 27))).toBe('ping-export-2026-05-27.json')
  })
})

function sampleTournament(): { tournament: Tournament; players: Record<string, Player> } {
  const store = sampleStore()
  return { tournament: store.tournaments[0], players: store.players }
}

describe('buildTournamentExport / parseTournamentExport', () => {
  test('round-trips one tournament with only its players', () => {
    const { tournament, players } = sampleTournament()
    const raw = buildTournamentExport(tournament, players)
    const result = parseTournamentExport(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.tournament.name).toBe('Friday Night')
    expect(Object.keys(result.data.players).sort()).toEqual(['p1', 'p2'])
  })

  test('only bundles players referenced by the tournament', () => {
    const { tournament, players } = sampleTournament()
    players.p3 = { id: 'p3', name: 'Carol', createdAt: 1700000000002 }
    const raw = buildTournamentExport(tournament, players)
    const result = parseTournamentExport(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.players.p3).toBeUndefined()
  })

  test('rejects a full-store export (wrong kind)', () => {
    const result = parseTournamentExport(buildExport(sampleStore()))
    expect(result.ok).toBe(false)
  })

  test('rejects non-JSON', () => {
    expect(parseTournamentExport('nope {{{').ok).toBe(false)
  })
})

describe('planPlayerImport', () => {
  const imported: Record<string, Player> = {
    i1: { id: 'i1', name: 'Alice', createdAt: 1 },
    i2: { id: 'i2', name: 'Zelda', createdAt: 2 },
  }
  const local: Record<string, Player> = {
    L1: { id: 'L1', name: 'alice', createdAt: 1 },
  }

  test('matches by name case-insensitively, null otherwise', () => {
    const rows = planPlayerImport(imported, local)
    const alice = rows.find((r) => r.imported.id === 'i1')
    const zelda = rows.find((r) => r.imported.id === 'i2')
    expect(alice?.matchedLocalId).toBe('L1')
    expect(zelda?.matchedLocalId).toBeNull()
  })
})

describe('remapTournament', () => {
  test('rewrites roster, match sides, and id', () => {
    const { tournament } = sampleTournament()
    const out = remapTournament(tournament, { p1: 'x1', p2: 'x2' }, 'newT')
    expect(out.id).toBe('newT')
    expect(out.players).toEqual(['x1', 'x2'])
    expect(out.matches[0].a).toBe('x1')
    expect(out.matches[0].b).toBe('x2')
    // original is untouched
    expect(tournament.matches[0].a).toBe('p1')
  })

  test('leaves null match sides null and keeps unmapped ids', () => {
    const t: Tournament = {
      id: 't',
      name: 'k',
      mode: 'knockout',
      maxScore: 7,
      status: 'running',
      createdAt: 1,
      players: ['p1'],
      matches: [
        { id: 'm', round: 1, slot: 0, a: 'p1', b: null, winnerSide: null, loserScore: null },
      ],
      bracketLocked: true,
    }
    const out = remapTournament(t, {}, 'n')
    expect(out.matches[0].a).toBe('p1')
    expect(out.matches[0].b).toBeNull()
  })
})

describe('tournamentExportFilename', () => {
  test('slugifies the name and appends the date', () => {
    expect(tournamentExportFilename('Friday Night!', new Date(2026, 4, 27))).toBe(
      'ping-friday-night-2026-05-27.json',
    )
  })

  test('falls back when the name has no usable characters', () => {
    expect(tournamentExportFilename('  ', new Date(2026, 4, 27))).toBe(
      'ping-tournament-2026-05-27.json',
    )
  })
})
