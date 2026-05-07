<script setup lang="ts">
import { computed } from 'vue'
import { useTournamentsStore } from '@/stores/tournaments'
import type { Match, Tournament } from '@/types'

const props = defineProps<{ tournament: Tournament }>()
const emit = defineEmits<{ select: [Match] }>()

const store = useTournamentsStore()

const rounds = computed(() => {
  const max = props.tournament.matches.reduce((m, x) => Math.max(m, x.round), 0)
  const out: Match[][] = []
  for (let r = 1; r <= max; r++) {
    out.push(
      props.tournament.matches
        .filter((m) => m.round === r)
        .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)),
    )
  }
  return out
})

function nameOf(id: string | null): string {
  if (id === null) return '—'
  return store.players[id]?.name ?? '?'
}

function isClickable(m: Match): boolean {
  return m.winnerSide === null && m.a !== null && m.b !== null
}

function roundLabel(idx: number, total: number): string {
  if (idx === total - 1) return 'Final'
  if (idx === total - 2) return 'Semifinal'
  if (idx === total - 3) return 'Quarterfinal'
  return `Round ${idx + 1}`
}
</script>

<template>
  <div class="overflow-x-auto">
    <div class="inline-flex gap-6 p-2 min-w-full">
      <div
        v-for="(matches, rIdx) in rounds"
        :key="rIdx"
        class="flex flex-col justify-around min-w-48"
      >
        <div class="text-xs uppercase tracking-wide opacity-60 mb-2 text-center">
          {{ roundLabel(rIdx, rounds.length) }}
        </div>
        <div class="flex flex-col gap-3 flex-1 justify-around">
          <div
            v-for="m in matches"
            :key="m.id"
            class="rounded border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 text-sm"
            :class="{
              'cursor-pointer hover:border-primary-400': isClickable(m),
              'opacity-60': m.bye,
            }"
            @click="isClickable(m) && emit('select', m)"
          >
            <div
              class="px-2 py-1.5 flex justify-between items-center gap-2 border-b border-surface-200 dark:border-surface-700"
              :class="{ 'font-semibold': m.winnerSide === 'a' }"
            >
              <span class="truncate">{{ nameOf(m.a) }}</span>
              <span v-if="m.winnerSide" class="font-mono tabular-nums shrink-0">
                {{ m.winnerSide === 'a' ? tournament.maxScore : (m.loserScore ?? 0) }}
              </span>
            </div>
            <div
              class="px-2 py-1.5 flex justify-between items-center gap-2"
              :class="{ 'font-semibold': m.winnerSide === 'b' }"
            >
              <span class="truncate">{{ nameOf(m.b) }}</span>
              <span v-if="m.winnerSide" class="font-mono tabular-nums shrink-0">
                {{ m.winnerSide === 'b' ? tournament.maxScore : (m.loserScore ?? 0) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
