# Telemetry Schema

Canonical column schema for every run exported by `simulation/` and ingested by
`backend/app/modules/ingestion/`. One row = one telemetry sample.

This file is the single source of truth. `frontend/lib/types.ts` mirrors the
subset the UI consumes; MATLAB export scripts must emit these names exactly.

## Columns

| Column | Type | Unit | Description |
| --- | --- | --- | --- |
| `timestamp` | datetime (ISO-8601) | — | Sample time; monotonic within a run. |
| `run_id` | string | — | Unique identifier for one simulation run; the grouping key for all train/test splits. |
| `mission_profile_id` | string | — | Identifier of the flight profile flown (throttle/altitude/load schedule). |
| `RPM` | float | rev/min | Engine crankshaft speed. |
| `CHT` | float | °C | Cylinder head temperature — primary thermal-distress indicator. |
| `EGT` | float | °C | Exhaust gas temperature — reflects combustion quality and mixture. |
| `Oil_P` | float | bar | Oil pressure — drops on lubrication faults and pump wear. |
| `Oil_T` | float | °C | Oil temperature — lags CHT, indicates cooling and friction load. |
| `Fuel_flow` | float | L/h | Instantaneous fuel consumption; against RPM it exposes injector faults. |
| `Vibration` | float | g (RMS) | Broadband vibration amplitude — bearing wear and misfire signature. |
| `Battery_V` | float | V | Electrical bus voltage — alternator/charging health. |
| `Injection_timing` | float | °BTDC | Injection advance before top dead centre; commanded or measured. |
| `fault_type` | categorical | — | Ground-truth fault class active at this sample (`none` when healthy). |
| `fault_onset` | float | s | Time from run start at which the active fault ramp begins; `null`/`NaN` for nominal runs. |
| `severity` | float | 0–1 | Normalised fault severity at this sample; `0` before onset, rising along the ramp. |
| `time_to_failure` | float | s | Remaining time until severity crosses the failure threshold — the RUL regression target. Capped for nominal runs. |
| `env_conditions` | JSON object / struct | — | Ambient context for the sample: `{ "altitude_m", "oat_c", "pressure_hpa", "airspeed_ms" }`. |

## Fault classes

`none`, `injector_clog`, `bearing_wear`, `oil_starvation`,
`cylinder_head_overheat`, `sensor_drift`, `ignition_misfire`.

Class strings must match `simulation/fault_injection/` definitions and the
`FaultType` union in `frontend/lib/types.ts`.

## Conventions

- **Sample rate** is fixed per run and recorded in the run's sidecar metadata;
  `timestamp` deltas must be uniform.
- **Missing values** are empty, never sentinel numbers like `-999`.
- **Units are never mixed** — a column carries the unit in this table, always.
- **Labels are simulation ground truth.** Model predictions travel in separate
  columns (`fault_type_pred`, `rul_pred`) and never overwrite these.
- **`severity` and `time_to_failure` are derived** from the fault ramp
  definition, not measured; they exist only because the data is synthetic.

## Naming note

Raw/processed files use the column names above. The frontend's
`TelemetrySample` interface uses friendlier aliases for four of them:

| Schema | Frontend |
| --- | --- |
| `Oil_P` | `oil_pressure` |
| `Oil_T` | `oil_temp` |
| `Fuel_flow` | `fuel_flow` |
| `Vibration` | `vibration` |
| `Battery_V` | `battery_voltage` |
| `Injection_timing` | `injection_timing` |
| `time_to_failure` | `rul` |

The ingestion module owns that mapping; nothing downstream should re-map.
