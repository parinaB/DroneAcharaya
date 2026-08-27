# Health-Parameter Registry (CANONICAL)

The single source of truth for health-parameter names. Every scalar below is a
value in **[0.0 = healthy … 1.0 = fully failed]** unless noted. `failure-mode-matrix.csv`
and `parameter-source-table.csv` MUST reference these exact names. Do not rename
in one file without updating all three.

Naming convention: `snake_case`, suffix `_health` for condition scalars,
`_deg` for degradation-driver scalars that are not a simple health fraction.
Per-cylinder scalars take a `_c{1..4}` suffix.

| canonical_name        | applies to            | 0.0 means            | 1.0 means                      | per-cylinder? | injected by (fault row) |
|-----------------------|------------------------|-----------------------|---------------------------------|----------------|---------------------------|
| injector_health_c1    | cylinder 1 injector   | nominal delivery     | fully fouled / no delivery     | yes           | injector_degradation    |
| injector_health_c2    | cylinder 2 injector   | nominal delivery     | fully fouled / no delivery     | yes           | injector_degradation    |
| injector_health_c3    | cylinder 3 injector   | nominal delivery     | fully fouled / no delivery     | yes           | injector_degradation    |
| injector_health_c4    | cylinder 4 injector   | nominal delivery     | fully fouled / no delivery     | yes           | injector_degradation    |
| cooling_health        | cooling system        | full heat rejection  | no coolant-side heat transfer  | no            | cooling_degradation     |
| oil_pump_health       | lubrication delivery  | rated oil pressure   | no pump delivery               | no            | oil_pump_degradation    |
| bearing_health        | crank/main bearings   | nominal friction     | seized / max friction          | no            | bearing_wear            |
| turbo_efficiency_deg  | turbocharger          | map efficiency       | fully degraded turbo           | no            | turbo_degradation       |
| combustion_stability  | per-cylinder burn     | stable IMEP          | max cycle-to-cycle variance    | yes*          | combustion_instability  |
| injection_timing_deg  | ECU / rail timing     | commanded timing     | max timing drift               | no            | injection_timing_drift  |
| fuel_delivery_health  | fuel supply / rail    | full delivery        | full starvation                | no            | fuel_starvation         |
| alternator_health     | alternator             | rated output         | no output                      | no            | alternator_degradation  |
| misfire_rate          | per-cylinder           | 0 misfires            | every cycle misfires (rate)    | yes*          | misfire                 |

\* combustion_stability and misfire_rate are per-cylinder in principle; the crank-resolved
sidecar (model tier B) produces their signatures. For the mean-value model these
either don't apply or appear only as an averaged proxy — see model_tier in the matrix.

## Sensor-fault drivers (NOT engine health — corrupt the measurement, not the engine)

These live in a separate namespace because the whole point of the twin is to tell
them apart from engine health. They modify a telemetry channel AFTER the physics.

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
