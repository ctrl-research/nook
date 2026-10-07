# Nook

Enter an address in **Toronto or the GTA** and see what's nearby (gym, park, transit stop, school, groceries, or anything else you add) with **walk, car and transit** times at a glance.

- **Stateless:** a static site with no backend, database or accounts. Everything (origin, categories, pinned places, departure time) lives in the URL hash, so a bookmark restores a setup and a link shares it.
- **Free:** uses only public OpenStreetMap-based services; no API keys.
- **Customisable:** toggle preset categories, define your own with OSM tags, or pin specific places ("Office", "Mom's place").
- **Not just the nearest:** expand a category to see other options nearby (also shown on the map), pick a different one, or load more.

## Getting started

```sh
mise install        # or: asdf install (Node version pinned in .tool-versions)
npm install
npm run dev         # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Type check + production build to `dist/` |
| `npm run preview` | Serve the production build locally |

### Address suggestions (optional)

Suggestions while typing need a free [Geoapify](https://www.geoapify.com/) API key. Without one, search still works on Enter/Search.

1. Create a Geoapify project and copy its API key.
2. In the Geoapify dashboard, restrict the key's allowed origins to `https://ctrl-research.github.io` and `http://localhost:5173`. It ships in the page by design, so this is what stops other sites using it.
3. Locally: put `VITE_GEOAPIFY_KEY=<key>` in `.env.local` (git-ignored).
4. Deployed site: add a repository **variable** (not a secret) named `VITE_GEOAPIFY_KEY` under Settings → Secrets and variables → Actions. The Pages workflow reads it at build time.

## How it works

1. **Origin:** suggestions appear as you type (Geoapify, when a key is configured); **Search** (or Enter with no suggestion list open) runs a Nominatim search. Without a Geoapify key, or once it's rejected or over quota, the box falls back to submit-only search. Clicking the map deliberately does *not* move the origin, so a stray click can't shift it. Search and the map are limited to the GTA (`src/config/region.ts`).
2. **Options per category:** each category is searched on its own with Nominatim's `[key=value]` search in a box around the origin, widened (1.5 → 5 → 15 → 30 km) only until something is found. Up to 6 options from that box are ranked by **walking time**, so a park across a highway doesn't win just for being close; the quickest walk is shown by default. Rows fill in as each category finishes rather than all at once.
3. **Choosing another option:** click a category to expand its list and show its other options on the map. Pick one (from the list or the map) to use it instead; the pick is saved in the URL. **Show 6 more** fetches the next batch. "Downtown" is a fixed point (King & Bay) rather than a search.
4. **Travel times:** walk and car times come from Valhalla matrix requests. Lookups made close together are merged into one request, and each time is cached on its own. Transit comes from Transitous at the chosen departure time (default: next weekday 08:00), counting from when you leave home, not including the wait before you set out. When walking beats transit, the walk time is shown with 🚶.
5. **Routes:** click any time to draw that route on the map; transit legs use the line's own colour.

### Services

| Purpose | Service | Notes |
| --- | --- | --- |
| Base map | [OpenFreeMap](https://openfreemap.org/) Liberty (vector, via MapLibre GL) | No key; dashed lines and 3D buildings are hidden for a calmer map |
| Address suggestions while typing (optional) | [Geoapify](https://www.geoapify.com/) | Free tier: 3,000 requests/day, commercial use OK; browser key restricted by origin |
| Address search (on submit) | [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) | Paced to 1 req/s |
| Nearby places | [Nominatim](https://nominatim.org/) `[key=value]` search | Overpass was dropped: its public servers took 10–25s or timed out |
| Walk / car times and routes | [FOSSGIS Valhalla](https://valhalla.openstreetmap.de/) | ~0.35s per request; fair use 1 req/s per user. FOSSGIS's OSRM was dropped: it delayed every request after the first by ~10s |
| Public transit | [Transitous](https://transitous.org/) | Coverage depends on the region's published GTFS feeds |

### Reliability

These are community-run servers with no uptime guarantee. The app degrades rather than fails:

- Each category's search and routing is independent, so one slow or failing lookup only affects its own row.
- The FOSSGIS servers (Nominatim, Valhalla) are offered for fair, non-production use. Nook keeps well within their limits (paced requests, batching, caching), but a busy public deployment should move to a self-hosted or paid provider.
- Each service lives behind its own module in `src/api/`, so moving one to a self-hosted or paid provider (Google, Mapbox, Geoapify…) touches a single file.
- Responses are cached in the browser (Cache Storage) so reloading or revisiting a setup doesn't re-query everything: places and walk/car times for 7 days, address lookups for 30 days, transit for 12 hours. Errors are never stored, expired entries are pruned on load, and the footer has a **Clear cached data** link. This is a per-browser cache of public data, not app state: the setup itself still lives only in the URL.

This is fine for personal or small-team use. Heavy traffic would need self-hosted services (Docker images exist for all of them) or a paid provider.

## Custom categories

Under **Custom category**, give a name, an emoji and comma-separated [OSM tags](https://wiki.openstreetmap.org/wiki/Map_features); any match counts:

- `key=value`, e.g. `amenity=library`
- `key=a|b` (any of), e.g. `shop=supermarket|greengrocer`

A bare `key` (any value) isn't supported: the place search needs a value.

Presets live in `src/config/categories.ts`.

## Deploying

`.github/workflows/pages.yaml` builds and deploys to GitHub Pages on every push to `main`. One-time setup: **Settings → Pages → Source: GitHub Actions**. The build uses a relative base path, so it also works on any static host (Cloudflare Pages, Netlify, S3…).

## Project layout

```
src/
├── api/            # One client per external service (+ shared fetch/pacing/cache)
├── components/     # AddressSearch, MapView, ResultsTable, Settings
├── config/         # Preset categories
├── lib/            # Pure logic: geo math, tag specs, URL state, result orchestration
├── App.tsx
└── main.tsx
```

## Releases

Releases follow [SemVer](https://semver.org/) with bare `X.Y.Z` tags (no `v` prefix).

- **Automatic**: merging a PR to `main` cuts a release based on its `major`, `minor`, or `patch` label; no label means a `patch` bump.
- **Manual**: run the **Release** workflow with an explicit `X.Y.Z` version.

Dependency updates are managed by Renovate (`renovate.json`), with the `npm`, `asdf`, `github-actions`, `docker-compose` and `gomod` managers enabled.
