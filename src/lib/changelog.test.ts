import { describe, expect, test } from 'bun:test'
import { compareVersions, parseChangelog, releasesBetween } from './changelog'

const SAMPLE = `# [1.6.0](https://github.com/x/ping/compare/v1.5.1...v1.6.0) (2026-07-15)


### Features

* add smart shuffle that evenly spaces each player's matches ([75b9bc2](https://github.com/x/ping/commit/75b9bc2))

## [1.5.1](https://github.com/x/ping/compare/v1.5.0...v1.5.1) (2026-06-11)


### Bug Fixes

* **import:** harden tournament import against player-identity bugs ([2573880](https://github.com/x/ping/commit/2573880), closes [#12](https://github.com/x/ping/issues/12))

# [1.5.0](https://github.com/x/ping/compare/v1.4.0...v1.5.0) (2026-06-11)


### Features

* shuffle upcoming matches on a tournament's Next tab ([20dc5f7](https://github.com/x/ping/commit/20dc5f7))

# 1.0.0 (2026-05-20)


### Features

* initial release ([abc1234](https://github.com/x/ping/commit/abc1234))
`

describe('parseChangelog', () => {
  test('parses versions, dates, sections, and items', () => {
    const releases = parseChangelog(SAMPLE)
    expect(releases.map((r) => r.version)).toEqual(['1.6.0', '1.5.1', '1.5.0', '1.0.0'])
    expect(releases[0].date).toBe('2026-07-15')
    expect(releases[0].sections).toEqual([
      {
        title: 'Features',
        items: ["add smart shuffle that evenly spaces each player's matches"],
      },
    ])
  })

  test('handles the unlinked first-release heading', () => {
    const first = parseChangelog(SAMPLE).at(-1)!
    expect(first.version).toBe('1.0.0')
    expect(first.date).toBe('2026-05-20')
    expect(first.sections[0].items).toEqual(['initial release'])
  })

  test('strips links, bold scopes, and trailing commit references', () => {
    const patch = parseChangelog(SAMPLE)[1]
    expect(patch.sections[0].items).toEqual([
      'import: harden tournament import against player-identity bugs',
    ])
  })

  test('returns empty for empty or non-changelog input', () => {
    expect(parseChangelog('')).toEqual([])
    expect(parseChangelog('# Hello\n\nsome readme text')).toEqual([])
  })
})

describe('releasesBetween', () => {
  const releases = parseChangelog(SAMPLE)

  test('returns releases after lastSeen up to the current version', () => {
    const out = releasesBetween(releases, '1.5.0', '1.6.0')
    expect(out.map((r) => r.version)).toEqual(['1.6.0', '1.5.1'])
  })

  test('excludes both bounds correctly', () => {
    expect(releasesBetween(releases, '1.6.0', '1.6.0')).toEqual([])
    expect(releasesBetween(releases, '1.5.1', '1.5.1')).toEqual([])
  })

  test('handles a lastSeen version missing from the changelog', () => {
    const out = releasesBetween(releases, '1.5.2', '1.6.0')
    expect(out.map((r) => r.version)).toEqual(['1.6.0'])
  })
})

describe('compareVersions', () => {
  test('compares numerically, not lexicographically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0)
    expect(compareVersions('1.5.1', '1.5.1')).toBe(0)
    expect(compareVersions('1.5.0', '1.5.1')).toBeLessThan(0)
  })
})
