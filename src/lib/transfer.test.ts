import { describe, expect, test } from 'bun:test'
import type { PingStore } from '../types'
import { buildExport, exportFilename, parseExport } from './transfer'

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
