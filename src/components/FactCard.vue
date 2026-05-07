<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { useTournamentsStore } from '@/stores/tournaments'
import { factsAboutPlayers, generateFacts, pickFact } from '@/lib/facts'
import type { Fact, PlayerId } from '@/types'

const props = defineProps<{
  /** When set, the card prefers facts about these players (falls back to general). */
  preferPlayers?: PlayerId[]
  /** Visual hint that this fact is hyping the next match. */
  hype?: boolean
}>()

const store = useTournamentsStore()
const lastId = ref<string | undefined>(undefined)
const fact = ref<Fact | null>(null)

const allFacts = computed(() =>
  generateFacts({ players: store.players, tournaments: store.tournaments }),
)

const pool = computed(() => {
  if (!props.preferPlayers || props.preferPlayers.length === 0) return allFacts.value
  const matched = factsAboutPlayers(allFacts.value, props.preferPlayers)
  return matched.length > 0 ? matched : allFacts.value
})

function shuffle() {
  const f = pickFact(pool.value, lastId.value)
  fact.value = f
  lastId.value = f?.id
}

onMounted(shuffle)
watch(
  () => props.preferPlayers?.join('|'),
  () => shuffle(),
)
</script>

<template>
  <div
    v-if="fact"
    class="rounded-lg p-4 flex items-center gap-3 border"
    :class="
      hype
        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
        : 'bg-primary-50 dark:bg-primary-900 border-primary-200 dark:border-primary-700'
    "
  >
    <i
      class="text-xl shrink-0"
      :class="hype ? 'pi pi-bolt text-amber-500' : 'pi pi-sparkles text-primary-500'"
    />
    <p class="flex-1 text-sm md:text-base">{{ fact.text }}</p>
    <Button
      icon="pi pi-refresh"
      severity="secondary"
      text
      rounded
      size="small"
      @click="shuffle"
      v-tooltip="'Another fact'"
    />
  </div>
  <div
    v-else-if="!hype"
    class="rounded-lg p-4 border border-surface-200 dark:border-surface-700 text-sm opacity-70"
  >
    Play a few matches and interesting facts will appear here.
  </div>
</template>
