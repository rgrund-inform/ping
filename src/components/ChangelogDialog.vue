<script setup lang="ts">
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import type { Release } from '@/lib/changelog'

defineProps<{
  visible: boolean
  releases: Release[]
}>()
const emit = defineEmits<{
  'update:visible': [boolean]
}>()

const sectionIcons: Record<string, string> = {
  Features: 'pi pi-sparkles',
  'Bug Fixes': 'pi pi-wrench',
  'Performance Improvements': 'pi pi-bolt',
  'BREAKING CHANGES': 'pi pi-exclamation-triangle',
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="What's new"
    class="w-[26rem] max-w-[95vw]"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-5 max-h-[60vh] overflow-y-auto pr-1">
      <div v-for="release in releases" :key="release.version" class="flex flex-col gap-2">
        <div class="flex items-baseline gap-2">
          <span class="font-semibold">v{{ release.version }}</span>
          <span v-if="release.date" class="text-xs opacity-60">{{ release.date }}</span>
        </div>
        <div v-for="section in release.sections" :key="section.title" class="flex flex-col gap-1">
          <div class="text-sm font-medium opacity-80 flex items-center gap-1.5">
            <i :class="sectionIcons[section.title] ?? 'pi pi-circle-fill'" class="text-xs" />
            {{ section.title }}
          </div>
          <ul class="list-disc pl-5 text-sm flex flex-col gap-0.5">
            <li v-for="item in section.items" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>
    <template #footer>
      <Button label="Got it" @click="emit('update:visible', false)" />
    </template>
  </Dialog>
</template>
