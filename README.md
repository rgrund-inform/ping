# Ping — Table Tennis Tournament Planner

A small offline-first PWA for organizing table-tennis tournaments. Round-robin and single-elimination knockout, fast tap-the-loser score entry, mid-tournament roster edits (round-robin), persistent local history, suggested players from previous runs, and a "random facts" engine that mines your match history.

All data lives in `localStorage` on the device. There is no server.

## Stack

- Vue 3.5 + TypeScript, Vite 6
- PrimeVue 4 (Aura, custom Inform-teal preset) + Tailwind 4
- Pinia (`pinia-plugin-persistedstate` → `localStorage` key `ping.v1`)
- Vue Router (hash mode)
- `vite-plugin-pwa` (Workbox precache, auto-update)
- Bun for install / scripts / tests

## Develop

```bash
bun install
bun run dev          # http://localhost:5173
bun test             # logic-module unit tests
bun run build        # production bundle in ./dist
bun run preview      # serve the production build
```

## Deploy (GitHub Pages)

The included workflow at `.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to `main`.

One-time repo setup:

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source = "GitHub Actions"**.
3. Push to `main`; the action publishes to `https://<user>.github.io/<repo>/`.

The Vite `base` is set from the `GITHUB_PAGES_BASE` env var that the workflow injects, so the same build runs locally at `/` and on Pages at `/<repo>/`. Hash routing is used to avoid the SPA-fallback dance.

## Data

Everything is in one localStorage key: `ping.v1`. Clearing site data resets the app. There's no export yet — the data model in `src/types.ts` is straightforward JSON if you want to back it up manually.
