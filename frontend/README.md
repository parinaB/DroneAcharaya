# DroneAcharaya frontend

Next.js dashboard for DroneAcharaya, the digital twin for a MALE UAV piston
engine (SIH 2026). This is the 2D presentation layer described in the
[repo root README](../README.md): it renders the same backend API output an
eventual Unreal Engine visualization would, and never talks to ML artifacts
directly.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** for utility styling; the dashboard route uses inline
  styles plus a handful of shared CSS classes (`globals.css`) for
  pixel-accurate parity with its design source (see below)
- ESLint + `tsc --noEmit` for lint/typecheck, matching the CI config at the
  repo root (`ci-lint.yml`)

## Getting started

```bash
npm install
cp .env.local.example .env.local   # points at http://localhost:8000
npm run dev                         # http://localhost:3000
```

```bash
npm run lint        # ESLint
npm run typecheck    # tsc --noEmit
npm run build        # next build
```

## Structure

| Path | What it is |
| --- | --- |
| [`app/dashboard/`](app/dashboard/) | The digital-twin dashboard: **Live Dashboard** and **Simulation / Digital Twin** screens, see below. |
| [`app/replay/`](app/replay/) | Run replay view (placeholder). |
| [`app/reports/`](app/reports/) | Reports view (placeholder). |
| [`lib/types.ts`](lib/types.ts) | Telemetry types mirroring `data/schema.md`, the frontend's side of the backend contract. |
| [`lib/api-client.ts`](lib/api-client.ts) | Backend API client, used by the one real-wired panel below. |

## The dashboard route

`app/dashboard/` is a single client-rendered page with two screens switched
by sidebar navigation, a light/dark theme toggle, and a full-screen boot
sequence that plays once on mount:

- **Live Dashboard**: the operator's default view. A live model output
  panel at the top ([`LiveModelPanel.tsx`](app/dashboard/_components/LiveModelPanel.tsx),
  the one part of this screen genuinely wired to the backend, see below)
  sits above the mocked demo panels: a collapsible critical-fault rail
  (starts as a thin strip next to the nav, expands on click into the fault
  detail with confidence/RUL/advisory), a twin-divergence chart (measured
  vs predicted EGT) that draws itself in on first reveal, four headline
  stats (health index, engine speed, peak CHT, mission reliability),
  per-cylinder thermals, a vibration FFT panel, sub-system health scores,
  an AI diagnostic summary, and a live anomaly feed. Every card glows on
  hover (red for a critical reading, green otherwise). "Open prediction"
  and "Why this prediction?" jump straight into the Simulation screen with
  the relevant scenario and explainability tab pre-selected; "Acknowledge"
  dims the fault banner in place.
- **Simulation / Digital Twin**: a scenario picker (each card shows a
  status dot, subtitle, and a one-line description of what it exercises),
  a placeholder Unreal Engine pixel-stream viewport with camera switches
  and a telemetry HUD, transport controls with a scrubbable mission
  timeline, and a right rail covering environment/live channels, predicted
  faults with RUL, and Drivers/Residual/Reasoning explainability tabs, all
  using the same hover-glow card treatment as the Live Dashboard.

Internal layout, by responsibility:

```
app/dashboard/
  page.tsx                 orchestrates screen/theme/sidebar/simulation state, boot sequence
  _components/
    LoadingScreen.tsx       boot progress screen (own literal dark palette, renders outside the theme root)
    Sidebar.tsx             collapsible nav (icon rail when collapsed) + telemetry/inference status
    TopBar.tsx               screen title, theme toggle, profile
    NavIcons.tsx             icon set for the sidebar nav
    LiveModelPanel.tsx       real /replay + /inference wiring, see below
    LiveDashboard.tsx        Live Dashboard screen
    SimulationView.tsx       Simulation / Digital Twin screen
  _lib/
    tokens.ts                color/font tokens; color.* resolves to CSS custom properties so it repaints per-theme for free
    state.ts                 shared types (Screen, Theme, ...), scenario data, sim defaults
    format.ts                display formatters (hms, altitude, mixture, ...)
```

### Theming

Dark and light palettes are both defined as CSS custom properties in
`globals.css`, scoped under `.dt-root` / `.dt-root[data-theme="light"]`.
The toggle in the top bar flips `data-theme` on the root element and
persists the choice to `localStorage`; every component reads colors via
`_lib/tokens.ts`'s `color.*`, so nothing branches on theme itself. Dark
mode is neon green on true black; light mode is a proper off-white, not
near-white, with a subtle elevation shadow (`.dt-surface`) on primary
panels so they don't blend into the page background.

### Design source and current data

The dashboard was implemented from a Claude Design handoff ("AeroTwin
Dashboard v2"), rebuilt as real React components rather than copied
structurally, and rebranded AeroTwin to DRONE-ACHARYA. Most of its
telemetry, fault, and XAI values are still the design's static demo data:
`LiveModelPanel.tsx` is the one exception, genuinely wired to the backend's
`/replay` and `/inference` endpoints and showing real
`lstm_rul`/`xgboost_classifier`/`autoencoder` output once a replay session
is started against a run in `data/sample_runs/` (currently empty upstream,
so "Start replay session" will error until real runs land there). Wiring
the rest of the mocked panels to the backend is the next real gap here, not
missing backend endpoints; see [`backend/CLAUDE.md`](../backend/CLAUDE.md)
for the API surface and the repo root `CLAUDE.md` for the full status.

## Learn more

- [Next.js documentation](https://nextjs.org/docs)
- Repo root [`README.md`](../README.md) for the full project, and
  [`docs/build_plan.md`](../docs/build_plan.md) for where the frontend sits
  in the overall build order.
