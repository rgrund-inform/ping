/**
 * Parse the semantic-release-generated CHANGELOG.md into structured releases
 * so the app can show a "what's new" overview after an update.
 *
 * The format is fixed by @semantic-release/release-notes-generator:
 *
 *   # [1.6.0](compare-url) (2026-07-15)      ← minor/major release
 *   ## [1.5.1](compare-url) (2026-06-11)     ← patch release
 *   # 1.0.0 (2026-05-20)                     ← very first release (no link)
 *
 *   ### Features | Bug Fixes | Performance Improvements | BREAKING CHANGES …
 *
 *   * **scope:** description ([abc1234](commit-url), closes [#1](issue-url))
 */

export interface ReleaseSection {
  title: string
  items: string[]
}

export interface Release {
  version: string
  date: string | null
  sections: ReleaseSection[]
}

export function parseChangelog(md: string): Release[] {
  const releases: Release[] = []
  let release: Release | null = null
  let section: ReleaseSection | null = null

  for (const line of md.split('\n')) {
    const heading = line.match(/^#{1,2}\s+\[?(\d+\.\d+\.\d+)/)
    if (heading) {
      release = {
        version: heading[1],
        date: line.match(/\((\d{4}-\d{2}-\d{2})\)\s*$/)?.[1] ?? null,
        sections: [],
      }
      section = null
      releases.push(release)
      continue
    }
    const sectionHeading = line.match(/^###\s+(.+?)\s*$/)
    if (sectionHeading && release) {
      section = { title: sectionHeading[1], items: [] }
      release.sections.push(section)
      continue
    }
    const item = line.match(/^\*\s+(.+)$/)
    if (item && section) {
      section.items.push(cleanItem(item[1]))
    }
  }
  return releases
}

/** Strip markdown links / bold and the trailing commit-hash parenthetical. */
function cleanItem(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/\*\*([^*]*)\*\*/g, '$1') // **scope:** → scope:
    .replace(/\s*\([0-9a-f]{7,}[^)]*\)\s*$/, '') // trailing (abc1234, closes #1)
    .trim()
}

/**
 * Releases newer than `sinceExclusive` and at most `upToInclusive`,
 * newest first (the changelog's own order). Non-semver versions are skipped.
 */
export function releasesBetween(
  releases: Release[],
  sinceExclusive: string,
  upToInclusive: string,
): Release[] {
  return releases.filter(
    (r) =>
      compareVersions(r.version, sinceExclusive) > 0 &&
      compareVersions(r.version, upToInclusive) <= 0,
  )
}

/** Numeric semver comparison on major.minor.patch (pre-release tags ignored). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10))
  const pb = b.split('.').map((n) => parseInt(n, 10))
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}
