<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Menubar from 'primevue/menubar'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'

const router = useRouter()
const dark = ref(true)

const items = computed(() => [
  {
    label: 'Tournaments',
    icon: 'pi pi-table',
    command: () => router.push({ name: 'home' }),
  },
  {
    label: 'Players',
    icon: 'pi pi-users',
    command: () => router.push({ name: 'players' }),
  },
  {
    label: 'History',
    icon: 'pi pi-history',
    command: () => router.push({ name: 'history' }),
  },
])

function toggleDark() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('app-theme-dark', dark.value)
  localStorage.setItem('ping.theme', dark.value ? 'dark' : 'light')
}

// Install prompt
const installEvent = ref<Event | null>(null)
const canInstall = computed(() => !!installEvent.value)

async function install() {
  const ev = installEvent.value as unknown as { prompt?: () => Promise<void> } | null
  if (!ev?.prompt) return
  await ev.prompt()
  installEvent.value = null
}

onMounted(() => {
  const saved = localStorage.getItem('ping.theme')
  // Default to dark; respect explicit preference if the user has toggled before.
  dark.value = saved === 'light' ? false : true
  document.documentElement.classList.toggle('app-theme-dark', dark.value)
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    installEvent.value = e
  })
})
</script>

<template>
  <Menubar :model="items" class="app-menubar">
    <template #start>
      <button
        class="flex items-center gap-2 mr-4 cursor-pointer bg-transparent border-0 text-white font-semibold text-lg"
        @click="router.push({ name: 'home' })"
      >
        <i class="pi pi-circle-fill text-white/80" />
        <span>Ping</span>
      </button>
    </template>
    <template #end>
      <div class="flex items-center gap-2">
        <Button
          v-if="canInstall"
          icon="pi pi-download"
          label="Install"
          severity="secondary"
          size="small"
          @click="install"
        />
        <Button
          :icon="dark ? 'pi pi-sun' : 'pi pi-moon'"
          severity="secondary"
          size="small"
          text
          rounded
          @click="toggleDark"
        />
      </div>
    </template>
  </Menubar>

  <main class="flex-1 px-3 py-6 md:px-6 max-w-5xl w-full mx-auto">
    <RouterView />
  </main>

  <footer class="text-center text-xs opacity-60 py-3">
    Ping · v0.1 · data stays on this device
  </footer>

  <Toast position="bottom-center" />
  <ConfirmDialog />
</template>
