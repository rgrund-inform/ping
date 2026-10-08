import { describe, expect, test } from 'bun:test'
import { buildJoinCode, buildJoinUrl, parseJoinInput, validJoin } from './joinCode'

const ID = 'abcdefghijklmnopqrstuvwxyz'.slice(0, 20) + '234567'
const TOKEN = 'A'.repeat(20) + 'b_-9'.repeat(5) + 'xyz'
const BASE = 'https://example.github.io/ping/'

describe('joinCode', () => {
  test('fixtures match the wire patterns', () => {
    expect(ID).toHaveLength(26)
    expect(TOKEN).toHaveLength(43)
    expect(validJoin(ID, TOKEN)).toEqual({ spaceId: ID, token: TOKEN })
  })

  test('buildJoinUrl puts the credentials in the hash query', () => {
    expect(buildJoinUrl(ID, TOKEN, BASE)).toBe(`${BASE}#/join?s=${ID}&k=${TOKEN}`)
  })

  test('buildJoinCode joins id and token with a dot', () => {
    expect(buildJoinCode(ID, TOKEN)).toBe(`${ID}.${TOKEN}`)
  })

  test('round-trips the link and the code', () => {
    const expected = { spaceId: ID, token: TOKEN }
    expect(parseJoinInput(buildJoinUrl(ID, TOKEN, BASE))).toEqual(expected)
    expect(parseJoinInput(buildJoinCode(ID, TOKEN))).toEqual(expected)
  })

  test('ignores surrounding whitespace', () => {
    const expected = { spaceId: ID, token: TOKEN }
    expect(parseJoinInput(`  ${ID}.${TOKEN}\n`)).toEqual(expected)
    expect(parseJoinInput(`\t${buildJoinUrl(ID, TOKEN, BASE)}  `)).toEqual(expected)
  })

  test('accepts parameters in either order and a localhost link', () => {
    expect(parseJoinInput(`http://localhost:5173/#/join?k=${TOKEN}&s=${ID}`)).toEqual({
      spaceId: ID,
      token: TOKEN,
    })
  })

  test('rejects malformed input', () => {
    expect(parseJoinInput('')).toBeNull()
    expect(parseJoinInput('   ')).toBeNull()
    expect(parseJoinInput('hello')).toBeNull()
    expect(parseJoinInput(`${ID}${TOKEN}`)).toBeNull()
    // Uppercase / wrong alphabet in the id.
    expect(parseJoinInput(`${ID.toUpperCase()}.${TOKEN}`)).toBeNull()
    // Token one char short.
    expect(parseJoinInput(`${ID}.${TOKEN.slice(1)}`)).toBeNull()
    // Link without the token.
    expect(parseJoinInput(`${BASE}#/join?s=${ID}`)).toBeNull()
    // Unrelated link.
    expect(parseJoinInput(`${BASE}#/import?d=abc.def`)).toBeNull()
  })
})
