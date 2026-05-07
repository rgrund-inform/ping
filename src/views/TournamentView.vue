<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useTournamentsStore } from '@/stores/tournaments'
import { champion } from '@/lib/scoring'
import type { Match } from '@/types'
import MatchCard from '@/components/MatchCard.vue'
import ScoreEntryDialog from '@/components/ScoreEntryDialog.vue'
import RoundRobinTable from '@/components/RoundRobinTable.vue'
import BracketView from '@/components/BracketView.vue'
import RosterPanel from '@/components/RosterPanel.vue'
import FactCard from '@/components/FactCard.vue'

const props = defineProps<{ id: string }>()
const router = useRouter()
const store = useTournamentsStore()
const confirm = useConfirm()

const tournament = computed(() => store.tournament(props.id))
const tab = ref('next')
const editing = ref<Match | null>(null)
const dialogVisible = ref(false)

const upcoming = computed(() =>
  tournament.value ? store.nextMatchesFor(tournament.value.id, 50) : [],
)
const nextMatchPlayers = computed<string[]>(() => {
  const m = upcoming.value[0]
  if (!m) return []
  return [m.a, m.b].filter((id): id is string => id !== null)
})
const allMatches = computed(() =>
  tournament.value
    ? [...tournament.value.matches].sort(
        (a, b) => a.round - b.round || (a.slot ?? 0) - (b.slot ?? 0),
      )
    : [],
)

const winnerId = computed(() => {
  const t = tournament.value
  if (!t || t.status !== 'completed') return null
  if (t.mode === 'knockout') return champion(t)
  const standings = store.standingsFor(t.id)
  return standings[0]?.playerId ?? null
})

const winnerName = computed(() =>
  winnerId.value ? store.players[winnerId.value]?.name ?? '?' : null,
)

function openEditor(m: Match) {
  if (m.winnerSide !== null) return
  if (m.a === null || m.b === null) return
  editing.value = m
  dialogVisible.value = true
}

function deleteTournament() {
  if (!tournament.value) return
  confirm.require({
    message: 'Delete this tournament and all its matches? This cannot be undone.',
    header: 'Delete tournament',
    icon: 'pi pi-trash',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      store.deleteTournament(props.id)
      router.push({ name: 'home' })
    },
  })
}

function statusSeverity(): 'info' | 'success' | 'secondary' {
  const t = tournament.value
  if (!t) return 'secondary'
  if (t.status === 'running') return 'info'
  if (t.status === 'completed') return 'success'
  return 'secondary'
}
</script>

<template>
  <div v-if="!tournament" class="text-center py-10">
    <p class="opacity-70 mb-4">Tournament not found.</p>
    <Button label="Back to tournaments" icon="pi pi-arrow-left" @click="router.push({ name: 'home' })" />
  </div>

  <div v-else class="flex flex-col gap-4">
    <div class="flex flex-wrap items-start gap-3 justify-between">
      <div>
        <Button
          label="Back"
          icon="pi pi-arrow-left"
          severity="secondary"
          text
          size="small"
          class="-ml-2"
          @click="router.push({ name: 'home' })"
        />
        <h1 class="text-2xl md:text-3xl font-semibold">{{ tournament.name }}</h1>
        <div class="flex flex-wrap gap-2 mt-1 items-center">
          <Tag :value="tournament.mode === 'round-robin' ? 'Round-robin' : 'Knockout'" severity="secondary" />
          <Tag :value="tournament.status" :severity="statusSeverity()" />
          <span class="text-sm opacity-70">
            {{ tournament.players.length }} players · max score {{ tournament.maxScore }}
          </span>
        </div>
      </div>
      <Button
        label="Delete"
        icon="pi pi-trash"
        severity="danger"
        text
        size="small"
        @click="deleteTournament"
      />
    </div>

    <div
      v-if="tournament.status === 'completed' && winnerName"
      class="rounded-lg p-4 bg-positive/10 border border-positive flex items-center gap-3"
    >
      <i class="pi pi-trophy text-2xl text-positive" />
      <div>
        <div class="text-xs uppercase tracking-wide opacity-70">Champion</div>
        <div class="text-xl font-semibold">{{ winnerName }}</div>
      </div>
    </div>

    <Tabs v-model:value="tab">
      <TabList>
        <Tab value="next"><i class="pi pi-forward mr-2" />Next</Tab>
        <Tab value="all"><i class="pi pi-list mr-2" />All matches</Tab>
        <Tab value="standings">
          <i class="pi pi-chart-bar mr-2" />{{
            tournament.mode === 'round-robin' ? 'Standings' : 'Bracket'
          }}
        </Tab>
        <Tab value="roster"><i class="pi pi-users mr-2" />Roster</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="next">
          <div v-if="upcoming.length === 0" class="text-center py-8 opacity-70">
            <i class="pi pi-check-circle text-3xl text-positive block mb-2" />
            All matches are done.
          </div>
          <div v-else class="flex flex-col gap-3">
            <FactCard hype :prefer-players="nextMatchPlayers" />
            <MatchCard
              v-for="m in upcoming"
              :key="m.id"
              :tournament="tournament"
              :match="m"
              clickable
              @click="openEditor"
            />
          </div>
        </TabPanel>

        <TabPanel value="all">
          <div class="flex flex-col gap-2">
            <MatchCard
              v-for="m in allMatches"
              :key="m.id"
              :tournament="tournament"
              :match="m"
              :clickable="m.winnerSide === null && m.a !== null && m.b !== null"
              @click="openEditor"
            />
          </div>
        </TabPanel>

        <TabPanel value="standings">
          <RoundRobinTable v-if="tournament.mode === 'round-robin'" :tournament="tournament" />
          <BracketView v-else :tournament="tournament" @select="openEditor" />
        </TabPanel>

        <TabPanel value="roster">
          <RosterPanel :tournament="tournament" />
        </TabPanel>
      </TabPanels>
    </Tabs>

    <ScoreEntryDialog
      v-model:visible="dialogVisible"
      :tournament="tournament"
      :match="editing"
    />
  </div>
</template>
