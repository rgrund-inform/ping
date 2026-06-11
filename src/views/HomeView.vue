<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { useTournamentsStore } from '@/stores/tournaments'
import { parseTournamentExport } from '@/lib/transfer'
import type { Player, PlayerId, Tournament } from '@/types'
import NewTournamentDialog from '@/components/NewTournamentDialog.vue'
import ImportTournamentDialog from '@/components/ImportTournamentDialog.vue'
import FactCard from '@/components/FactCard.vue'

const store = useTournamentsStore()
const router = useRouter()
const toast = useToast()
const showNew = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const showImport = ref(false)
const importData = ref<{ tournament: Tournament; players: Record<PlayerId, Player> } | null>(null)

const running = computed(() => store.sortedTournaments.filter((t) => t.status === 'running'))
const completed = computed(() => store.sortedTournaments.filter((t) => t.status === 'completed'))

function open(id: string) {
  router.push({ name: 'tournament', params: { id } })
}

function dateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function modeLabel(mode: string): string {
  return mode === 'round-robin' ? 'Round-robin' : 'Knockout'
}

function onCreated(id: string) {
  router.push({ name: 'tournament', params: { id } })
}

function pickImport() {
  fileInput.value?.click()
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  let raw: string
  try {
    raw = await file.text()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Import failed', detail: String(err), life: 5000 })
    return
  }
  const result = parseTournamentExport(raw)
  if (!result.ok) {
    toast.add({ severity: 'error', summary: 'Import failed', detail: result.error, life: 6000 })
    return
  }
  importData.value = result.data
  showImport.value = true
}

function onImported(id: string) {
  toast.add({ severity: 'success', summary: 'Tournament imported', life: 3000 })
  router.push({ name: 'tournament', params: { id } })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl md:text-3xl font-semibold">Tournaments</h1>
      <div class="flex items-center gap-2">
        <Button
          label="Import"
          icon="pi pi-upload"
          severity="secondary"
          outlined
          @click="pickImport"
        />
        <Button label="New tournament" icon="pi pi-plus" @click="showNew = true" />
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      class="hidden"
      @change="onFile"
    />

    <FactCard />

    <section v-if="running.length" class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">Running</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          v-for="t in running"
          :key="t.id"
          class="text-left p-4 rounded-lg border border-primary-300 bg-primary-50 dark:bg-primary-900/30 hover:border-primary-500 transition-colors cursor-pointer"
          @click="open(t.id)"
        >
          <div class="text-xs uppercase tracking-wide opacity-60">{{ modeLabel(t.mode) }}</div>
          <div class="font-semibold text-lg">{{ t.name }}</div>
          <div class="text-sm opacity-70">
            {{ t.players.length }} players · started {{ dateLabel(t.startedAt ?? t.createdAt) }}
          </div>
        </button>
      </div>
    </section>

    <section v-if="completed.length" class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">Past tournaments</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          v-for="t in completed.slice(0, 6)"
          :key="t.id"
          class="text-left p-4 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-primary-400 transition-colors cursor-pointer"
          @click="open(t.id)"
        >
          <div class="text-xs uppercase tracking-wide opacity-60">{{ modeLabel(t.mode) }}</div>
          <div class="font-semibold">{{ t.name }}</div>
          <div class="text-sm opacity-70">
            {{ t.players.length }} players · {{ dateLabel(t.completedAt ?? t.createdAt) }}
          </div>
        </button>
      </div>
      <div v-if="completed.length > 6">
        <Button label="See full history" icon="pi pi-history" text @click="router.push({ name: 'history' })" />
      </div>
    </section>

    <section
      v-if="!running.length && !completed.length"
      class="rounded-lg border border-dashed border-surface-300 dark:border-surface-700 p-8 text-center flex flex-col items-center gap-3"
    >
      <i class="pi pi-trophy text-4xl text-primary-500" />
      <p class="text-lg">No tournaments yet.</p>
      <Button label="Plan your first tournament" icon="pi pi-plus" @click="showNew = true" />
    </section>

    <NewTournamentDialog v-model:visible="showNew" @created="onCreated" />
    <ImportTournamentDialog v-model:visible="showImport" :data="importData" @imported="onImported" />
  </div>
</template>
