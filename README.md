# Ping — Table Tennis Tournament Planner

**Live app:** <https://rgrund-inform.github.io/ping/>

A small offline-first PWA for organizing table-tennis tournaments. Round-robin and single-elimination knockout, fast tap-the-loser score entry, mid-tournament roster edits (round-robin), persistent local history, suggested players from previous runs, and a "random facts" engine that mines your match history.

All data lives in `localStorage` on the device. Optionally, devices can share tournaments through a small sync service on Cloudflare (see [Sync across devices](#sync-across-devices-optional)); without it there is no server at all.

## Stack

- Vue 3.5 + TypeScript, Vite 6
- PrimeVue 4 (Aura, custom Inform-teal preset) + Tailwind 4
- Pinia (`pinia-plugin-persistedstate` → `localStorage` key `ping.v1`)
- Vue Router (hash mode)
- `vite-plugin-pwa` (Workbox precache, auto-update)
- Bun for install / scripts / tests
- Optional sync backend: Cloudflare Worker + Durable Object (`worker/`)

## Develop

```bash
bun install
bun run dev          # http://localhost:5173
bun test             # logic-module unit tests
bun run build        # production bundle in ./dist
bun run preview      # serve the production build
```

## Deploy (GitHub Pages)

The included workflow at `.github/workflows/deploy.yml` tests every push to `main`; when the commits warrant a new version ([Conventional Commits](https://www.conventionalcommits.org/) + semantic-release), it releases and deploys to GitHub Pages.

One-time repo setup:

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source = "GitHub Actions"**.
3. Push a `feat:` or `fix:` commit to `main`; the action publishes to `https://<user>.github.io/<repo>/`.

The Vite `base` is set from the `GITHUB_PAGES_BASE` env var that the workflow injects, so the same build runs locally at `/` and on Pages at `/<repo>/`. Hash routing is used to avoid the SPA-fallback dance.

## Data

Everything is in one localStorage key: `ping.v1`. Clearing site data resets the app; if the device was in a sync space, rejoin with the link from another device to get the data back. Use the export/import buttons in the top bar for backups.

## Sync across devices (optional)

Two phones running two tables at the same event, or your phone and your laptop, can share tournaments through a **sync space**:

1. Tap the cloud icon in the top bar → **Create a sync space**.
2. On the other device, scan the QR code or open the join link (or paste the code `<space>.<key>` under **Join with code**).
3. That's it. Results recorded on any device show up on the others within seconds; offline changes sync when the device is back online.

Anyone with the join link can read and change the space, so share it only with people you trust. Leaving a space does not delete the shared data. The cloud icon only appears if the deployment has a sync server configured.

Known limitation: if two devices create the same new player name while offline, you end up with two players of that name.

### Self-hosting the sync server

The sync server is a Cloudflare Worker with one Durable Object per space, in `worker/`. It fits Cloudflare's **free Workers plan**.

Locally:

```bash
cp .env.example .env.local   # VITE_SYNC_URL=http://localhost:8787
bun run dev:worker           # wrangler dev → http://localhost:8787
bun run dev                  # in a second terminal
```

On your GitHub fork:

1. Create a Cloudflare account (free plan is enough) and an API token from the **Edit Cloudflare Workers** template.
2. In **Settings → Secrets and variables → Actions**, add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Run the **Deploy** workflow manually (**Actions → Deploy → Run workflow**). This deploys only the Worker, as `ping-sync`, and allows requests from `https://<user>.github.io`. Check it with `curl https://ping-sync.<your-subdomain>.workers.dev/health`.
4. Add the repository **variable** `SYNC_URL` = `https://ping-sync.<your-subdomain>.workers.dev`. The next release builds the app with sync enabled.

Every later release deploys the Worker first, then the app. Without the Cloudflare secrets the Worker step is skipped and the app is built without sync. To deploy by hand instead: `bunx wrangler login`, then `bun run deploy:worker`. A manual deploy uses the `ALLOWED_ORIGINS` value from `worker/wrangler.jsonc`, so add your Pages origin there first.
