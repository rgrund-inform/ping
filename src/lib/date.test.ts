import { describe, expect, test } from 'bun:test'
import { isSameDay, startOfDay } from './date'

describe('startOfDay', () => {
  test('snaps to local midnight', () => {
    const noon = new Date(2026, 8, 22, 12, 34, 56, 789).getTime()
    const d = new Date(startOfDay(noon))
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)
    expect(d.getDate()).toBe(22)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
    expect(d.getMilliseconds()).toBe(0)
  })

  test('is idempotent', () => {
    const ts = new Date(2026, 0, 3, 23, 59, 59).getTime()
    expect(startOfDay(startOfDay(ts))).toBe(startOfDay(ts))
  })
})

describe('isSameDay', () => {
  test('true for two times on the same calendar day', () => {
    const morning = new Date(2026, 8, 22, 8, 0, 0).getTime()
    const night = new Date(2026, 8, 22, 23, 59, 59).getTime()
    expect(isSameDay(morning, night)).toBe(true)
  })

  test('false across a midnight boundary, even one second apart', () => {
    const before = new Date(2026, 8, 22, 23, 59, 59, 999).getTime()
    const after = new Date(2026, 8, 23, 0, 0, 0, 0).getTime()
    expect(isSameDay(before, after)).toBe(false)
  })

  test('false for the same clock time a year apart', () => {
    const a = new Date(2025, 8, 22, 10, 0, 0).getTime()
    const b = new Date(2026, 8, 22, 10, 0, 0).getTime()
    expect(isSameDay(a, b)).toBe(false)
  })
})
