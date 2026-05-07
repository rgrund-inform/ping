<script setup lang="ts">
import { computed, ref } from 'vue'
import Chip from 'primevue/chip'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useTournamentsStore } from '@/stores/tournaments'
import type { PlayerId } from '@/types'

const props = defineProps<{ modelValue: PlayerId[] }>()
const emit = defineEmits<{ 'update:modelValue': [PlayerId[]] }>()

const store = useTournamentsStore()
const newName = ref('')

const selectedSet = computed(() => new Set(props.modelValue))

const suggestions = computed(() =>
  store.suggested.filter((s) => !selectedSet.value.has(s.player.id)).slice(0, 12),
)

const selectedPlayers = computed(() =>
  props.modelValue.map((id) => store.players[id]).filter((p) => !!p),
)

function addExisting(id: PlayerId) {
  if (selectedSet.value.has(id)) return
  emit('update:modelValue', [...props.modelValue, id])
}

function addNew() {
  const name = newName.value.trim()
  if (!name) return
  const player = store.upsertPlayer(name)
  if (!selectedSet.value.has(player.id)) {
    emit('update:modelValue', [...props.modelValue, player.id])
  }
  newName.value = ''
}

function remove(id: PlayerId) {
  emit('update:modelValue', props.modelValue.filter((p) => p !== id))
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="selectedPlayers.length" class="flex flex-wrap gap-2">
      <Chip
        v-for="p in selectedPlayers"
        :key="p.id"
        :label="p.name"
        removable
        @remove="remove(p.id)"
      />
    </div>

    <form class="flex gap-2" @submit.prevent="addNew">
      <InputText
        v-model="newName"
        placeholder="Add a player by name…"
        class="flex-1"
        autocomplete="off"
      />
      <Button type="submit" icon="pi pi-plus" label="Add" :disabled="!newName.trim()" />
    </form>

    <div v-if="suggestions.length" class="flex flex-col gap-1">
      <div class="text-xs uppercase tracking-wide opacity-60">From previous tournaments</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="s in suggestions"
          :key="s.player.id"
          class="px-3 py-1 rounded-full text-sm border border-primary-200 hover:bg-primary-50 dark:hover:bg-primary-900 transition-colors cursor-pointer bg-transparent"
          type="button"
          @click="addExisting(s.player.id)"
        >
          + {{ s.player.name }}
        </button>
      </div>
    </div>
  </div>
</template>
