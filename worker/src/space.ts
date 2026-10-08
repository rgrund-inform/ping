import { DurableObject } from 'cloudflare:workers'
import { mergeRow, stableStringify } from '../../src/lib/sync/merge'
import type { SyncRequest, SyncResponse, SyncRow } from '../../src/lib/sync/protocol'
import { timingSafeEqualHex } from './auth'

/** A space nobody synced for this long is deleted by its alarm. */
const IDLE_TTL_MS = 365 * 24 * 60 * 60 * 1000

export type InitResult = { ok: true } | { error: 'conflict' }
export type SyncResult = SyncResponse | { error: 'unauthorized' | 'uninitialized' | 'invalid-row' }

type MetaRow = { value: string }
type EntityRow = { body: string }

/**
 * One sync space. SQLite tables:
 * - `meta(key, value)`: `tokenHash`, `seq` (highest assigned seq), `createdAt`, `lastSeenAt`
 * - `entities(kind, id, seq, deleted, body)`: `body` is the stored SyncRow as JSON
 *
 * The schema is created by `init()`, not by the constructor, so requests for
 * unknown space ids never leave storage behind.
 */
export class SyncSpace extends DurableObject<Env> {
  private initialized = false

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.initialized = this.hasSchema()
      if (this.initialized) this.migrate()
    })
  }

  /** Bind a fresh space to its token hash. Idempotent for the same hash. */
  async init(tokenHash: string): Promise<InitResult> {
    if (!this.initialized) {
      this.migrate()
      this.initialized = true
    }
    const existing = this.getMeta('tokenHash')
    if (existing !== null) {
      return timingSafeEqualHex(existing, tokenHash) ? { ok: true } : { error: 'conflict' }
    }
    const now = String(Date.now())
    this.ctx.storage.transactionSync(() => {
      this.setMeta('tokenHash', tokenHash)
      this.setMeta('seq', '0')
      this.setMeta('createdAt', now)
      this.setMeta('lastSeenAt', now)
    })
    await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS)
    return { ok: true }
  }

  /** Merge pushed rows, then return every row newer than the client's cursor. */
  async sync(tokenHash: string, req: SyncRequest): Promise<SyncResult> {
    if (!this.initialized) return { error: 'uninitialized' }
    const expected = this.getMeta('tokenHash')
    if (expected === null) return { error: 'uninitialized' }
    if (!timingSafeEqualHex(expected, tokenHash)) return { error: 'unauthorized' }

    let counter: number
    try {
      // Synchronous and transactional: if any merge throws, nothing is written.
      counter = this.ctx.storage.transactionSync(() => this.applyChanges(req.changes))
    } catch (err) {
      console.error(
        JSON.stringify({
          message: 'merge failed',
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      return { error: 'invalid-row' }
    }

    // A cursor ahead of the space means the client saw a different (reset) space: resend all.
    const cursor = req.cursor > counter ? 0 : req.cursor
    const changes = this.ctx.storage.sql
      .exec<EntityRow>('SELECT body FROM entities WHERE seq > ? ORDER BY seq', cursor)
      .toArray()
      .map((r) => JSON.parse(r.body) as SyncRow)

    await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS)
    return { cursor: counter, changes }
  }

  /** Idle-expiry: delete the whole space once nobody synced for IDLE_TTL_MS. */
  async alarm(): Promise<void> {
    if (!this.initialized) return
    const lastSeenAt = Number(this.getMeta('lastSeenAt') ?? 0)
    const dueAt = lastSeenAt + IDLE_TTL_MS
    if (Date.now() < dueAt) {
      await this.ctx.storage.setAlarm(dueAt)
      return
    }
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    this.initialized = false
  }

  /** Runs inside transactionSync. Returns the new highest seq. */
  private applyChanges(changes: SyncRow[]): number {
    const sql = this.ctx.storage.sql
    let counter = Number(this.getMeta('seq') ?? 0)
    for (const incoming of changes) {
      const found = sql
        .exec<EntityRow>('SELECT body FROM entities WHERE kind = ? AND id = ?', incoming.kind, incoming.id)
        .toArray()[0]
      const existing = found ? (JSON.parse(found.body) as SyncRow) : undefined
      const merged = mergeRow(existing, incoming)
      const body = stableStringify(merged)
      if (existing && body === stableStringify(existing)) continue
      counter += 1
      sql.exec(
        `INSERT INTO entities (kind, id, seq, deleted, body) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (kind, id) DO UPDATE SET seq = excluded.seq, deleted = excluded.deleted, body = excluded.body`,
        merged.kind,
        merged.id,
        counter,
        merged.body === null ? 1 : 0,
        body,
      )
    }
    this.setMeta('seq', String(counter))
    this.setMeta('lastSeenAt', String(Date.now()))
    return counter
  }

  private hasSchema(): boolean {
    return (
      this.ctx.storage.sql
        .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
        .toArray().length > 0
    )
  }

  /** Idempotent schema setup; extend with further statements for later versions. */
  private migrate(): void {
    const sql = this.ctx.storage.sql
    sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    sql.exec(`CREATE TABLE IF NOT EXISTS entities (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      deleted INTEGER NOT NULL,
      body TEXT NOT NULL,
      PRIMARY KEY (kind, id)
    )`)
    sql.exec('CREATE INDEX IF NOT EXISTS entities_seq ON entities (seq)')
  }

  private getMeta(key: string): string | null {
    const row = this.ctx.storage.sql.exec<MetaRow>('SELECT value FROM meta WHERE key = ?', key).toArray()[0]
    return row ? row.value : null
  }

  private setMeta(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      key,
      value,
    )
  }
}
