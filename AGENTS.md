# CLAUDE.md

## Purpose

Nook: a stateless, free web app scoped to Toronto and the GTA (`src/config/region.ts`). The user enters an address, and it finds the nearest place in each category (gym, park, transit stop, school, groceries, plus custom ones and pinned places) and shows car, walk and transit times. See `README.md` for behaviour and the external services used.

## Tech stack

- **Vite + React 19 + TypeScript**, **Leaflet** (via `react-leaflet`) for the map, with an OpenFreeMap vector base map rendered by **MapLibre GL** (`@maplibre/maplibre-gl-leaflet`)
- **Vitest** for unit tests
- No backend: all state is in the URL hash (`src/lib/urlState.ts`); external calls go straight from the browser to public OSM-based services (`src/api/`)
- **GitHub Actions**: CI (`ci.yml`), GitHub Pages deploy (`pages.yaml`), releases, Renovate
- **Renovate** for dependency updates (managers: `npm`, `asdf`, `docker-compose`, `github-actions`, `gomod`)
- **MIT License**

## Commands

```sh
npm install
npm run dev        # dev server on :5173
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build → dist/
```

## Working on the app

- Keep it stateless and key-free: no backend. App settings live only in the URL hash (`encodeState`/`decodeState`, with a test). The only browser storage is the response cache in `src/api/persistentCache.ts`, opted into per request via `fetchJson`'s `persistMs` (use `accept` so error bodies are never stored).
- Respect public service usage policies: Nominatim requests go through `nominatimPacer` (1 req/s) and must never be used for autocomplete (use Photon). New paced calls should pass the caller's `AbortSignal` so abandoned lookups don't hold up the queue.
- Each external service has one module in `src/api/`; keep provider-specific parsing there so providers can be swapped.
- Results are incremental (`src/lib/useDestinations.ts`): each pin/category row is looked up once and only redone when its own inputs change. Only a new origin or departure time recomputes everything. Don't reintroduce whole-table recomputes on pin/category edits.
- Pure logic (`src/lib/`, parsing helpers in `src/api/`) gets unit tests; don't write tests that hit the network.
- Never resize or scale Leaflet markers with CSS `transform`/`scale`: Leaflet positions markers with `transform`, so this shifts them off their coordinates. Change `iconSize`/`iconAnchor` instead.
- MapLibre's worker is wired up explicitly (`setWorkerUrl` with a `?worker&url` import, plus `optimizeDeps.exclude` in `vite.config.ts`); bundling breaks its default lookup.
- MapLibre only draws on animation frames, so it renders nothing in a hidden/background browser tab. Bring the tab to the front before concluding the map is broken.

## Structure

```
.
├── .agents/                  # Agent instructions and skills
├── .github/
│   ├── CODEOWNERS            # @ctrl-research/reviewers
│   ├── renovate-config.js    # Renovate platform config
│   └── workflows/
│       ├── ci.yml            # Sensitive-file/YAML checks + typecheck, test, build
│       ├── pages.yaml        # Build and deploy to GitHub Pages on push to main
│       ├── release.yaml      # Label-driven SemVer release workflow
│       └── renovate.yaml     # Renovate workflow
├── src/
│   ├── api/                  # One client per external service + shared fetch/pacing/cache
│   ├── components/           # React components
│   ├── config/categories.ts  # Preset categories (OSM tag filters)
│   └── lib/                  # Pure logic: geo, tag specs, URL state, orchestration
├── index.html
├── package.json
├── vite.config.ts
├── .tool-versions            # Pinned language/tool versions (asdf/mise)
├── AGENTS.md                 # Operational expectations for humans and AI agents
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
└── renovate.json             # Renovate settings
```

## Conventions

- `.tool-versions` is the single source of truth for language and tool versions. Before building, testing, or running any tooling, check it and use the pinned versions (install via `asdf install` or `mise install`). When adding a new language or tool to the project, pin its version there first — never assume a globally installed version.
- Versioning: project artifacts (releases, tags, packages, images) follow [SemVer](https://semver.org/) as bare `X.Y.Z` — no `v` prefix (`1.4.2`, not `v1.4.2`). Bump MAJOR for breaking changes, MINOR for backwards-compatible features, PATCH for fixes.
- See `AGENTS.md` for full agent workflow, code style, testing, and git/PR guidance.
- Branch protection: never push directly to `main`; all changes via PR with review.

## Releases

- All released artifacts (images, binaries, packages) are versioned with [SemVer](https://semver.org/) as bare `X.Y.Z` tags — no `v` prefix.
- **Automatic bumps**: when a PR merges to `main`, the next version is derived from the PR label:
  - `major` — breaking changes
  - `minor` — backwards-compatible features
  - `patch` — fixes
  - No label — defaults to a `patch` bump
- **Manual releases**: a specific version may be cut manually by supplying an explicit `X.Y.Z` version tag when needed (e.g. via a manual workflow dispatch). This bypasses the label-based bump.
- Release automation lives in `.github/workflows/release.yaml`: it computes the next version, tags, and creates the GitHub release. The site itself is deployed separately by `pages.yaml`.
