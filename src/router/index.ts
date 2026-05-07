import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/tournament/:id',
    name: 'tournament',
    component: () => import('@/views/TournamentView.vue'),
    props: true,
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('@/views/HistoryView.vue'),
  },
  {
    path: '/players',
    name: 'players',
    component: () => import('@/views/PlayersView.vue'),
  },
  {
    path: '/player/:id',
    name: 'player',
    component: () => import('@/views/PlayerView.vue'),
    props: true,
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export default createRouter({
  history: createWebHashHistory(),
  routes,
})
