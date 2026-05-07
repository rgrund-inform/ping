<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import Button from 'primevue/button'
import PlayerPicker from './PlayerPicker.vue'
import { useTournamentsStore } from '@/stores/tournaments'
import type { PlayerId, Seeding, TournamentMode } from '@/types'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  'update:visible': [boolean]
  created: [string]
}>()

const store = useTournamentsStore()
const name = ref('')
const mode = ref<TournamentMode>('round-robin')
const maxScore = ref(7)
const seeding = ref<Seeding>('win-rate')
const players = ref<PlayerId[]>([])

const modeOptions = [
  { label: 'Round-robin', value: 'round-robin' },
  { label: 'Knockout', value: 'knockout' },
]
const seedOptions = [
  { label: 'Historical win-rate', value: 'win-rate' },
  { label: 'Random', value: 'random' },
]

watch(
  () => props.visible,
  (v) => {
    if (v) {
      name.value = defaultName()
      mode.value = 'round-robin'
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

function close() {
  emit('update:visible', false)
}

function submit() {
  if (players.value.length < 2) return
  const t = store.createTournament({
    name: name.value,
    mode: mode.value,
    maxScore: maxScore.value,
    seeding: mode.value === 'knockout' ? seeding.value : undefined,
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
        <SelectButton v-model="mode" :options="modeOptions" option-label="label" option-value="value" />
        <p class="text-xs opacity-70">
          {{
            mode === 'round-robin'
              ? 'Everyone plays everyone. Most wins takes it.'
              : 'Single elimination tree. Top seeds get byes when player count is uneven.'
          }}
        </p>
      </div>

      <div class="flex gap-4">
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

      <div v-if="mode === 'knockout'" class="flex flex-col gap-1">
        <label class="text-sm font-medium">Seeding</label>
        <SelectButton v-model="seeding" :options="seedOptions" option-label="label" option-value="value" />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Players</label>
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
