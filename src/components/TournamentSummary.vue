<script setup lang="ts">
import { computed } from 'vue'
import Tag from 'primevue/tag'
import { champion, standings } from '@/lib/scoring'
import type { Player, PlayerId, Tournament } from '@/types'

/**
 * Tiny results overview for a tournament: mode, progress and the top of the
 * table (or the champion). Takes its own player map so it works for imported
 * tournaments whose players are not (yet) in the store.
 */
const props = defineProps<{
  tournament: Tournament
  players: Record<PlayerId, Player>
}>()

const nameOf = (id: PlayerId | null) => (id ? props.players[id]?.name ?? '?' : '?')

const playable = computed(() => props.tournament.matches.filter((m) => !m.bye))
const playedCount = computed(() => playable.value.filter((m) => m.winnerSide !== null).length)

const statusLabel = computed(() => {
  const s = props.tournament.status
  return s === 'setup' ? 'Setup' : s === 'running' ? 'Running' : 'Completed'
})
const statusSeverity = computed(() => {
  const s = props.tournament.status
  return s === 'setup' ? 'secondary' : s === 'running' ? 'info' : 'success'
})

const championName = computed(() => {
  const id = champion(props.tournament)
  return id ? nameOf(id) : null
})

/** Top three by standings, only players who have actually played. */
const top = computed(() =>
  standings(props.tournament)
    .filter((s) => s.played > 0)
    .slice(0, 3)
    .map((s) => ({ ...s, name: nameOf(s.playerId) })),
)

const tableTitle = computed(() =>
  props.tournament.status === 'completed' ? 'Final standings' : 'Leading',
)
</script>

<template>
  <div class="flex flex-col gap-2 text-sm">
    <div class="flex flex-wrap gap-2 items-center">
      <Tag
        :value="tournament.mode === 'round-robin' ? 'Round-robin' : 'Knockout'"
        severity="secondary"
      />
      <Tag :value="statusLabel" :severity="statusSeverity" />
      <span class="opacity-70">
        {{ tournament.players.length }} players · {{ playedCount }}/{{ playable.length }} matches played
      </span>
    </div>

    <div v-if="playedCount === 0" class="opacity-70">No matches played yet.</div>

    <div v-else-if="tournament.mode === 'knockout'" class="flex flex-col gap-1">
      <div v-if="championName" class="font-semibold text-primary-500">
        <i class="pi pi-trophy mr-1" />Champion: {{ championName }}
      </div>
      <div v-else class="opacity-70">Bracket still in play.</div>
    </div>

    <div v-else class="flex flex-col gap-1">
      <div class="text-xs uppercase tracking-wide opacity-60">{{ tableTitle }}</div>
      <ol class="flex flex-col gap-0.5">
        <li v-for="(s, i) in top" :key="s.playerId" class="flex items-center gap-2">
          <span class="w-4 text-right opacity-60 tabular-nums">{{ i + 1 }}.</span>
          <span
            class="font-medium truncate"
            :class="{ 'text-primary-500': i === 0 && tournament.status === 'completed' }"
          >
            <i v-if="i === 0 && tournament.status === 'completed'" class="pi pi-trophy mr-1" />{{ s.name }}
          </span>
          <span class="ml-auto opacity-70 tabular-nums whitespace-nowrap">
            {{ s.wins }}–{{ s.losses }}
            <span class="text-xs">({{ s.pointDiff >= 0 ? '+' : '' }}{{ s.pointDiff }})</span>
          </span>
        </li>
      </ol>
    </div>
  </div>
</template>
