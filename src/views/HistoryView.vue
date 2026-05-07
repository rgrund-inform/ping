<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useTournamentsStore } from '@/stores/tournaments'
import { champion } from '@/lib/scoring'
import FactCard from '@/components/FactCard.vue'

const router = useRouter()
const store = useTournamentsStore()

const all = computed(() => store.sortedTournaments)

function nameOf(id: string | null): string {
  if (!id) return '?'
  return store.players[id]?.name ?? '?'
}

function tournamentWinnerName(id: string): string | null {
  const t = store.tournament(id)
  if (!t) return null
  if (t.status !== 'completed') return null
  if (t.mode === 'knockout') return nameOf(champion(t))
  const standings = store.standingsFor(t.id)
  return standings[0] ? nameOf(standings[0].playerId) : null
}

function dateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const totalMatches = computed(() =>
  store.tournaments.reduce(
    (n, t) => n + t.matches.filter((m) => m.winnerSide !== null && !m.bye).length,
    0,
  ),
)
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-2xl md:text-3xl font-semibold">History</h1>
      <Button
        label="Back"
        icon="pi pi-arrow-left"
        severity="secondary"
        text
        size="small"
        @click="router.push({ name: 'home' })"
      />
    </div>

    <FactCard />

    <div class="grid grid-cols-3 gap-3 text-center">
      <div class="p-3 rounded-lg border border-surface-200 dark:border-surface-700">
        <div class="text-2xl font-semibold">{{ all.length }}</div>
        <div class="text-xs uppercase tracking-wide opacity-60">Tournaments</div>
      </div>
      <div class="p-3 rounded-lg border border-surface-200 dark:border-surface-700">
        <div class="text-2xl font-semibold">{{ totalMatches }}</div>
        <div class="text-xs uppercase tracking-wide opacity-60">Matches played</div>
      </div>
      <div class="p-3 rounded-lg border border-surface-200 dark:border-surface-700">
        <div class="text-2xl font-semibold">{{ store.playerList.length }}</div>
        <div class="text-xs uppercase tracking-wide opacity-60">Players</div>
      </div>
    </div>

    <section class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">All tournaments</h2>
      <div v-if="!all.length" class="opacity-70 text-sm">No tournaments yet.</div>
      <button
        v-for="t in all"
        :key="t.id"
        class="text-left rounded-lg border border-surface-200 dark:border-surface-700 hover:border-primary-400 transition-colors p-3 cursor-pointer"
        @click="router.push({ name: 'tournament', params: { id: t.id } })"
      >
        <div class="flex justify-between items-start gap-2">
          <div>
            <div class="font-semibold">{{ t.name }}</div>
            <div class="text-xs opacity-70">
              {{ t.mode === 'round-robin' ? 'Round-robin' : 'Knockout' }}
              · {{ t.players.length }} players · {{ dateLabel(t.completedAt ?? t.startedAt ?? t.createdAt) }}
            </div>
          </div>
          <div v-if="tournamentWinnerName(t.id)" class="text-right">
            <div class="text-xs uppercase tracking-wide opacity-60">Winner</div>
            <div class="font-semibold text-primary-500">
              <i class="pi pi-trophy mr-1" />{{ tournamentWinnerName(t.id) }}
            </div>
          </div>
          <div v-else-if="t.status === 'running'" class="text-xs uppercase opacity-70">Running</div>
          <div v-else-if="t.status === 'setup'" class="text-xs uppercase opacity-70">Setup</div>
        </div>
      </button>
    </section>
  </div>
</template>
