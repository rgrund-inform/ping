<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'
import { useTournamentsStore } from '@/stores/tournaments'
import type { PlayerId, Tournament } from '@/types'
import PlayerPicker from './PlayerPicker.vue'

const props = defineProps<{ tournament: Tournament }>()
const store = useTournamentsStore()
const confirm = useConfirm()

const locked = computed(
  () => props.tournament.mode === 'knockout' && props.tournament.bracketLocked,
)

const playerNames = computed(() =>
  props.tournament.players.map((id) => ({
    id,
    name: store.players[id]?.name ?? '?',
  })),
)

const proxy = computed<{
  get: () => PlayerId[]
  set: (v: PlayerId[]) => void
}>(() => ({
  get: () => props.tournament.players,
  set: (v: PlayerId[]) => syncRoster(v),
}))

function syncRoster(next: PlayerId[]) {
  const cur = new Set(props.tournament.players)
  const desired = new Set(next)
  for (const id of next) if (!cur.has(id)) store.addPlayerToTournament(props.tournament.id, id)
  for (const id of [...cur]) if (!desired.has(id)) store.removePlayerFromTournament(props.tournament.id, id)
}

function removePlayer(id: PlayerId) {
  const unplayed = props.tournament.matches.filter(
    (m) => m.winnerSide === null && (m.a === id || m.b === id),
  ).length
  confirm.require({
    message: unplayed
      ? `Remove this player? ${unplayed} unplayed match${unplayed === 1 ? '' : 'es'} will be regenerated.`
      : 'Remove this player from the tournament?',
    header: 'Remove player',
    icon: 'pi pi-exclamation-triangle',
    accept: () => store.removePlayerFromTournament(props.tournament.id, id),
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="locked" class="rounded-lg p-3 bg-surface-100 dark:bg-surface-800 text-sm">
      <i class="pi pi-lock mr-2" />
      Roster locked — knockout brackets can't change once started.
    </div>

    <div v-if="!locked">
      <PlayerPicker :model-value="proxy.get()" @update:model-value="(v) => proxy.set(v)" />
    </div>

    <div v-else class="flex flex-col gap-2">
      <div
        v-for="p in playerNames"
        :key="p.id"
        class="rounded border border-surface-200 dark:border-surface-700 px-3 py-2 flex justify-between items-center"
      >
        <span>{{ p.name }}</span>
      </div>
    </div>

    <div v-if="!locked && tournament.status === 'running'" class="flex flex-col gap-2">
      <div class="text-xs uppercase tracking-wide opacity-60">Quick remove</div>
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="p in playerNames"
          :key="p.id"
          :label="p.name"
          icon="pi pi-times"
          severity="secondary"
          size="small"
          outlined
          @click="removePlayer(p.id)"
        />
      </div>
    </div>
  </div>
</template>
