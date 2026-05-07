<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import { useTournamentsStore } from '@/stores/tournaments'
import { generateFacts, pickFact } from '@/lib/facts'
import type { Fact } from '@/types'

const store = useTournamentsStore()
const lastId = ref<string | undefined>(undefined)
const fact = ref<Fact | null>(null)

const facts = computed(() =>
  generateFacts({ players: store.players, tournaments: store.tournaments }),
)

function shuffle() {
  const f = pickFact(facts.value, lastId.value)
  fact.value = f
  lastId.value = f?.id
}

onMounted(shuffle)
</script>

<template>
  <div
    v-if="fact"
    class="rounded-lg p-4 bg-primary-50 dark:bg-primary-900 border border-primary-200 dark:border-primary-700 flex items-center gap-3"
  >
    <i class="pi pi-sparkles text-primary-500 text-xl shrink-0" />
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
  <div v-else class="rounded-lg p-4 border border-surface-200 dark:border-surface-700 text-sm opacity-70">
    Play a few matches and interesting facts will appear here.
  </div>
</template>
