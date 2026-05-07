<script setup lang="ts">
import { computed } from 'vue'
import { useTournamentsStore } from '@/stores/tournaments'
import type { Match, Tournament } from '@/types'

const props = defineProps<{
  tournament: Tournament
  match: Match
  clickable?: boolean
}>()

const emit = defineEmits<{ click: [Match] }>()

const store = useTournamentsStore()

const aName = computed(() => playerName(props.match.a))
const bName = computed(() => playerName(props.match.b))

const winnerSide = computed(() => props.match.winnerSide)
const aScore = computed(() => {
  if (winnerSide.value === null) return null
  return winnerSide.value === 'a' ? props.tournament.maxScore : (props.match.loserScore ?? 0)
})
const bScore = computed(() => {
  if (winnerSide.value === null) return null
  return winnerSide.value === 'b' ? props.tournament.maxScore : (props.match.loserScore ?? 0)
})

function playerName(id: string | null): string {
  if (id === null) return '— bye —'
  return store.players[id]?.name ?? '?'
}

function onClick() {
  if (props.clickable) emit('click', props.match)
}
</script>

<template>
  <button
    type="button"
    class="w-full text-left rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-3 flex items-center gap-3 transition-colors"
    :class="{
      'cursor-pointer hover:border-primary-400': clickable,
      'cursor-default': !clickable,
    }"
    @click="onClick"
  >
    <div class="text-xs opacity-60 w-12 shrink-0 text-center">
      <div>R{{ match.round }}</div>
      <div v-if="match.bye" class="uppercase">bye</div>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex justify-between items-center gap-2">
        <span
          class="truncate"
          :class="{ 'font-semibold': winnerSide === 'a', 'opacity-60': winnerSide === 'b' }"
        >
          {{ aName }}
        </span>
        <span
          v-if="aScore !== null"
          class="font-mono tabular-nums text-lg shrink-0"
          :class="{ 'font-bold text-primary-500': winnerSide === 'a' }"
        >
          {{ aScore }}
        </span>
      </div>
      <div class="flex justify-between items-center gap-2">
        <span
          class="truncate"
          :class="{ 'font-semibold': winnerSide === 'b', 'opacity-60': winnerSide === 'a' }"
        >
          {{ bName }}
        </span>
        <span
          v-if="bScore !== null"
          class="font-mono tabular-nums text-lg shrink-0"
          :class="{ 'font-bold text-primary-500': winnerSide === 'b' }"
        >
          {{ bScore }}
        </span>
      </div>
    </div>
    <i
      v-if="clickable && winnerSide === null"
      class="pi pi-pencil opacity-40 shrink-0"
    />
  </button>
</template>
