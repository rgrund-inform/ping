/** Random identifiers, token hashing and constant-time comparison (Web Crypto only). */

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return bytes
}

/** RFC 4648 base32, lowercase, no padding. */
function base32(bytes: Uint8Array): string {
  let out = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(buffer << (5 - bits)) & 31]
  return out
}

/** RFC 4648 base64url, no padding. */
function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 16 random bytes → 26 lowercase base32 chars (matches SPACE_ID_PATTERN). */
export function newSpaceId(): string {
  return base32(randomBytes(16))
}

/** 32 random bytes → 43 base64url chars (matches TOKEN_PATTERN). */
export function newToken(): string {
  return base64url(randomBytes(32))
}

export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Constant-time equality for two hex digests. Inputs are fixed-length SHA-256
 * hex strings, so the early length check leaks nothing secret.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  if (x.byteLength !== y.byteLength) return false
  return crypto.subtle.timingSafeEqual(x, y)
}
