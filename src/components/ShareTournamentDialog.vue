<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import qrcode from 'qrcode-generator'
import { useTournamentsStore } from '@/stores/tournaments'
import { encodeTournamentShare } from '@/lib/shareCodec'
import type { Tournament } from '@/types'

const props = defineProps<{
  visible: boolean
  tournament: Tournament | null
}>()
const emit = defineEmits<{
  'update:visible': [boolean]
}>()

const store = useTournamentsStore()
const toast = useToast()

const url = ref('')
const qrSvg = ref('')
const qrError = ref(false)
const pending = ref(false)
const canShare = typeof navigator !== 'undefined' && !!navigator.share

watch(
  () => [props.visible, props.tournament] as const,
  async ([v, t]) => {
    if (!v || !t) return
    pending.value = true
    url.value = ''
    qrSvg.value = ''
    qrError.value = false
    const payload = await encodeTournamentShare(t, store.players)
    url.value = `${location.origin}${location.pathname}#/import?d=${payload}`
    try {
      const qr = qrcode(0, 'M')
      qr.addData(url.value, 'Byte')
      qr.make()
      qrSvg.value = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true })
    } catch {
      // QR capacity overflow for very large tournaments — the link still works.
      qrError.value = true
    }
    pending.value = false
  },
  { immediate: true },
)

function close() {
  emit('update:visible', false)
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(url.value)
    toast.add({ severity: 'success', summary: 'Link copied', life: 2000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Copy failed', detail: String(err), life: 5000 })
  }
}

async function shareLink() {
  if (!props.tournament) return
  try {
    await navigator.share({ title: props.tournament.name, url: url.value })
  } catch {
    // AbortError when the user dismisses the share sheet — nothing to report.
  }
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    @update:visible="(v: boolean) => emit('update:visible', v)"
    modal
    header="Share tournament"
    :style="{ width: 'min(420px, 95vw)' }"
    dismissable-mask
  >
    <div v-if="props.tournament" class="flex flex-col items-center gap-4">
      <p class="text-sm opacity-70 text-center">
        Scan the code or send the link — the tournament and its players travel inside it.
      </p>

      <div v-if="pending" class="py-8 text-center">
        <i class="pi pi-spinner pi-spin text-2xl text-primary-500" />
      </div>

      <!-- White box so the code scans in dark theme too. -->
      <div
        v-else-if="qrSvg"
        class="bg-white p-3 rounded-lg w-[16rem] max-w-full"
        v-html="qrSvg"
      />
      <p v-else-if="qrError" class="text-sm opacity-70 text-center">
        This tournament is too large for a QR code — use Copy link instead.
      </p>

      <div class="flex gap-2 justify-center flex-wrap">
        <Button
          label="Copy link"
          icon="pi pi-copy"
          :disabled="pending || !url"
          @click="copyLink"
        />
        <Button
          v-if="canShare"
          label="Share…"
          icon="pi pi-share-alt"
          severity="secondary"
          outlined
          :disabled="pending || !url"
          @click="shareLink"
        />
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <Button label="Close" severity="secondary" text @click="close" />
      </div>
    </template>
  </Dialog>
</template>
