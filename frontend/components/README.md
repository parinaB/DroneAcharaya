# components/

Shared, presentational React components used across the `dashboard`, `replay`
and `reports` routes. Keep them route-agnostic: data comes in via props, and
fetching stays in the route or in `lib/api-client.ts`.

Expected contents:

- **Gauges** — radial / linear indicators for instantaneous engine parameters
  (RPM, CHT, EGT, oil pressure, oil temperature, fuel flow, battery voltage),
  with nominal / caution / exceedance bands.
- **Charts** — time-series plots for telemetry trends, anomaly-score traces,
  and RUL decay curves; plus the replay timeline scrubber.
- **Alert cards** — fault-detection callouts carrying fault type, severity,
  confidence, detection latency and the recommended advisory action.
- **Layout primitives** — panel/grid wrappers, status pills, KPI tiles.

Naming: `PascalCase.tsx` one component per file, co-located with its own types
when they are not part of the shared ingestion schema in `lib/types.ts`.
