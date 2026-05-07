# Ping — Project Notes for Claude

Offline-first PWA for organising table-tennis tournaments. All state lives on the user's device. There is no backend.

## Domain

Two tournament modes:

- **round-robin** — every player plays every other; winner has the most match wins (point diff is the tie-breaker).
- **knockout** — single-elimination bracket. Bracket size is the next power of 2; top seeds receive byes when the player count is odd.

A match score is a single set. The winning player reaches `tournament.maxScore` (configurable per-tournament; default **7**). The user records a result by tapping the **loser's** score under the player who lost — winner-side and loser-score are stored, the winner's score is implicit (`maxScore`).

A "fact engine" surfaces hype lines from local match history: head-to-head dominance, hot streaks today, most-played rivalry, closest rivalry, newcomer first-win, today's record. Facts are weighted; `factsAboutPlayers(facts, ids)` filters them so the **Next-match** screen prefers facts about the players in the upcoming match (falls back to general facts when nothing player-specific qualifies).

## Stack

| Concern        | Choice                                                                                  |
| -------------- | --------------------------------------------------------------------------------------- |
| Framework      | Vue 3.5 + TypeScript, Composition API with `<script setup>`                             |
| Build / dev    | Vite 6 (`@vitejs/plugin-vue`)                                                           |
| Package mgr    | Bun for install / dev / test (CI also Bun, see CI section)                              |
| State          | Pinia + `pinia-plugin-persistedstate` writing to `localStorage` under `ping.v1`         |
| Styling        | Tailwind 4 (`@tailwindcss/vite`) + `tailwindcss-primeui` bridge                         |
| UI components  | PrimeVue 4 (Aura preset extended in `src/theme/preset.ts`, primary `#0090a7`) + PrimeIcons |
| Routing        | `vue-router` v4 in **hash mode** (so GitHub Pages doesn't need an SPA fallback)         |
| PWA            | `vite-plugin-pwa` (Workbox `generateSW`, `registerType: 'autoUpdate'`, SVG icons)       |
| Tests          | `bun:test` for the pure logic modules                                                   |
| CI / deploy    | GitHub Actions → GitHub Pages, plus semantic-release for versioning                     |

## Repo layout

```
.
├── .github/workflows/deploy.yml   # build + deploy + semantic-release
├── .releaserc.json                # semantic-release config
├── bunfig.toml                    # corp Artifactory mirror (rewritten in CI)
├── bun.lock                       # also rewritten in CI (URL replace)
├── public/{favicon,pwa,pwa-maskable}.svg
├── index.html                     # inline pre-paint dark-mode script
├── vite.config.ts                 # base from GITHUB_PAGES_BASE env var
└── src/
    ├── main.ts, App.vue, style.css, env.d.ts
    ├── theme/preset.ts            # InformPreset (Aura + teal palette)
    ├── router/index.ts            # hash mode, lazy views
    ├── types.ts                   # Player, Match, Tournament, Fact, PingStore
    ├── stores/tournaments.ts      # Pinia store (persisted)
    ├── lib/                       # pure, unit-tested
    │   ├── id.ts                  # crypto.randomUUID wrapper
    │   ├── schedule.ts            # round-robin (circle method) + regenerate
    │   ├── bracket.ts             # single-elim with byes, winner promotion
    │   ├── scoring.ts             # apply result, standings, isComplete, champion
    │   ├── facts.ts               # generators + factsAboutPlayers + pickFact
    │   ├── stats.ts               # global player stats, head-to-head, recent results
    │   └── suggestions.ts         # rank past players for the new-tournament wizard
    ├── views/
    │   ├── HomeView.vue           # tournaments list + new-tournament dialog
    │   ├── TournamentView.vue     # tabs: Next / All / Standings|Bracket / Roster
    │   ├── HistoryView.vue
    │   ├── PlayersView.vue        # sortable global stats
    │   └── PlayerView.vue         # single-player detail + H2H + recent
    └── components/                # NewTournamentDialog, PlayerPicker, MatchCard,
                                   # ScoreEntryDialog, RoundRobinTable, BracketView,
                                   # RosterPanel, FactCard
```

## Data model & persistence

`PingStore` (`src/types.ts`) is the entire app state — `{ version, players, tournaments }`. It is the persisted JSON under `localStorage['ping.v1']`. `version` is reserved for future migrations; bump it and write a migrator if the shape changes.

A `Match` records winner-side + loser-score; the winner's score is always `tournament.maxScore`. Knockout matches additionally have `slot` (left-to-right position in their round) and may be `bye: true` (auto-advanced placeholder).

A `Tournament` carries `bracketLocked: true` once a knockout starts — round-robin tournaments stay editable.

## State store conventions

`useTournamentsStore()` exposes:

- `upsertPlayer(name)` — name-deduped (case-insensitive). Use this anywhere you accept a player name.
- `deletePlayer(id)` — refuses if the player has ever participated in a tournament (preserves history integrity).
- `createTournament(input)` → status `'setup'`. Does **not** generate matches.
- `startTournament(id)` — generates matches via `buildRoundRobinMatches` or `buildSeededBracket` and flips status to `'running'`. Knockout brackets lock here.
- `addPlayerToTournament` / `removePlayerFromTournament` — guarded: throws on locked knockouts; for running round-robins it calls `regenerateRoundRobin` so already-played matches are kept and only unplayed pairings are regenerated.
- `recordResult` — applies the result and, for knockout, auto-promotes the winner to the next round via `promoteWinner`. Also flips the tournament to `'completed'` when the final completes.

Mutations happen through these actions; do not mutate `state.tournaments` from a component directly.

## UI conventions

- **Score entry (`ScoreEntryDialog.vue`):** two player cards side-by-side, a column of `0…maxScore-1` buttons under each. The user taps the score under the player who **lost**; that determines `winnerSide` and `loserScore`. The dialog confirms with `"<winner> beat <loser>: <maxScore>–<loserScore>"` before saving.
- **Hype facts:** put `<FactCard hype :prefer-players="ids" />` anywhere you want context-aware hype. With no `preferPlayers` it acts as a generic random fact.
- **Roster panel:** mode-aware. Round-robin: free add/remove with confirm dialog noting how many unplayed matches will be regenerated. Knockout: read-only after start.
- **Theme:** dark by default. The class `app-theme-dark` on `<html>` is set pre-paint by an inline script in `index.html` so there is no flash. The toggle in `App.vue` writes `localStorage['ping.theme']` only when the user explicitly toggles.
- **Routing:** hash mode (`#/...`). The Vite `base` is `/` locally and `/<repo>/` in CI (set from the `GITHUB_PAGES_BASE` env var that the workflow injects).

## Adding a new fact generator

Append a function to the `generators` array in `src/lib/facts.ts`. Each generator takes `(input, played)` and returns `Fact[]`. Always include `playerIds` so `factsAboutPlayers` can route the fact to the right "Next-match" hype context. Keep `weight` between 1 and 5 (higher = more likely to surface). Add a unit test covering at least one positive and one negative case.

## PWA

Manifest is generated by `vite-plugin-pwa` in `vite.config.ts`. Icons are SVGs (modern browsers accept SVG manifest icons). The install prompt is captured by `App.vue` via `beforeinstallprompt` and surfaced as an "Install" button. After first visit the app loads offline.

## Local dev

```bash
bun install                  # uses corp Artifactory via bunfig.toml
bun run dev                  # http://localhost:5173
bun test src/lib             # 27 tests across the pure modules
bun run build                # vue-tsc -b && vite build → dist/
bun run preview              # serve the built bundle locally
```

Do **not** delete `bunfig.toml` or its corp registry URL — installs locally fail without it because the public registry is behind a TLS-intercepting proxy that doesn't include the npm root in the trust store. CI rewrites these files; locally they must remain.

## Testing

- Tests live next to the module: `src/lib/foo.ts` ↔ `src/lib/foo.test.ts`.
- Use `bun:test` (`describe`, `test`, `expect`).
- Tests import siblings via **relative paths** (`'./schedule'`, `'../types'`), not via the `@/` alias — Bun's path-mapping discovery doesn't follow the project's tsconfig references.
- Tests are excluded from the production build (`tsconfig.app.json` excludes `*.test.ts`); only `bun test` runs them.

## CI / deploy

`.github/workflows/deploy.yml` has three jobs, fan-out from one workflow run:

1. **build** — sets up Bun, rewrites `bunfig.toml` to the public npm registry and `sed`-replaces the corp Artifactory tarball URLs in `bun.lock` (integrity hashes stay valid because the bytes are identical), runs `bun install --frozen-lockfile`, `bun test src/lib`, then `bun run build` with `GITHUB_PAGES_BASE=/<repo>/`. Uploads `dist/` as a Pages artifact.
2. **release** — runs `cycjimmy/semantic-release-action@v4`. If the commits since the last tag warrant a release, it pushes a `chore(release): … [skip ci]` commit with the version bump and `CHANGELOG.md`, then cuts the tag + GitHub Release. Exposes `new_release_published` as a job output.
3. **deploy** — gated on `release.outputs.new_release_published == 'true'`. Publishes the Pages artifact only when semantic-release just cut a new version. Non-release commits (`chore:`, `ci:`, `docs:`, …) build but never publish.

Permissions are per-job (`contents: read` for build, `pages: write` + `id-token: write` for deploy, `contents: write` + `issues: write` + `pull-requests: write` for release). Top-level is `permissions: {}` to deny by default.

Why deploy is gated this way and not on a tag-push trigger: tags pushed by the default `GITHUB_TOKEN` do not retrigger workflows (GitHub's loop guard). Reading the release job's output and gating deploy in the same workflow run avoids needing a PAT.

## First-time GitHub setup

1. **Settings → Actions → General → Allow all actions and reusable workflows.** New private repos sometimes need this turned on; if no workflow appears in the Actions tab after a push, this is almost always the reason.
2. **Settings → Pages → Source = GitHub Actions.**
3. If branch protection is enabled on `main`, ensure the GitHub Actions bot can push (semantic-release pushes the `chore(release)` commit). Either add a bypass for the bot or use a fine-grained PAT in `secrets.GITHUB_TOKEN`.

## Conventional Commits — required

Versioning, the changelog, and the GitHub Release are computed entirely from commit messages, so every commit to `main` must follow [Conventional Commits](https://www.conventionalcommits.org/).

**Format:** `<type>[optional scope]: <description>`

| Type                                                              | Effect on version |
| ----------------------------------------------------------------- | ----------------- |
| `feat:` (new feature)                                             | minor bump        |
| `fix:` (bug fix)                                                  | patch bump        |
| `perf:` (perf improvement)                                        | patch bump        |
| `feat!:` / `fix!:` / footer with `BREAKING CHANGE:`               | major bump        |
| `chore:`, `ci:`, `docs:`, `refactor:`, `style:`, `test:`, `build:` | no release        |

- Subject ≤ 72 chars, imperative mood ("add player stats", not "added player stats").
- Long detail goes in the body, separated by a blank line.
- Breaking changes go in a `BREAKING CHANGE: <description>` footer or via the `!` shorthand.
- The `chore(release): … [skip ci]` commits are auto-generated by semantic-release. Don't write them by hand and don't squash them.

## Gotchas

- **`@/` alias works in Vite, not in Bun's test runner.** Use relative imports inside `src/lib/*.test.ts`.
- **`bun.lock` embeds tarball URLs.** It encodes wherever you resolved from. The CI rewrite fixes this for the public registry; if you swap mirrors locally, run `bun install` again to regenerate.
- **Knockout standard seeding** for size N: `seedOrder(8) === [1,8,4,5,2,7,3,6]`. Tests that assume specific R1 pairings must use this — round-1 pairs adjacent slots, so 4 players give `(1,4),(2,3)` not `(1,2),(3,4)`.
- **`pinia-plugin-persistedstate` 4.7.1** is mirrored on the corp Artifactory but its tarball 403s; the lockfile is pinned to **4.7.0** which works. Don't bump without testing the install through the mirror.
- **`vite-plugin-pwa` precaches the build output**, so a hard refresh after deploy is sometimes required to see new content immediately. The `registerType: 'autoUpdate'` config picks up the new SW on the next navigation.
- **`recordResult` is the only way to advance a knockout.** Don't write into a future-round match's `a`/`b` slots from a component — `promoteWinner` does that and handles bye-chains.
