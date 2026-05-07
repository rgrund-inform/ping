<script setup lang="ts">
import { computed } from 'vue'
import { useTournamentsStore } from '@/stores/tournaments'
import type { Tournament } from '@/types'

const props = defineProps<{ tournament: Tournament }>()
const store = useTournamentsStore()

const rows = computed(() =>
  store
    .standingsFor(props.tournament.id)
    .map((s, i) => ({
      rank: i + 1,
      name: store.players[s.playerId]?.name ?? '?',
      ...s,
    })),
)
</script>

<template>
  <table class="w-full text-sm border-collapse">
    <thead>
      <tr class="text-left">
        <th class="px-2 py-2 w-8">#</th>
        <th class="px-2 py-2">Player</th>
        <th class="px-2 py-2 text-right w-12">W</th>
        <th class="px-2 py-2 text-right w-12">L</th>
        <th class="px-2 py-2 text-right w-16">Diff</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="r in rows"
        :key="r.playerId"
        class="border-t border-surface-200 dark:border-surface-700"
        :class="{ 'bg-primary-50 dark:bg-primary-900/30': r.rank === 1 && r.played > 0 }"
      >
        <td class="px-2 py-2 font-mono opacity-70">{{ r.rank }}</td>
        <td class="px-2 py-2">{{ r.name }}</td>
        <td class="px-2 py-2 text-right font-mono tabular-nums">{{ r.wins }}</td>
        <td class="px-2 py-2 text-right font-mono tabular-nums">{{ r.losses }}</td>
        <td
          class="px-2 py-2 text-right font-mono tabular-nums"
          :class="{
            'text-positive': r.pointDiff > 0,
            'text-negative': r.pointDiff < 0,
          }"
        >
          {{ r.pointDiff > 0 ? '+' : '' }}{{ r.pointDiff }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
