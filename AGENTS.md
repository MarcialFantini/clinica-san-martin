# 12-automatizacion-crm-whatsapp · Recepta para Clínica San Martín

Portfolio demo: a fictional clinic (Clínica San Martín, Rosario) whose reception runs on automations.
Landing with six scenes (`/`) plus a full product under `/app/`. Brief:
`../11-marca-personal-marcial-fantini/docs/briefs/demo-automatizacion-crm-whatsapp.md`.

## Rules

- **Copy and code.** UI copy is in neutral professional Spanish. Code identifiers and comments are in English.
- **Data.** All data is fictional. A visible `.demo-mark` must stay on screen in every view.
- **Branding.** No WhatsApp or other real-app branding: the chat UI has its own identity.
- **No backend.** No APIs or external services. Everything is simulated in the browser.
- **Motion.** Animate only transform and opacity (plus SVG and canvas). `prefers-reduced-motion`
  gets a full static version, and the simulation starts paused.
- **Phone layouts.** At 390 px each view has its own composition: no sideways-scrolling tables
  (`.table.stack` turns rows into blocks).
- **Showcase.** `?showcase` never persists state (see `initStore` in `src/lib/store.ts`).
- **Ports and tooling.** Dev and preview use port 4621. Use pnpm.

## Commands

`pnpm dev` · `pnpm build` · `pnpm preview` · `pnpm check` · `pnpm test:e2e` (after build) ·
`pnpm test:shots` · `pnpm poster` (after build).

## Architecture

- **`src/data/`**
  - `catalog.ts`: specialties, the 40 professionals, inquiry phrases, names.
  - `seed.ts`: the deterministic initial state, flows, templates and campaigns. Bump `STATE_VERSION`
    whenever the seed shape or content changes, so saved sessions reset.
- **`src/lib/`** (framework-free domain)
  - `types.ts`
  - `rng.ts`: mulberry32, resumable.
  - `store.ts`: the single state with pub/sub, `mutate()`, events, debounced persistence and `resetDemo()`.
  - `ops.ts`: state operations shared by the engine and the UI (messages, flow walks and runs,
    inquiry processing).
  - `engine.ts`: the simulation tick, the loop, speed, pause and `advance()`.
  - `classify.ts`: keyword classifier.
  - `templating.ts`, `time.ts`, `flowmeta.ts`, `icons.ts`, `nav.ts`.
- **`src/layouts/AppLayout.astro`**: the shell (sidebar, live top bar, mobile tabs, overlays,
  palette, help, reset dialog). It uses `<ClientRouter />`; the shell parts are `transition:persist`.
- **`src/scripts/app/main.ts`**: runs once. It starts the store and engine, renders the shell,
  handles shortcuts, and mounts the view named by `body[data-view]` on each `astro:page-load`
  (dynamic import from `views/`). Each view exports `mount(root) => cleanup`.
- **`src/scripts/app/views/*.ts`**: one file per view. Views re-render on `subscribe()` and use
  `keyed()` (in `dom.ts`) so focus and animations survive live updates. They animate on `onEvent()`
  (`flow-run`, `message`, `kpi`, and so on).
- **`src/pages/app/**`**: static markup with skeletons. View CSS sits in each page's
  `<style is:global>`; anything shared across views belongs in `src/styles/app.css`.
- **Landing**: `src/pages/index.astro`, `src/components/landing/*`, `src/scripts/landing/*`
  (GSAP lazy-loaded) and `src/styles/landing.css`.
- **`scripts/`**
  - `serve.mjs`: in-process static server.
  - `e2e.mjs`: route sweep.
  - `interactions.mjs`: UI interaction suite.
  - `poster.mjs`.

## Gotchas

- With `ClientRouter`, page styles are swapped on navigation. A rule used by two views must live in `app.css`.
- Use `setQuery()` (it keeps `history.state`) for URL params inside views. Use `navigate()` from
  `astro:transitions/client` to move between views.
- The engine processes simulated-patient inquiries itself unless `autoAt` is pushed away. The inbox
  does that to explain the classification step.
- Under Git Bash, pass `/paths` to scripts with `MSYS_NO_PATHCONV=1`.
