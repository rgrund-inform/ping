<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import Button from 'primevue/button'
import PlayerPicker from './PlayerPicker.vue'
import { useTournamentsStore } from '@/stores/tournaments'
import { isSameDay } from '@/lib/date'
import type { PlayerId, ScoringMode, Seeding, TournamentMode } from '@/types'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  'update:visible': [boolean]
  created: [string]
}>()

/**
 * The picker offers three modes, but only two of them are scheduling modes:
 * "quick" is a round-robin that records winners instead of scores.
 */
type ModeChoice = 'quick' | 'round-robin' | 'knockout'

const store = useTournamentsStore()
const name = ref('')
const modeChoice = ref<ModeChoice>('round-robin')
const maxScore = ref(7)
const seeding = ref<Seeding>('win-rate')
const players = ref<PlayerId[]>([])

const modeOptions = [
  { label: 'Quick', value: 'quick' },
  { label: 'Round-robin', value: 'round-robin' },
  { label: 'Knockout', value: 'knockout' },
]
const seedOptions = [
  { label: 'Historical win-rate', value: 'win-rate' },
  { label: 'Random', value: 'random' },
]

const modeHint: Record<ModeChoice, string> = {
  quick: 'Everyone plays everyone. Just tap who won — first to a two-point lead. No scores to enter.',
  'round-robin': 'Everyone plays everyone. Most wins takes it.',
  knockout: 'Single elimination tree. Top seeds get byes when player count is uneven.',
}

const isQuick = computed(() => modeChoice.value === 'quick')

/**
 * Roster of the most recent tournament, offered for reuse only while it is
 * still the same day — that's the case where you're running a second round
 * with the same group and re-picking everyone by hand is pure friction.
 */
const reusableRoster = computed<PlayerId[] | null>(() => {
  const last = store.sortedTournaments[0]
  if (!last || !isSameDay(last.createdAt, Date.now())) return null
  // Skip players that have since been deleted from the global roster.
  const ids = last.players.filter((id) => store.players[id])
  return ids.length >= 2 ? ids : null
})

watch(
  () => props.visible,
  (v) => {
    if (v) {
      name.value = defaultName()
      modeChoice.value = 'round-robin'
      maxScore.value = 7
      seeding.value = 'win-rate'
      players.value = []
    }
  },
)

function defaultName() {
  const d = new Date()
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} tournament`
}

function reuseRoster() {
  if (reusableRoster.value) players.value = [...reusableRoster.value]
}

function close() {
  emit('update:visible', false)
}

function submit() {
  if (players.value.length < 2) return
  const mode: TournamentMode = modeChoice.value === 'knockout' ? 'knockout' : 'round-robin'
  const scoring: ScoringMode = isQuick.value ? 'wins' : 'points'
  const t = store.createTournament({
    name: name.value,
    mode,
    scoring,
    maxScore: maxScore.value,
    seeding: mode === 'knockout' ? seeding.value : undefined,
    players: players.value,
  })
  store.startTournament(t.id)
  emit('created', t.id)
  close()
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    @update:visible="(v: boolean) => emit('update:visible', v)"
    modal
    header="New tournament"
    :style="{ width: 'min(560px, 95vw)' }"
    dismissable-mask
  >
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Name</label>
        <InputText v-model="name" />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Mode</label>
        <SelectButton
          v-model="modeChoice"
          :options="modeOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
        />
        <p class="text-xs opacity-70">{{ modeHint[modeChoice] }}</p>
      </div>

      <div v-if="!isQuick" class="flex gap-4">
        <div class="flex flex-col gap-1 flex-1">
          <label class="text-sm font-medium">Max score (winning score)</label>
          <InputNumber
            v-model="maxScore"
            :min="3"
            :max="30"
            show-buttons
            button-layout="horizontal"
            decrement-button-class="p-button-secondary"
            increment-button-class="p-button-secondary"
          />
          <p class="text-xs opacity-70">
            Tap the loser's score (0…{{ maxScore - 1 }}) to record a match.
          </p>
        </div>
      </div>

      <div v-if="modeChoice === 'knockout'" class="flex flex-col gap-1">
        <label class="text-sm font-medium">Seeding</label>
        <SelectButton v-model="seeding" :options="seedOptions" option-label="label" option-value="value" />
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-sm font-medium">Players</label>
        <Button
          v-if="reusableRoster"
          :label="`Same players as last tournament (${reusableRoster.length})`"
          icon="pi pi-replay"
          severity="secondary"
          outlined
          size="small"
          class="self-start"
          @click="reuseRoster"
        />
        <PlayerPicker v-model="players" />
      </div>
    </div>

    <template #footer>
      <div class="flex gap-2 justify-end">
        <Button label="Cancel" severity="secondary" text @click="close" />
        <Button
          label="Start tournament"
          icon="pi pi-play"
          :disabled="players.length < 2"
          @click="submit"
        />
      </div>
    </template>
  </Dialog>
</template>
