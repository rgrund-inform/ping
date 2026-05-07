<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { useTournamentsStore } from '@/stores/tournaments'
import type { Match, Tournament } from '@/types'

const props = defineProps<{
  visible: boolean
  tournament: Tournament
  match: Match | null
}>()
const emit = defineEmits<{
  'update:visible': [boolean]
  recorded: []
}>()

const store = useTournamentsStore()
const stagedWinner = ref<'a' | 'b' | null>(null)
const stagedLoserScore = ref<number | null>(null)

watch(
  () => props.visible,
  (v) => {
    if (!v) {
      stagedWinner.value = null
      stagedLoserScore.value = null
    }
  },
)

const aName = computed(() => playerName(props.match?.a))
const bName = computed(() => playerName(props.match?.b))

const scoreOptions = computed(() => {
  const max = props.tournament.maxScore
  return Array.from({ length: max }, (_, i) => i)
})

function playerName(id: string | null | undefined): string {
  if (id == null) return '?'
  return store.players[id]?.name ?? '?'
}

/**
 * The user taps the loser's score *under the player who lost*. So tapping under "a"
 * means: b won, a's score = tapped value.
 */
function tap(losingSide: 'a' | 'b', score: number) {
  stagedWinner.value = losingSide === 'a' ? 'b' : 'a'
  stagedLoserScore.value = score
}

function confirm() {
  if (!props.match) return
  if (stagedWinner.value === null || stagedLoserScore.value === null) return
  store.recordResult(props.tournament.id, props.match.id, stagedWinner.value, stagedLoserScore.value)
  emit('recorded')
  emit('update:visible', false)
}

const winnerName = computed(() => {
  if (stagedWinner.value === null) return ''
  return stagedWinner.value === 'a' ? aName.value : bName.value
})
const loserName = computed(() => {
  if (stagedWinner.value === null) return ''
  return stagedWinner.value === 'a' ? bName.value : aName.value
})
</script>

<template>
  <Dialog
    :visible="props.visible"
    @update:visible="(v: boolean) => emit('update:visible', v)"
    modal
    :style="{ width: 'min(640px, 95vw)' }"
    header="Enter score"
    dismissable-mask
  >
    <div v-if="match" class="flex flex-col gap-4">
      <p class="text-sm opacity-70">
        Tap the score under the player who <strong>lost</strong>. The winner reaches
        {{ tournament.maxScore }}.
      </p>
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="side in (['a', 'b'] as const)"
          :key="side"
          class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 flex flex-col gap-2"
          :class="{ 'border-primary-400 bg-primary-50 dark:bg-primary-900/30': stagedWinner !== null && stagedWinner !== side }"
        >
          <div class="font-semibold text-center truncate">
            {{ side === 'a' ? aName : bName }}
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <Button
              v-for="n in scoreOptions"
              :key="n"
              :label="String(n)"
              :severity="stagedWinner !== null && stagedWinner !== side && stagedLoserScore === n ? 'primary' : 'secondary'"
              :outlined="!(stagedWinner !== null && stagedWinner !== side && stagedLoserScore === n)"
              size="small"
              class="score-tap-btn"
              @click="tap(side, n)"
            />
          </div>
        </div>
      </div>

      <div
        v-if="stagedWinner !== null"
        class="rounded-lg bg-primary-50 dark:bg-primary-900/40 border border-primary-300 dark:border-primary-700 p-3 text-center"
      >
        <strong>{{ winnerName }}</strong> beat <strong>{{ loserName }}</strong>:
        <span class="font-mono tabular-nums">{{ tournament.maxScore }} – {{ stagedLoserScore }}</span>
      </div>
    </div>

    <template #footer>
      <div class="flex gap-2 justify-end">
        <Button label="Cancel" severity="secondary" text @click="emit('update:visible', false)" />
        <Button
          label="Save result"
          icon="pi pi-check"
          :disabled="stagedWinner === null"
          @click="confirm"
        />
      </div>
    </template>
  </Dialog>
</template>
