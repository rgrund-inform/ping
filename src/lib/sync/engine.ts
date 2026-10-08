/**
 * Drives sync: watches tournament-store actions to collect dirty ids, and
 * pushes/pulls on a debounce after changes, on focus, when the network comes
 * back, on a 30 s interval while visible, and right after joining a space.
 *
 * Not a pure module (Pinia, timers, DOM events) — no unit tests; the pure
 * parts live in merge.ts / joinCode.ts.
 */
import { watch } from 'vue'
import type { PingStore } from '../../types'
import type { EntityKind } from './protocol'
import { rowsFor } from './merge'
import { SYNC_ENABLED, SyncError, syncSpace } from './client'
import { useSyncStore } from '../../stores/sync'
import { useTournamentsStore } from '../../stores/tournaments'

const DEBOUNCE_MS = 1500
const INTERVAL_MS = 30_000

/** Tournament actions whose first argument is the id of the entity they change. */
const ACTIONS_BY_ARG0: Record<string, EntityKind> = {
  renamePlayer: 'player',
  deletePlayer: 'player',
  setSeedOrder: 'tournament',
  startTournament: 'tournament',
  addPlayerToTournament: 'tournament',
  removePlayerFromTournament: 'tournament',
  recordResult: 'tournament',
  editResult: 'tournament',
  shuffleUpcoming: 'tournament',
  smartShuffleUpcoming: 'tournament',
  deleteTournament: 'tournament',
}

let installed = false
let inFlight = false
let rerun = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
/** Ids re-marked dirty while a push was in flight — must stay dirty afterwards. */
let touchedDuringFlight = new Set<string>()
let everythingTouched = false

function scheduleSync(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runSync()
  }, DEBOUNCE_MS)
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** One push+pull round trip. Single-flight: calls during a run queue one re-run. */
export async function runSync(): Promise<void> {
  if (!SYNC_ENABLED) return
  const sync = useSyncStore()
  if (!sync.space) return
  if (inFlight) {
    rerun = true
    return
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  const tournaments = useTournamentsStore()
  const space = { ...sync.space }
  const dirty = { ...sync.dirty }
  inFlight = true
  touchedDuringFlight = new Set()
  everythingTouched = false
  sync.status = 'syncing'

  try {
    const snapshot: PingStore = {
      version: tournaments.version,
      players: tournaments.players,
      tournaments: tournaments.tournaments,
      tombstones: tournaments.tombstones,
    }
    const changes = rowsFor(snapshot, dirty)
    const res = await syncSpace(space, { cursor: sync.cursor, changes })

    // Left or switched spaces while the request was out: drop the response.
    if (sync.space?.id !== space.id) return

    tournaments.applyRemote(res.changes)
    sync.cursor = res.cursor
    if (!everythingTouched) {
      for (const id of Object.keys(dirty)) {
        if (!touchedDuringFlight.has(id)) delete sync.dirty[id]
      }
    }
    sync.lastSyncAt = Date.now()
    sync.status = 'idle'
    sync.error = null
  } catch (err) {
    if (sync.space?.id !== space.id) return
    if (err instanceof SyncError && (err.kind === 'unauthorized' || err.kind === 'not-found')) {
      sync.leave()
      sync.status = 'error'
      sync.error =
        err.kind === 'unauthorized'
          ? 'The sync space rejected this device (invalid link). Sync was turned off; local data is kept.'
          : 'The sync space no longer exists. Sync was turned off; local data is kept.'
    } else if (err instanceof SyncError && err.kind === 'network') {
      sync.status = 'offline'
    } else {
      sync.status = 'error'
      sync.error = `Sync failed: ${describe(err)}`
    }
  } finally {
    inFlight = false
    if (rerun) {
      rerun = false
      void runSync()
    }
  }
}

/** Install once from App.vue's setup (needs an active Pinia). No-op without VITE_SYNC_URL. */
export function installSyncEngine(): void {
  if (installed || !SYNC_ENABLED) return
  installed = true

  const sync = useSyncStore()
  const tournaments = useTournamentsStore()

  // Collect dirty ids after each successful tournament-store mutation.
  // `applyRemote` is deliberately absent, so pulled rows never echo back.
  tournaments.$onAction(({ name, args, after }) => {
    const kind = ACTIONS_BY_ARG0[name]
    if (kind) {
      const id = args[0] as string
      after(() => sync.markDirty(kind, id))
      return
    }
    switch (name) {
      case 'upsertPlayer':
        after((p) => sync.markDirty('player', (p as { id: string }).id))
        break
      case 'createTournament':
        after((t) => sync.markDirty('tournament', (t as { id: string }).id))
        break
      case 'importTournament':
        after((id) => {
          const t = tournaments.tournament(id as string)
          if (!t) return
          sync.markDirty('tournament', t.id)
          for (const pid of t.players) sync.markDirty('player', pid)
        })
        break
      case 'importJSON':
        after(() => {
          if (!sync.space) return
          // The file replaced local state; pull the whole space again so the
          // result is the space merged with the file, then push everything.
          sync.cursor = 0
          sync.markAllDirty()
        })
        break
    }
  })

  // Every dirty-marking schedules a debounced sync; remember ids touched
  // mid-flight so their dirty flag survives the in-flight push.
  sync.$onAction(({ name, args, after }) => {
    if (name === 'markDirty') {
      after(() => {
        if (!sync.space) return
        if (inFlight) touchedDuringFlight.add(args[1] as string)
        scheduleSync()
      })
    } else if (name === 'markAllDirty') {
      after(() => {
        if (!sync.space) return
        if (inFlight) everythingTouched = true
        scheduleSync()
      })
    }
  })

  // Joining (or switching) a space syncs right away.
  watch(
    () => sync.space?.id,
    (id) => {
      if (id) void runSync()
    },
  )

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runSync()
  })
  window.addEventListener('online', () => void runSync())
  setInterval(() => {
    if (document.visibilityState === 'visible' && sync.space) void runSync()
  }, INTERVAL_MS)

  if (sync.space) void runSync()
}
