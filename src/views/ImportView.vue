<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { decodeTournamentShare } from '@/lib/shareCodec'
import type { Player, PlayerId, Tournament } from '@/types'
import ImportTournamentDialog from '@/components/ImportTournamentDialog.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const pending = ref(true)
const showImport = ref(false)
const importData = ref<{ tournament: Tournament; players: Record<PlayerId, Player> } | null>(null)
const imported = ref(false)

onMounted(async () => {
  const d = route.query.d
  if (typeof d !== 'string' || d.length === 0) {
    toast.add({ severity: 'error', summary: 'Import failed', detail: 'This share link is invalid.', life: 6000 })
    router.replace({ name: 'home' })
    return
  }
  const result = await decodeTournamentShare(d)
  if (!result.ok) {
    toast.add({ severity: 'error', summary: 'Import failed', detail: result.error, life: 6000 })
    router.replace({ name: 'home' })
    return
  }
  pending.value = false
  importData.value = result.data
  showImport.value = true
})

function onImported(id: string) {
  imported.value = true
  toast.add({ severity: 'success', summary: 'Tournament imported', life: 3000 })
  router.replace({ name: 'tournament', params: { id } })
}

function onOpenExisting(id: string) {
  imported.value = true // suppress the go-home redirect from the dialog closing
  router.replace({ name: 'tournament', params: { id } })
}

function onVisibleChange(v: boolean) {
  showImport.value = v
  // Dialog dismissed without importing: nothing to show here, go home.
  if (!v && !imported.value) router.replace({ name: 'home' })
}
</script>

<template>
  <div class="flex flex-col items-center gap-3 py-16 text-center">
    <template v-if="pending">
      <i class="pi pi-spinner pi-spin text-3xl text-primary-500" />
      <p class="opacity-70">Reading shared tournament…</p>
    </template>

    <ImportTournamentDialog
      :visible="showImport"
      :data="importData"
      @update:visible="onVisibleChange"
      @imported="onImported"
      @open="onOpenExisting"
    />
  </div>
</template>
