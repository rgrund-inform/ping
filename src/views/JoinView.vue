<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useSyncStore } from '@/stores/sync'
import { SYNC_ENABLED } from '@/lib/sync/client'
import { validJoin } from '@/lib/sync/joinCode'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const sync = useSyncStore()

function goHome() {
  // replace() also drops the token from the address bar and history.
  router.replace({ name: 'home' })
}

function fail(detail: string) {
  toast.add({ severity: 'error', summary: 'Cannot join sync space', detail, life: 6000 })
  goHome()
}

function joinNow(spaceId: string, token: string) {
  sync.join(spaceId, token)
  toast.add({
    severity: 'success',
    summary: 'Joined sync space',
    detail: 'Tournaments on this device are now shared with the space.',
    life: 4000,
  })
  goHome()
}

onMounted(() => {
  if (!SYNC_ENABLED) return fail('Sync is not available in this version of Ping.')
  const creds = validJoin(route.query.s, route.query.k)
  if (!creds) return fail('This sync link is invalid.')

  if (!sync.space) return joinNow(creds.spaceId, creds.token)

  if (sync.space.id === creds.spaceId) {
    toast.add({ severity: 'info', summary: 'Already in this sync space', life: 3000 })
    return goHome()
  }

  let handled = false
  confirm.require({
    header: 'Switch sync space?',
    message: `This device leaves space ${sync.space.id.slice(0, 6)}… and joins ${creds.spaceId.slice(0, 6)}…. Every tournament on this device, including those from the current space, will be shared with the new space.`,
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Switch',
    accept: () => {
      handled = true
      joinNow(creds.spaceId, creds.token)
    },
    reject: () => {
      handled = true
      goHome()
    },
    onHide: () => {
      if (!handled) goHome()
    },
  })
})
</script>

<template>
  <div class="flex flex-col items-center gap-3 py-16 text-center">
    <i class="pi pi-cloud text-3xl text-primary-500" />
    <p class="opacity-70">Joining sync space…</p>
  </div>
</template>
