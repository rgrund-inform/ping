<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useTournamentsStore } from '@/stores/tournaments'
import { currentStreak, globalPlayerStats, playerHeadToHead, recentResults } from '@/lib/stats'
import FactCard from '@/components/FactCard.vue'

const props = defineProps<{ id: string }>()
const router = useRouter()
const store = useTournamentsStore()

const player = computed(() => store.players[props.id])

const stats = computed(() => {
  const all = globalPlayerStats(store.players, store.tournaments)
  return all.find((s) => s.playerId === props.id)
})

const h2h = computed(() => playerHeadToHead(props.id, store.players, store.tournaments))
const recent = computed(() => recentResults(props.id, store.players, store.tournaments, 12))

const streak = computed(() => (stats.value ? currentStreak(stats.value.lastResults) : null))

function fmtPercent(x: number): string {
  return x === 0 ? '–' : `${Math.round(x * 100)}%`
}

function fmtDiff(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
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

    <section v-if="h2h.length" class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">Head-to-head</h2>
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="text-left">
            <th class="px-2 py-2">Opponent</th>
            <th class="px-2 py-2 text-right w-20">M</th>
            <th class="px-2 py-2 text-right w-24">W-L</th>
            <th class="px-2 py-2 text-right w-20">Win%</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in h2h"
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
          <div class="font-mono tabular-nums">{{ r.selfScore }}–{{ r.opponentScore }}</div>
        </button>
      </div>
    </section>
  </div>
</template>
