import { defineStore } from 'pinia'
import type { EntityKind } from '@/lib/sync/protocol'
import { createSpace } from '@/lib/sync/client'
import { runSync } from '@/lib/sync/engine'
import { useTournamentsStore } from '@/stores/tournaments'

export interface SyncSpace {
  id: string
  token: string
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

interface State {
  space: SyncSpace | null
  /** Highest server `seq` this device has applied. */
  cursor: number
  /** Ids changed locally since the last successful push. */
  dirty: Record<string, EntityKind>
  lastSyncAt: number | null
  status: SyncStatus
  error: string | null
}

export const useSyncStore = defineStore('sync', {
  state: (): State => ({
    space: null,
    cursor: 0,
    dirty: {},
    lastSyncAt: null,
    status: 'idle',
    error: null,
  }),

  getters: {
    joined: (state) => state.space !== null,
  },

  actions: {
    /** Create a new space on the server and join it with this device's data. */
    async createAndJoin(): Promise<void> {
      const res = await createSpace()
      this.join(res.spaceId, res.token)
    },

    /**
     * Join a space. Everything on this device is marked dirty so the first
     * sync pushes it into the space; the cursor starts at 0 so it pulls the
     * whole space back. The engine syncs immediately when `space` changes.
     */
    join(spaceId: string, token: string): void {
      this.space = { id: spaceId, token }
      this.cursor = 0
      this.lastSyncAt = null
      this.status = 'idle'
      this.error = null
      this.dirty = {}
      this.markAllDirty()
    },

    /** Stop syncing. Data already in the space stays there; local data is kept. */
    leave(): void {
      this.space = null
      this.cursor = 0
      this.dirty = {}
      this.lastSyncAt = null
      this.status = 'idle'
      this.error = null
    },

    markDirty(kind: EntityKind, id: string): void {
      if (!this.space) return
      this.dirty[id] = kind
    },

    /** Mark every local player, tournament and tombstone for the next push. */
    markAllDirty(): void {
      if (!this.space) return
      const store = useTournamentsStore()
      for (const id of Object.keys(store.players)) this.dirty[id] = 'player'
      for (const t of store.tournaments) this.dirty[t.id] = 'tournament'
      for (const tomb of Object.values(store.tombstones)) this.dirty[tomb.id] = tomb.kind
    },

    syncNow(): Promise<void> {
      return runSync()
    },
  },

  persist: {
    key: 'ping.sync.v1',
    storage: localStorage,
    pick: ['space', 'cursor', 'dirty', 'lastSyncAt'],
  },
})

/** "just now", "2 min ago", "3 h ago", or a date for anything older than a day. */
export function syncedAgo(ts: number | null, now: number = Date.now()): string {
  if (ts === null) return 'not yet'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return 'just now'
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  return new Date(ts).toLocaleDateString()
}
