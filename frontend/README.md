# DroneAcharaya frontend

Next.js 15 dashboard for DroneAcharaya, the digital twin for a MALE UAV
piston engine (SIH 2026). This is the 2D presentation layer described in the
[repo root README](../README.md): it renders the same backend API output an
eventual Unreal Engine visualization would, and never talks to ML artifacts
directly.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** for utility styling; the dashboard route uses inline
  styles for pixel-accurate parity with its design source (see below)
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
| [`lib/api-client.ts`](lib/api-client.ts) | Backend API client. |

## The dashboard route

`app/dashboard/` is a single client-rendered page with two screens switched
by sidebar navigation, plus a full-screen boot sequence that plays once on
mount:

- **Live Dashboard**: the operator's default view. Critical fault banner
  with confidence/RUL and an advisory, a twin-divergence chart (measured vs
  predicted EGT), four headline stats (health index, engine speed, peak CHT,
  mission reliability), per-cylinder thermals, a vibration FFT panel,
  sub-system health scores, an AI diagnostic summary, and a live anomaly
  feed. "Open prediction" and "Why this prediction?" jump straight into the
  Simulation screen with the relevant scenario and explainability tab
  pre-selected; "Acknowledge" dims the fault banner in place.
- **Simulation / Digital Twin**: scenario picker, live parameter sliders
  (throttle, altitude, OAT, mixture, injector fault severity), a placeholder
  Unreal Engine pixel-stream viewport with camera switches and a telemetry
  HUD, transport controls with a scrubbable mission timeline, and a right
  rail covering environment/live channels, predicted faults with RUL, and
  Drivers/Residual/Reasoning explainability tabs.

Internal layout, by responsibility:

```
app/dashboard/
  page.tsx                 orchestrates screen/role/simulation state, boot sequence
  _components/
    LoadingScreen.tsx       boot progress screen
    Sidebar.tsx             nav + telemetry/inference status
    TopBar.tsx               role switch, mission clock
    LiveDashboard.tsx        Live Dashboard screen
    SimulationView.tsx       Simulation / Digital Twin screen
  _lib/
    tokens.ts                shared color/font tokens (dark palette)
    state.ts                 shared types + scenario/param defaults
    format.ts                display formatters (hms, altitude, mixture, ...)
```

### Design source and current data

The dashboard was implemented from a Claude Design handoff ("AeroTwin
Dashboard v2"), rebuilt as real React components rather than copied
structurally, and rebranded AeroTwin → DroneAcharaya. Its telemetry, fault,
and XAI values are the design's static demo data, not live backend calls:
`backend/`'s ingestion/inference/advisory/replay modules are still stubs (see
the repo root `CLAUDE.md`), so there is no live API to wire this to yet. When
that lands, the dashboard should read through `lib/api-client.ts` like the
rest of the frontend, following the field names in `lib/types.ts`.

## Learn more

- [Next.js documentation](https://nextjs.org/docs)
- Repo root [`README.md`](../README.md) for the full project, and
  [`docs/build_plan.md`](../docs/build_plan.md) for where the frontend sits
  in the overall build order.
