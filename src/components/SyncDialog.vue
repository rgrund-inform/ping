<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Divider from 'primevue/divider'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import qrcode from 'qrcode-generator'
import { syncedAgo, useSyncStore } from '@/stores/sync'
import { buildJoinUrl, parseJoinInput } from '@/lib/sync/joinCode'

const props = defineProps<{
  visible: boolean
}>()
const emit = defineEmits<{
  'update:visible': [boolean]
}>()

const sync = useSyncStore()
const toast = useToast()
const confirm = useConfirm()

const creating = ref(false)
const joinInput = ref('')
const canShare = typeof navigator !== 'undefined' && !!navigator.share

// Re-render "2 min ago" while the dialog is open.
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
watch(
  () => props.visible,
  (v) => {
    if (ticker) clearInterval(ticker)
    ticker = null
    if (v) {
      now.value = Date.now()
      ticker = setInterval(() => (now.value = Date.now()), 15_000)
    }
  },
  { immediate: true },
)
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})

const joinUrl = computed(() =>
  sync.space ? buildJoinUrl(sync.space.id, sync.space.token) : '',
)

const qrSvg = computed(() => {
  if (!joinUrl.value) return ''
  try {
    const qr = qrcode(0, 'M')
    qr.addData(joinUrl.value, 'Byte')
    qr.make()
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true })
  } catch {
    return ''
  }
})

const status = computed(() => {
  switch (sync.status) {
    case 'syncing':
      return { icon: 'pi pi-sync pi-spin', text: 'Syncing…', cls: 'text-primary-500' }
    case 'offline':
      return {
        icon: 'pi pi-wifi',
        text: 'Offline — changes sync when you are back online',
        cls: 'opacity-60',
      }
    case 'error':
      return {
        icon: 'pi pi-exclamation-triangle',
        text: sync.error ?? 'Sync failed',
        cls: 'text-red-500',
      }
    default:
      return {
        icon: 'pi pi-check-circle',
        text: `Synced ${syncedAgo(sync.lastSyncAt, now.value)}`,
        cls: 'text-primary-500',
      }
  }
})

function close() {
  emit('update:visible', false)
}

async function create() {
  creating.value = true
  try {
    await sync.createAndJoin()
    toast.add({ severity: 'success', summary: 'Sync space created', life: 3000 })
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Could not create a sync space',
      detail: err instanceof Error ? err.message : String(err),
      life: 6000,
    })
  } finally {
    creating.value = false
  }
}

function join() {
  const parsed = parseJoinInput(joinInput.value)
  if (!parsed) {
    toast.add({
      severity: 'error',
      summary: 'Invalid code',
      detail: 'Paste the sync link or code from another device.',
      life: 5000,
    })
    return
  }
  sync.join(parsed.spaceId, parsed.token)
  joinInput.value = ''
  toast.add({ severity: 'success', summary: 'Joined sync space', life: 3000 })
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(joinUrl.value)
    toast.add({ severity: 'success', summary: 'Link copied', life: 2000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Copy failed', detail: String(err), life: 5000 })
  }
}

async function shareLink() {
  try {
    await navigator.share({ title: 'Join my Ping sync space', url: joinUrl.value })
  } catch {
    // AbortError when the user dismisses the share sheet — nothing to report.
  }
}

function leave() {
  confirm.require({
    header: 'Leave sync space?',
    message:
      'This device stops syncing. Data already in the space stays there, and your local data is kept.',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Leave',
    acceptClass: 'p-button-danger',
    accept: () => {
      sync.leave()
      toast.add({ severity: 'info', summary: 'Left sync space', life: 3000 })
    },
  })
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    modal
    header="Sync"
    class="w-[26rem] max-w-[95vw]"
    dismissable-mask
    @update:visible="emit('update:visible', $event)"
  >
    <!-- Not joined -->
    <div v-if="!sync.space" class="flex flex-col gap-3">
      <p class="text-sm opacity-80">
        Share one tournament list across phones. Anyone with the link can read and edit.
      </p>
      <p v-if="sync.error" class="text-sm text-red-500 flex items-start gap-2">
        <i class="pi pi-exclamation-triangle mt-0.5" />
        <span>{{ sync.error }}</span>
      </p>
      <Button
        label="Create sync space"
        icon="pi pi-plus"
        :loading="creating"
        @click="create"
      />

      <Divider align="center">
        <span class="text-xs opacity-60">or join one</span>
      </Divider>

      <form class="flex gap-2" @submit.prevent="join">
        <InputText
          v-model="joinInput"
          placeholder="Sync link or code"
          class="flex-1 min-w-0"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <Button type="submit" label="Join" :disabled="!joinInput.trim()" />
      </form>
      <p class="text-xs opacity-60">
        Joining shares the players and tournaments on this device with the space.
      </p>
    </div>

    <!-- Joined -->
    <div v-else class="flex flex-col items-center gap-4">
      <div class="w-full flex items-start gap-2 text-sm" :class="status.cls">
        <i :class="status.icon" class="mt-0.5" />
        <span>{{ status.text }}</span>
      </div>

      <p class="text-sm opacity-70 text-center">
        Scan on another phone to join. Anyone with this code can read and edit.
      </p>

      <!-- White box so the code scans in dark theme too. -->
      <div v-if="qrSvg" class="bg-white p-3 rounded-lg w-[16rem] max-w-full" v-html="qrSvg" />

      <div
        class="w-full text-xs font-mono break-all rounded border border-surface-200 dark:border-surface-700 p-2 opacity-80 select-all"
      >
        {{ joinUrl }}
      </div>

      <div class="flex gap-2 justify-center flex-wrap">
        <Button label="Copy link" icon="pi pi-copy" @click="copyLink" />
        <Button
          v-if="canShare"
          label="Share…"
          icon="pi pi-share-alt"
          severity="secondary"
          outlined
          @click="shareLink"
        />
      </div>
    </div>

    <template #footer>
      <div class="flex justify-between w-full gap-2 flex-wrap">
        <div class="flex gap-2">
          <template v-if="sync.space">
            <Button
              label="Sync now"
              icon="pi pi-sync"
              severity="secondary"
              outlined
              :disabled="sync.status === 'syncing'"
              @click="sync.syncNow()"
            />
            <Button label="Leave space" severity="danger" text @click="leave" />
          </template>
        </div>
        <Button label="Close" severity="secondary" text @click="close" />
      </div>
    </template>
  </Dialog>
</template>
