# Ping — Project Notes for Claude

## Commit messages: Conventional Commits required

This repo uses [`semantic-release`](https://github.com/semantic-release/semantic-release) on every push to `main` to compute the next version, update `CHANGELOG.md`, push the version bump back, and cut a GitHub Release. Versioning is driven entirely by commit messages, so they must follow [Conventional Commits](https://www.conventionalcommits.org/).

**Format:** `<type>[optional scope]: <description>`

| Type                                       | Effect on version |
| ------------------------------------------ | ----------------- |
| `feat:` (new feature)                      | minor bump        |
| `fix:` (bug fix)                           | patch bump        |
| `perf:` (perf improvement)                 | patch bump        |
| `feat!:` / `fix!:` / `BREAKING CHANGE:`    | major bump        |
| `chore:`, `ci:`, `docs:`, `refactor:`, `style:`, `test:`, `build:` | no release |

Keep the subject line ≤ 72 chars; put detail and any `BREAKING CHANGE:` footer in the body. The `chore(release): ...` commits produced by the release bot are auto-generated — don't write them by hand.

## Stack quick reference

- Vue 3 + TypeScript + Vite, hash routing
- PrimeVue 4 (Aura preset extended in `src/theme/preset.ts`) + Tailwind 4 (`src/style.css`)
- Pinia state in `src/stores/tournaments.ts`, persisted to `localStorage` under `ping.v1`
- Pure logic modules in `src/lib/{schedule,bracket,scoring,facts,stats,suggestions}.ts` — these are unit-tested via `bun test src/lib`
- PWA via `vite-plugin-pwa`; offline-first, no backend
- Bun for local install / dev / test; CI uses Bun too but rewrites `bunfig.toml` and `bun.lock` to point at the public npm registry (the corp Artifactory mirror is unreachable from GitHub runners)

## Local registry note

The committed `bunfig.toml` and `bun.lock` reference the corp Artifactory mirror so installs work behind the Cisco Umbrella TLS interception. CI rewrites them in-place to `registry.npmjs.org` before `bun install --frozen-lockfile`. Don't delete the corp URLs locally.

## CI workflow

`.github/workflows/deploy.yml`:

- `build` — Bun install/test/build, uploads `dist` as a Pages artifact.
- `deploy` — publishes the artifact to GitHub Pages (Pages must be set to "GitHub Actions" source in repo settings).
- `release` — runs `semantic-release` via `npx`, needs `contents: write` to push the version-bump commit and create the tag/release.

If a push doesn't trigger the workflow, check:

1. **Repo → Settings → Actions → General** — Actions must be enabled.
2. Branch protection on `main` must allow the GitHub Actions bot to push (the release commit is `chore(release): … [skip ci]`). If protection blocks it, give the bot bypass or use a PAT.
3. Pages must be set to "GitHub Actions" source.
