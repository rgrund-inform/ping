<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useTournamentsStore } from '@/stores/tournaments'
import { planPlayerImport } from '@/lib/transfer'
import type { Player, PlayerId, Tournament } from '@/types'

const props = defineProps<{
  visible: boolean
  data: { tournament: Tournament; players: Record<PlayerId, Player> } | null
}>()
const emit = defineEmits<{
  'update:visible': [boolean]
  imported: [string]
}>()

const store = useTournamentsStore()

const CREATE = '__create__'

// Per imported-player id, the chosen target: a local player id or CREATE.
const choices = ref<Record<PlayerId, string>>({})

const rows = computed(() =>
  props.data ? planPlayerImport(props.data.players, store.players) : [],
)

// Options for the per-player Select: "create new" plus every local player.
const localOptions = computed(() => [
  ...store.playerList.map((p) => ({ label: p.name, value: p.id })),
])

watch(
  () => [props.visible, props.data] as const,
  ([v]) => {
    if (v && props.data) {
      const next: Record<PlayerId, string> = {}
      for (const row of rows.value) {
        next[row.imported.id] = row.matchedLocalId ?? CREATE
      }
      choices.value = next
    }
  },
  { immediate: true },
)

const matchedCount = computed(
  () => Object.values(choices.value).filter((v) => v !== CREATE).length,
)
const createCount = computed(
  () => Object.values(choices.value).filter((v) => v === CREATE).length,
)

function close() {
  emit('update:visible', false)
}

function confirm() {
  if (!props.data) return
  const resolutions: Record<
    PlayerId,
    { action: 'match'; localId: PlayerId } | { action: 'create' }
  > = {}
  for (const [importedId, target] of Object.entries(choices.value)) {
    resolutions[importedId] =
      target === CREATE ? { action: 'create' } : { action: 'match', localId: target }
  }
  const newId = store.importTournament(props.data, resolutions)
  emit('imported', newId)
  close()
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    @update:visible="(v: boolean) => emit('update:visible', v)"
    modal
    header="Import tournament"
    :style="{ width: 'min(620px, 95vw)' }"
    dismissable-mask
  >
    <div v-if="props.data" class="flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <div class="font-semibold text-lg">{{ props.data.tournament.name }}</div>
        <div class="flex flex-wrap gap-2 items-center">
          <Tag
            :value="props.data.tournament.mode === 'round-robin' ? 'Round-robin' : 'Knockout'"
            severity="secondary"
          />
          <span class="text-sm opacity-70">
            {{ rows.length }} players · {{ props.data.tournament.matches.length }} matches
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-sm font-medium">Match players</label>
        <p class="text-xs opacity-70">
          Players with a matching name are linked automatically. For the rest, create a new
          player or pick an existing one.
        </p>
        <div class="flex flex-col gap-2 mt-1">
          <div
            v-for="row in rows"
            :key="row.imported.id"
            class="flex items-center gap-3 flex-wrap"
          >
            <div class="flex items-center gap-2 min-w-[8rem]">
              <span class="font-medium">{{ row.imported.name }}</span>
              <Tag
                v-if="row.matchedLocalId"
                value="matched"
                severity="success"
                class="text-xs"
              />
              <Tag v-else value="new" severity="info" class="text-xs" />
            </div>
            <Select
              v-model="choices[row.imported.id]"
              :options="[{ label: `Create new player “${row.imported.name}”`, value: CREATE }, ...localOptions]"
              option-label="label"
              option-value="value"
              class="flex-1 min-w-[12rem]"
            />
          </div>
        </div>
      </div>

      <p class="text-xs opacity-70">
        {{ matchedCount }} linked to existing players · {{ createCount }} created
      </p>
    </div>

    <template #footer>
      <div class="flex gap-2 justify-end">
        <Button label="Cancel" severity="secondary" text @click="close" />
        <Button label="Import" icon="pi pi-check" :disabled="!props.data" @click="confirm" />
      </div>
    </template>
  </Dialog>
</template>
