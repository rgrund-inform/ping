<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useTournamentsStore } from '@/stores/tournaments'
import { currentStreak, globalPlayerStats } from '@/lib/stats'

type SortKey = 'name' | 'matches' | 'wins' | 'winRate' | 'pointDiff' | 'tournaments'

const router = useRouter()
const store = useTournamentsStore()

const sortKey = ref<SortKey>('matches')
const sortDir = ref<'asc' | 'desc'>('desc')

const stats = computed(() => globalPlayerStats(store.players, store.tournaments))

const sorted = computed(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...stats.value].sort((a, b) => {
    if (sortKey.value === 'name') return dir * a.name.localeCompare(b.name)
    return dir * (a[sortKey.value] - b[sortKey.value])
  })
})

function setSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = key === 'name' ? 'asc' : 'desc'
  }
}

function streakLabel(s: ReturnType<typeof currentStreak>): string {
  if (!s || s.n < 2) return ''
  return `${s.n}${s.kind}`
}

function streakClass(s: ReturnType<typeof currentStreak>): string {
  if (!s || s.n < 2) return ''
  return s.kind === 'W' ? 'text-positive' : 'text-negative'
}

function arrow(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortDir.value === 'asc' ? ' ↑' : ' ↓'
}

function fmtPercent(x: number): string {
  return x === 0 ? '–' : `${Math.round(x * 100)}%`
}

function fmtDiff(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-2xl md:text-3xl font-semibold">Players</h1>
      <Button
        label="Back"
        icon="pi pi-arrow-left"
        severity="secondary"
        text
        size="small"
        @click="router.push({ name: 'home' })"
      />
    </div>

    <div v-if="sorted.length === 0" class="opacity-70 text-sm py-6 text-center">
      No players yet. Start a tournament to add some.
    </div>

    <div v-else class="overflow-x-auto -mx-3 px-3">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="text-left">
            <th class="px-2 py-2 cursor-pointer select-none" @click="setSort('name')">
              Player{{ arrow('name') }}
            </th>
            <th class="px-2 py-2 text-right cursor-pointer select-none" @click="setSort('tournaments')">
              T{{ arrow('tournaments') }}
            </th>
            <th class="px-2 py-2 text-right cursor-pointer select-none" @click="setSort('matches')">
              M{{ arrow('matches') }}
            </th>
            <th class="px-2 py-2 text-right cursor-pointer select-none" @click="setSort('wins')">
              W-L{{ arrow('wins') }}
            </th>
            <th class="px-2 py-2 text-right cursor-pointer select-none" @click="setSort('winRate')">
              Win%{{ arrow('winRate') }}
            </th>
            <th class="px-2 py-2 text-right cursor-pointer select-none" @click="setSort('pointDiff')">
              Diff{{ arrow('pointDiff') }}
            </th>
            <th class="px-2 py-2 text-right">Streak</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in sorted"
            :key="s.playerId"
            class="border-t border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 cursor-pointer"
            @click="router.push({ name: 'player', params: { id: s.playerId } })"
          >
            <td class="px-2 py-2 font-medium">{{ s.name }}</td>
            <td class="px-2 py-2 text-right tabular-nums opacity-70">{{ s.tournaments }}</td>
            <td class="px-2 py-2 text-right tabular-nums">{{ s.matches }}</td>
            <td class="px-2 py-2 text-right tabular-nums">
              <span class="text-positive">{{ s.wins }}</span>
              <span class="opacity-50">-</span>
              <span class="text-negative">{{ s.losses }}</span>
            </td>
            <td class="px-2 py-2 text-right tabular-nums">{{ fmtPercent(s.winRate) }}</td>
            <td
              class="px-2 py-2 text-right tabular-nums"
              :class="{
                'text-positive': s.pointDiff > 0,
                'text-negative': s.pointDiff < 0,
              }"
            >
              {{ s.matches > 0 ? fmtDiff(s.pointDiff) : '–' }}
            </td>
            <td
              class="px-2 py-2 text-right tabular-nums font-mono"
              :class="streakClass(currentStreak(s.lastResults))"
            >
              {{ streakLabel(currentStreak(s.lastResults)) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
