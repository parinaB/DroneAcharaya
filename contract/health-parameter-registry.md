# Health-Parameter Registry (CANONICAL)

The single source of truth for health-parameter names. **Two distinct
conventions exist here, and they are NOT interchangeable — check the suffix
before assuming a direction:**

- **`_health` suffix — health fraction, 1.0 = healthy → 0.0 = fully failed.**
  Matches `failure-mode-matrix.csv`'s actual injection/failure language for
  every one of these rows ("scales X **1.0→0.0**", failure criterion
  `<= threshold`) — a `<=` failure check only makes sense if the value
  *decreases* toward failure.
- **`_deg` suffix, or a rate/probability parameter (`misfire_rate`,
  `combustion_stability`) — 0.0 = healthy → 1.0 (or higher) = fully failed.**
  These are "degradation-driver" scalars, not health fractions — the matrix
  correspondingly uses "scales X **0.0→1.0**" language and `>= threshold`
  failure criteria.

(**Corrected 2026 — this file previously stated a single universal "0.0 =
healthy … 1.0 = fully failed" convention for every row, contradicting
`failure-mode-matrix.csv`'s own injection/failure-criterion direction for
every `_health`-suffixed row. The `_health` rows below are fixed to match
the matrix, which is what the Simulink fault hooks in `engine_core.slx`
were already built and validated against — `cooling_health`,
`oil_pump_health`, `injector_health_c1..4` all use 1.0=healthy. The `_deg`/
rate rows were already internally consistent and are unchanged.**)

`failure-mode-matrix.csv` and `parameter-source-table.csv` MUST reference
these exact names. Do not rename in one file without updating all three.

Naming convention: `snake_case`, suffix `_health` for condition scalars
(1.0=healthy→0.0=failed), `_deg` for degradation-driver scalars that are not
a simple health fraction (0.0=healthy→1.0=failed). Per-cylinder scalars take
a `_c{1..4}` suffix.

| canonical_name        | applies to            | healthy value         | failed value                    | per-cylinder? | injected by (fault row) |
|-----------------------|------------------------|------------------------|----------------------------------|----------------|---------------------------|
| injector_health_c1    | cylinder 1 injector   | 1.0 = nominal delivery | 0.0 = fully fouled / no delivery | yes           | injector_degradation    |
| injector_health_c2    | cylinder 2 injector   | 1.0 = nominal delivery | 0.0 = fully fouled / no delivery | yes           | injector_degradation    |
| injector_health_c3    | cylinder 3 injector   | 1.0 = nominal delivery | 0.0 = fully fouled / no delivery | yes           | injector_degradation    |
| injector_health_c4    | cylinder 4 injector   | 1.0 = nominal delivery | 0.0 = fully fouled / no delivery | yes           | injector_degradation    |
| cooling_health        | cooling system        | 1.0 = full heat rejection | 0.0 = no coolant-side heat transfer | no        | cooling_degradation     |
| oil_pump_health       | lubrication delivery  | 1.0 = rated oil pressure | 0.0 = no pump delivery         | no            | oil_pump_degradation    |
| bearing_health        | crank/main bearings   | 1.0 = nominal friction | 0.0 = seized / max friction     | no            | bearing_wear            |
| fuel_delivery_health  | fuel supply / rail    | 1.0 = full delivery    | 0.0 = full starvation           | no            | fuel_starvation         |
| alternator_health     | alternator             | 1.0 = rated output     | 0.0 = no output                 | no            | alternator_degradation  |
| turbo_efficiency_deg  | turbocharger          | 0.0 = map efficiency (healthy) | 1.0 = fully degraded turbo | no       | turbo_degradation       |
| injection_timing_deg  | ECU / rail timing     | 0.0 = commanded timing (healthy) | 1.0 = max timing drift  | no          | injection_timing_drift  |
| combustion_stability  | per-cylinder burn     | 0.0 = stable IMEP (healthy) | 1.0 = max cycle-to-cycle variance | yes*  | combustion_instability  |
| misfire_rate          | per-cylinder           | 0.0 = no misfires (healthy) | 1.0 = every cycle misfires (rate) | yes* | misfire                 |

\* combustion_stability and misfire_rate are per-cylinder in principle; the crank-resolved
sidecar (model tier B) produces their signatures. For the mean-value model these
either don't apply or appear only as an averaged proxy — see model_tier in the matrix.

## Sensor-fault drivers (NOT engine health — corrupt the measurement, not the engine)

These live in a separate namespace because the whole point of the twin is to tell
them apart from engine health. They modify a telemetry channel AFTER the physics.
Severity here is a direct additive offset in the channel's own units (e.g. degC),
not a 0-1 fraction — 0 = no fault, growing magnitude = worse.

| canonical_name        | corrupts channel(s)   | mode                                   |
|-----------------------|-------------------------|-------------------------------------------|
| sensor_bias           | any single channel    | additive constant offset               |
| sensor_drift          | any single channel    | slow ramp (additive, time-growing)     |
| sensor_noise          | any single channel    | added variance                         |
| sensor_stuck          | any single channel    | frozen at last value                   |
| sensor_dropout        | any single channel    | missing / NaN (see missing_value_policy) |

## Cross-reference note

`failure-mode-matrix.csv` currently carries **15 fault rows** (6 tier A, 9 tier
B) — not the twelve referenced in the original planning prose (see
[`../docs/build_plan.md`](../docs/build_plan.md#step-4--fault-injection)). The
extra rows are the four additional sensor-fault modes (`sensor_bias`,
`sensor_noise`, `sensor_stuck`, `sensor_dropout`) beyond `sensor_drift`, plus
`bearing_health`'s `mechanical_vibration` row is distinct from
`oil_pump_health`'s `lubrication_degradation` row even though both were
grouped under "lubrication" in the prose summary. Treat this file and the
matrix as authoritative over the prose count.
