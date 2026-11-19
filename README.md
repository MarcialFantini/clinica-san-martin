# Recepta · Clínica San Martín (demo)

Portfolio demo of automatic reminders and patient follow-up for a fictional clinic,
**Clínica San Martín** (Rosario, Argentina). The concept is a reception desk that works on its own:
reminders, confirmations and inquiries move without anyone touching them.

Everything runs in the browser. Nothing is sent: there is no WhatsApp, HubSpot, backend, API or database.
All brands, people and data are fictional, and a visible **Demo** mark is always on screen.

## What is inside

| Route | What it is |
| --- | --- |
| `/` | Landing with the six scenes from the brief: hero agenda, inquiry inbox, confirmations, flow editor, dashboard and before/after |
| `/app/` | **Inicio**: KPIs ticking, today's agenda, live activity feed, running automations, recent inbox |
| `/app/bandeja/` | **Bandeja**: conversations classified by specialty, live chat, reassign, resolve, reply, *Simular paciente* |
| `/app/agenda/` | **Agenda**: 40 professionals on a live timeline (or a list), day tabs, status filter, appointment drawer |
| `/app/pacientes/` | **Pacientes**: CRM list with search, filters and sorting; *Nuevo paciente* |
| `/app/pacientes/ficha/?id=` | **Ficha**: data, tags, notes, appointments (book, confirm, cancel), message timeline |
| `/app/flujos/` | **Automatizaciones**: every flow with live run counters, on/off switch and a mini map that lights up |
| `/app/flujos/editor/?id=` | **Flow editor**: drag nodes, wire ports, edit in the inspector, run step by step, watch live runs |
| `/app/plantillas/` | **Plantillas**: message templates with variables, quick replies and a live preview |
| `/app/campanas/` | **Campañas**: live send progress, funnel, start, pause and resume, *Nueva campaña* |
| `/app/metricas/` | **Métricas**: hand-drawn SVG charts with tooltips and table equivalents |

### The live layer

One simulation engine (`src/lib/engine.ts`) drives the whole app. One tick is one simulated minute;
at 1x a tick runs every real second (4x and 10x are available).

- **Reminders and replies.** Reminders go out 24 h before each appointment, and patients confirm,
  reschedule, cancel or stay silent. A silent patient gets a second notice three hours before.
- **Inquiries.** New inquiries arrive, get classified and routed, and are answered automatically.
- **Cancellations.** A cancelled slot is offered to the waiting list.
- **Campaigns.** Campaigns send in small batches.
- **Flow runs.** Every automation emits a run event. The editor animates a pulse through the nodes,
  and the flows list lights the matching connections.
- **Flows have real effects.** Pausing *Recordatorio 24 h antes* stops the reminders. Editing a
  template changes the next messages.
- **Shell.** The app shell shows an **EN VIVO** indicator, the clock, pause, 1x/4x/10x, *Adelantar 1 h*,
  a notification centre with an unread badge, and toasts.

State is shared by every view and saved in `localStorage` (key `csm-recepta-state`).
**Reiniciar demo** (sidebar, *Más* sheet on phones, or the command palette) restores the seed.

### Keyboard

| Keys | Action |
| --- | --- |
| `Ctrl/Cmd + K` | Command palette (views, actions, patients, automations) |
| `?` | Shortcut help |
| `P` / `S` / `+` | Pause or resume / cycle speed / advance 1 h |
| `N` | Notifications |
| `G` then `I B A P F T C M` | Go to a view |
| `/` | Focus the view's search |
| Editor: `Tab`, arrows, `Shift` + arrows, `Supr`, `Enter` | Pick a node, move it, delete it, edit it |

The flow editor also lists every step in an accessible *Lista de pasos*, and connections can be made
from the inspector's selects. Every chart has a *Ver datos en tabla* equivalent.

## Run it

Requires Node 22.12+ and pnpm.

```bash
pnpm install
pnpm dev        # http://localhost:4621
pnpm build      # static output in dist/
pnpm preview    # serves dist/ on port 4621
pnpm check      # astro check (strict TypeScript)
```

## Showcase mode (for the portfolio video)

- `/?showcase` plays the six landing scenes in a ~27 s loop, with no cursor and no scrolling needed.
- `/app/?showcase` tours the app in a ~25 s loop: Inicio, Bandeja, flow editor with live pulses,
  Agenda and Métricas. It runs at 10x with no cursor.

Both start from a clean seed and **never write to `localStorage`**, so a visitor's saved session is untouched.

To record: open the URL in a 1600x900 browser window and capture the screen for one loop.

## Poster

`public/poster.jpg` (1600x900) is captured from the real landing (`/?poster`) with Playwright:

```bash
pnpm exec playwright install chromium   # once
pnpm build && pnpm poster
```

## Tests

```bash
pnpm build
pnpm test:e2e     # every route at 1440 px, 390 px and reduced motion, plus both showcases and the interaction suite
pnpm test:shots   # same route sweep, saving screenshots to e2e-screens/ (git-ignored)
```

The tests serve `dist/` from an in-process server (port 4621, or a free port if busy), so nothing keeps
running afterwards. They fail on any console error or warning, horizontal overflow, or a hidden Demo mark.

## Stack

- **Astro 7** with strict TypeScript and static output. CSS is inlined, and the app uses
  `<ClientRouter />` view transitions, so the engine keeps running across navigations.
- **Vanilla TypeScript** views: keyed DOM reconciliation and dynamic imports per view. No UI framework.
- **GSAP 3** (ScrollTrigger, MotionPathPlugin, Draggable), lazy-loaded on the landing only.
- **Seeded data** from a deterministic generator (`src/data/`): 12 specialties, 40 professionals,
  a week of appointments, 60 sample conversations and 280 patients.
- **Fonts**: Commissioner (numbers and display) and Source Sans 3 (text, plain zero), self-hosted
  under the SIL OFL (licences in `public/fonts/`).
- **Reduced motion**: complete static versions; the simulation starts paused.
