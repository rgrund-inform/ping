/**
 * Wire format shared by the PWA and the Cloudflare sync Worker.
 *
 * A sync space holds one row per player / tournament. Each row gets a
 * per-space monotonic `seq` whenever it changes; a client's `cursor` is the
 * highest `seq` it has seen. One round trip pushes local changes and pulls
 * everything newer than the cursor.
 */
import type { Player, Tournament } from '../../types'

export type EntityKind = 'player' | 'tournament'

/** A player, a tournament, or a tombstone (`body: null`, `deletedAt` set). */
export type SyncRow =
  | { kind: 'player'; id: string; body: Player; deletedAt?: undefined }
  | { kind: 'tournament'; id: string; body: Tournament; deletedAt?: undefined }
  | { kind: EntityKind; id: string; body: null; deletedAt: number }

export interface SyncRequest {
  /** Highest `seq` this client has already received; 0 on first sync. */
  cursor: number
  changes: SyncRow[]
}

export interface SyncResponse {
  /** New cursor: the space's highest `seq` after applying `changes`. */
  cursor: number
  /** Every row with `seq > request.cursor`, including the caller's own merged rows. */
  changes: SyncRow[]
}

/** `POST /spaces` response. The token is shown once and never retrievable again. */
export interface CreateSpaceResponse {
  spaceId: string
  token: string
}

/** Space ids are 16 random bytes, lowercase base32 without padding (26 chars). */
export const SPACE_ID_PATTERN = /^[a-z2-7]{26}$/
/** Tokens are 32 random bytes, base64url without padding (43 chars). */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** Routes, relative to the Worker origin. */
export const ROUTES = {
  health: '/health',
  createSpace: '/spaces',
  sync: (spaceId: string) => `/spaces/${spaceId}/sync`,
} as const
