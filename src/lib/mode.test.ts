import { describe, expect, test } from 'bun:test'
import { isWinOnly, modeLabel } from './mode'

describe('isWinOnly', () => {
  test('true only for scoring: wins', () => {
    expect(isWinOnly({ mode: 'round-robin', scoring: 'wins' })).toBe(true)
    expect(isWinOnly({ mode: 'round-robin', scoring: 'points' })).toBe(false)
  })

  test('undefined scoring (pre-quick-mode data) counts as points', () => {
    expect(isWinOnly({ mode: 'round-robin', scoring: undefined })).toBe(false)
    expect(isWinOnly({ mode: 'knockout', scoring: undefined })).toBe(false)
  })
})

describe('modeLabel', () => {
  test('labels all three user-facing modes', () => {
    expect(modeLabel({ mode: 'round-robin', scoring: 'wins' })).toBe('Quick')
    expect(modeLabel({ mode: 'round-robin', scoring: 'points' })).toBe('Round-robin')
    expect(modeLabel({ mode: 'knockout', scoring: 'points' })).toBe('Knockout')
  })

  test('legacy tournaments without scoring keep their old labels', () => {
    expect(modeLabel({ mode: 'round-robin', scoring: undefined })).toBe('Round-robin')
    expect(modeLabel({ mode: 'knockout', scoring: undefined })).toBe('Knockout')
  })

  test('a knockout is never labelled Quick', () => {
    expect(modeLabel({ mode: 'knockout', scoring: 'wins' })).toBe('Knockout')
  })
})
