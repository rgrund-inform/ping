/**
 * Join codes for a sync space. The canonical form is a link into the app
 * (`#/join?s=<spaceId>&k=<token>`), rendered as a QR code; the short text form
 * is `<spaceId>.<token>`. Both carry the secret token — whoever has one can
 * read and edit the space.
 */
import { SPACE_ID_PATTERN, TOKEN_PATTERN } from './protocol'

export interface JoinCredentials {
  spaceId: string
  token: string
}

/** Validates a space id / token pair against the wire patterns. */
export function validJoin(spaceId: unknown, token: unknown): JoinCredentials | null {
  if (typeof spaceId !== 'string' || typeof token !== 'string') return null
  if (!SPACE_ID_PATTERN.test(spaceId) || !TOKEN_PATTERN.test(token)) return null
  return { spaceId, token }
}

/**
 * Link that opens the app's join route. `base` is origin + pathname of the
 * app, e.g. `https://example.github.io/ping/`.
 */
export function buildJoinUrl(
  spaceId: string,
  token: string,
  base: string = `${location.origin}${location.pathname}`,
): string {
  const query = new URLSearchParams({ s: spaceId, k: token })
  return `${base}#/join?${query.toString()}`
}

export function buildJoinCode(spaceId: string, token: string): string {
  return `${spaceId}.${token}`
}

/**
 * Accepts a join link (anything with `s`/`k` in the hash or search query) or
 * a bare `<spaceId>.<token>` code. Surrounding whitespace is ignored.
 */
export function parseJoinInput(input: string): JoinCredentials | null {
  const text = input.trim()
  if (!text) return null

  // Bare code. Tokens are base64url and never contain '.', space ids neither,
  // so the first '.' is the separator.
  const dot = text.indexOf('.')
  if (dot > 0 && !text.includes('/') && !text.includes('?')) {
    return validJoin(text.slice(0, dot), text.slice(dot + 1))
  }

  // Link: look for a query string in the hash first (`#/join?s=..&k=..`),
  // then in the regular search part.
  const candidates: string[] = []
  const hash = text.indexOf('#')
  if (hash >= 0) {
    const q = text.indexOf('?', hash)
    if (q >= 0) candidates.push(text.slice(q + 1))
  }
  const q = text.indexOf('?')
  if (q >= 0) candidates.push(text.slice(q + 1, hash > q ? hash : undefined))

  for (const query of candidates) {
    const params = new URLSearchParams(query)
    const found = validJoin(params.get('s'), params.get('k'))
    if (found) return found
  }
  return null
}
