<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import { useTournamentsStore } from '@/stores/tournaments'
import {
  NORMALISED_MAX_SCORE,
  RIVAL_WINDOW_DAYS,
  currentStreak,
  globalPlayerStats,
  playerHeadToHead,
  playerRivals,
  recentResults,
  type HeadToHead,
  type Rival,
} from '@/lib/stats'
import FactCard from '@/components/FactCard.vue'

type H2HSortKey = 'opponentName' | 'matches' | 'wins' | 'winRate' | 'avgMargin'

const props = defineProps<{ id: string }>()
const router = useRouter()
const store = useTournamentsStore()

const player = computed(() => store.players[props.id])

const stats = computed(() => {
  const all = globalPlayerStats(store.players, store.tournaments)
  return all.find((s) => s.playerId === props.id)
})

const h2h = computed(() => playerHeadToHead(props.id, store.players, store.tournaments))

const rivals = computed(() => playerRivals(props.id, store.players, store.tournaments))

const rivalCards = computed(() =>
  (
    [
      { label: 'Current rival', hint: `last ${RIVAL_WINDOW_DAYS} days`, rival: rivals.value.current },
      { label: 'All-time rival', hint: 'closest record', rival: rivals.value.allTime },
    ] as { label: string; hint: string; rival: Rival | null }[]
  ).filter((c): c is { label: string; hint: string; rival: Rival } => c.rival !== null),
)

const rivalInfo = ref<InstanceType<typeof Popover> | null>(null)

const sortKey = ref<H2HSortKey>('matches')
const sortDir = ref<'asc' | 'desc'>('desc')

const sortedH2h = computed(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...h2h.value].sort((a, b) => {
    if (sortKey.value === 'opponentName') return dir * a.opponentName.localeCompare(b.opponentName)
    if (sortKey.value === 'wins') {
      const byWins = dir * (a.wins - b.wins)
      if (byWins !== 0) return byWins
      return a.losses - b.losses
    }
    if (sortKey.value === 'avgMargin') {
      // Opponents without a scoreline sort last in either direction.
      const ma = avgMargin(a)
      const mb = avgMargin(b)
      if (ma === null || mb === null) return (ma === null ? 1 : 0) - (mb === null ? 1 : 0)
      return dir * (ma - mb)
    }
    return dir * (a[sortKey.value] - b[sortKey.value])
  })
})

function avgMargin(h: HeadToHead): number | null {
  return h.avgFor === null || h.avgAgainst === null ? null : h.avgFor - h.avgAgainst
}

function setSort(key: H2HSortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = key === 'opponentName' ? 'asc' : 'desc'
  }
}

function arrow(key: H2HSortKey): string {
  if (sortKey.value !== key) return ''
  return sortDir.value === 'asc' ? ' ↑' : ' ↓'
}
const recent = computed(() => recentResults(props.id, store.players, store.tournaments, 12))

const streak = computed(() => (stats.value ? currentStreak(stats.value.lastResults) : null))

function fmtPercent(x: number): string {
  return x === 0 ? '–' : `${Math.round(x * 100)}%`
}

function fmtDiff(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

function fmtAvg(n: number): string {
  return n.toFixed(1)
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div v-if="!player" class="text-center py-10">
    <p class="opacity-70 mb-4">Player not found.</p>
    <Button label="Back to players" icon="pi pi-arrow-left" @click="router.push({ name: 'players' })" />
  </div>

  <div v-else class="flex flex-col gap-5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <Button
          label="Players"
          icon="pi pi-arrow-left"
          severity="secondary"
          text
          size="small"
          class="-ml-2"
          @click="router.push({ name: 'players' })"
        />
        <h1 class="text-2xl md:text-3xl font-semibold">{{ player.name }}</h1>
      </div>
      <div
        v-if="streak && streak.n >= 2"
        class="rounded-md px-3 py-2 border"
        :class="
          streak.kind === 'W'
            ? 'border-positive text-positive bg-positive/10'
            : 'border-negative text-negative bg-negative/10'
        "
      >
        <div class="text-xs uppercase opacity-80">Current streak</div>
        <div class="text-lg font-semibold tabular-nums">{{ streak.n }} {{ streak.kind === 'W' ? 'wins' : 'losses' }}</div>
      </div>
    </div>

    <FactCard hype :prefer-players="[id]" />

    <section v-if="stats">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-center">
          <div class="text-2xl font-semibold tabular-nums">{{ stats.matches }}</div>
          <div class="text-xs uppercase tracking-wide opacity-60">Matches</div>
        </div>
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-center">
          <div class="text-2xl font-semibold tabular-nums">
            <span class="text-positive">{{ stats.wins }}</span
            ><span class="opacity-50">-</span
            ><span class="text-negative">{{ stats.losses }}</span>
          </div>
          <div class="text-xs uppercase tracking-wide opacity-60">W – L</div>
        </div>
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-center">
          <div class="text-2xl font-semibold tabular-nums">{{ fmtPercent(stats.winRate) }}</div>
          <div class="text-xs uppercase tracking-wide opacity-60">Win rate</div>
        </div>
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-center">
          <div
            class="text-2xl font-semibold tabular-nums"
            :class="{
              'text-positive': stats.pointDiff > 0,
              'text-negative': stats.pointDiff < 0,
            }"
          >
            {{ stats.matches > 0 ? fmtDiff(stats.pointDiff) : '–' }}
          </div>
          <div class="text-xs uppercase tracking-wide opacity-60">Point diff</div>
        </div>
      </div>
    </section>

    <section v-if="rivalCards.length" class="flex flex-col gap-2">
      <div class="flex items-center gap-1">
        <h2 class="text-lg font-semibold">Rivals</h2>
        <Button
          icon="pi pi-info-circle"
          severity="secondary"
          text
          rounded
          size="small"
          aria-label="How rivals are calculated"
          @click="rivalInfo?.toggle($event)"
        />
      </div>
      <Popover ref="rivalInfo">
        <div class="max-w-xs text-sm flex flex-col gap-2">
          <p>Your rival is the opponent with the most <strong>even</strong> head-to-head.</p>
          <p>Evenness averages two things:</p>
          <ol class="list-decimal pl-5 flex flex-col gap-1">
            <li><strong>W-L:</strong> how close the win/loss record is (5-5 is even, 10-0 is not).</li>
            <li>
              <strong>Ø /{{ NORMALISED_MAX_SCORE }}:</strong> how close the average scores are, every
              match scaled to a game to {{ NORMALISED_MAX_SCORE }}.
            </li>
          </ol>
          <p>
            <strong>All-time</strong> needs 3 matches. <strong>Current</strong> looks at the last
            {{ RIVAL_WINDOW_DAYS }} days and needs 2. On a tie, more matches wins.
          </p>
        </div>
      </Popover>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          v-for="c in rivalCards"
          :key="c.label"
          class="text-left rounded-lg border border-surface-200 dark:border-surface-700 hover:border-primary-400 transition-colors p-3 flex flex-col gap-1 cursor-pointer"
          @click="router.push({ name: 'player', params: { id: c.rival.opponentId } })"
        >
          <div class="text-xs uppercase tracking-wide opacity-60">
            <i class="pi pi-bolt text-xs" /> {{ c.label }} · {{ c.hint }}
          </div>
          <div class="text-lg font-semibold truncate">{{ c.rival.opponentName }}</div>
          <div class="text-sm tabular-nums opacity-80">
            {{ c.rival.matches }} M ·
            <span class="text-positive">{{ c.rival.wins }}</span
            ><span class="opacity-50">-</span
            ><span class="text-negative">{{ c.rival.losses }}</span>
            <template v-if="c.rival.avgFor !== null && c.rival.avgAgainst !== null">
              · Ø {{ fmtAvg(c.rival.avgFor) }}–{{ fmtAvg(c.rival.avgAgainst) }}
            </template>
          </div>
        </button>
      </div>
    </section>

    <section v-if="h2h.length" class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">Head-to-head</h2>
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="text-left">
            <th class="px-2 py-2 cursor-pointer select-none" @click="setSort('opponentName')">
              Opponent{{ arrow('opponentName') }}
            </th>
            <th class="px-2 py-2 text-right w-12 cursor-pointer select-none" @click="setSort('matches')">
              M{{ arrow('matches') }}
            </th>
            <th class="px-2 py-2 text-right w-16 cursor-pointer select-none" @click="setSort('wins')">
              W-L{{ arrow('wins') }}
            </th>
            <th class="px-2 py-2 text-right w-16 cursor-pointer select-none" @click="setSort('winRate')">
              Win%{{ arrow('winRate') }}
            </th>
            <th
              class="px-2 py-2 text-right w-24 cursor-pointer select-none whitespace-nowrap"
              :title="`Average finish, every match scaled to a game to ${NORMALISED_MAX_SCORE}`"
              @click="setSort('avgMargin')"
            >
              Ø /{{ NORMALISED_MAX_SCORE }}{{ arrow('avgMargin') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in sortedH2h"
            :key="row.opponentId"
            class="border-t border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 cursor-pointer"
            @click="router.push({ name: 'player', params: { id: row.opponentId } })"
          >
            <td class="px-2 py-2">{{ row.opponentName }}</td>
            <td class="px-2 py-2 text-right tabular-nums">{{ row.matches }}</td>
            <td class="px-2 py-2 text-right tabular-nums">
              <span class="text-positive">{{ row.wins }}</span
              ><span class="opacity-50">-</span
              ><span class="text-negative">{{ row.losses }}</span>
            </td>
            <td class="px-2 py-2 text-right tabular-nums">{{ fmtPercent(row.winRate) }}</td>
            <td class="px-2 py-2 text-right tabular-nums whitespace-nowrap">
              <template v-if="row.avgFor !== null && row.avgAgainst !== null">
                <span :class="{ 'text-positive': row.avgFor > row.avgAgainst }">{{ fmtAvg(row.avgFor) }}</span
                ><span class="opacity-50">–</span
                ><span :class="{ 'text-negative': row.avgFor < row.avgAgainst }">{{ fmtAvg(row.avgAgainst) }}</span>
              </template>
              <span v-else class="opacity-50">–</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="recent.length" class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">Recent matches</h2>
      <div class="flex flex-col gap-1">
        <button
          v-for="r in recent"
          :key="r.matchId"
          class="text-left rounded border border-surface-200 dark:border-surface-700 hover:border-primary-400 transition-colors p-2 flex items-center gap-3 cursor-pointer"
          @click="router.push({ name: 'tournament', params: { id: r.tournamentId } })"
        >
          <i
            class="pi text-lg"
            :class="r.win ? 'pi-check-circle text-positive' : 'pi-times-circle text-negative'"
          />
          <div class="flex-1 min-w-0">
            <div class="truncate">vs {{ r.opponentName }}</div>
            <div class="text-xs opacity-60 truncate">{{ r.tournamentName }} · {{ fmtDate(r.playedAt) }}</div>
          </div>
          <div v-if="r.selfScore !== null" class="font-mono tabular-nums">
            {{ r.selfScore }}–{{ r.opponentScore }}
          </div>
          <!-- Quick-mode results have no scoreline, just the outcome. -->
          <div v-else class="text-xs uppercase tracking-wide opacity-60">
            {{ r.win ? 'Win' : 'Loss' }}
          </div>
        </button>
      </div>
    </section>
  </div>
</template>
