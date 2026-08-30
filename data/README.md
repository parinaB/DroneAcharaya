# data/ — dataset reference

This is the entry point for anyone building models against this dataset —
in particular, the multi-headed LSTM. It documents every column, where the
data comes from, and how the folders are organized. For the physics behind
the numbers, see [`../docs/build_plan.md`](../docs/build_plan.md) (Step 6)
and [`../contract/`](../contract/) (the frozen schemas this export follows).

## Folder layout

```
data/
  raw/              Gitignored scratch space for one-off / ad-hoc simulation
                     runs (see raw/README.md). Not the structured dataset.
  processed/
    <batch_name>/    e.g. main_batch_1000 (the current full training dataset:
                     123 units / 1111 missions, verify_batch.m-clean) -- one
                     batch = one call to simulation/scripts/run_fleet_missions.m
      train/
        telemetry/      <run_id>.csv           <- model INPUT (Xs)
        groundtruth/    <run_id>_groundtruth.csv
      validation/
        telemetry/      <run_id>.csv
        groundtruth/    <run_id>_groundtruth.csv
      meta/
        <run_id>.meta.json     one JSON per mission, BOTH splits together
      completed.log     batch-level checkpoint (which run_ids finished)
      errors.log        any mission that failed (if the file exists at all)
```

**Why split into train/ and validation/ folders, not a column:** per
`ml/evaluation/README.md`'s existing rule, splits are grouped by run — a
whole mission's file goes entirely into one split, never divided row-by-row
— so keeping them in physically separate folders makes that guarantee
impossible to violate by accident (e.g. a careless `glob("**/*.csv")` in a
notebook). The assignment itself is deterministic per mission
(`simulation/scripts/assign_split.m`): stratified by `fault_class` so every
fault class has representation in both splits, even in a small batch.

**Why `meta/` is separate from the CSVs:** each `.meta.json` describes
*how* a mission was generated (fault class, severity trajectory, mission
shape, accumulated engine hours, RNG seeds) — provenance and labels, not
telemetry rows. Keeping it out of `telemetry/`/`groundtruth/` means a naive
"load every file in this folder as a table" never chokes on a JSON file, and
means metadata for a run is findable in one place regardless of which split
that run landed in.

**A batch's own generation config** (fleet composition, onset/rate draws,
seed) is not yet written to its own manifest file — right now it only lives
in the MATLAB session that called `generate_fleet.m`. If you need to
regenerate or extend a specific batch exactly, check `docs/build_plan.md`'s
Step 6 log for the parameters used, or ask before assuming a batch is
reproducible byte-for-byte.

## What each mission actually is

One row = one second of simulated flight (see "Sample rate" below). One
file = one mission = one flight of one simulated engine ("unit") at one
point in that unit's life. A unit flies many missions across
`train_fleet_missions.m`'s loop; each mission is labeled with the unit's
current fault class and how far along its degradation trajectory it is at
that mission's start (`accumulated_hours_at_start` in the meta.json).

**Sample rate: 1Hz, one shared rate for the whole table.**
`contract/telemetry-schema.yaml` specifies per-field native rates from
1-50Hz, but this export deliberately uses ONE common rate for every column,
because (a) nothing here needs 50Hz for degradation/RUL work, (b) the
vibration/IMEP-COV features (below) only update once per mission *phase*
anyway — far coarser than any per-field native rate — so matching them to
faster columns would be manufacturing precision that isn't there, and (c) a
single flat table is what both CSV and a sequence model naturally want. If
you need a specific channel at its schema-native rate, that's a follow-up
resampling step on top of this file, not a re-export.

---

## `telemetry/<run_id>.csv` — Xs (model INPUT)

This is what a real ECU/telemetry stream would report — "sensor-realistic"
values, already passed through whatever sensor-fault corruption is active
for that mission (currently only `cht_c3` is corruptible; every other
channel's telemetry value equals its ground-truth value 1:1, see the
limitations section). **This is the file the LSTM's input sequence comes
from.** Do not train directly on `groundtruth/` — that file exists to
validate against, and to derive labels/targets from, not to feed as input;
in real deployment there is no ground truth.

| Column | Units | Meaning |
| --- | --- | --- |
| `t` | s | Mission-elapsed time, 0 at engine start. |
| `rpm` | rpm | Crankshaft speed. |
| `torque` | N·m | Crankshaft torque. |
| `power` | kW | Derived: `torque * rpm * 2*pi/60/1000`. NOT alternator power. |
| `engine_load` | fraction 0-1 | **Placeholder = throttle position.** No independent load/torque-demand signal exists in the model yet; see limitations. |
| `cht_c1`..`cht_c4` | °C | Per-cylinder head temperature. `cht_c3` is the one channel that can carry a sensor fault (bias/drift/noise/stuck/dropout) — see `sensor_fault_active_cht_c3` in the groundtruth file for when. |
| `egt_c1`..`egt_c4` | °C | Per-cylinder exhaust gas temperature. The primary per-cylinder fault discriminator (injector fouling, misfire, timing drift all show up here). |
| `oil_pressure` | bar | Lubrication pressure — drops with `oil_pump_health`/`bearing_health` faults. |
| `oil_temperature` | °C | Oil sump temperature. |
| `fuel_flow` | kg/h | Total fuel consumption rate. |
| `rail_pressure` | bar | Common-rail fuel pressure. |
| `injection_timing` | deg BTDC | Commanded main-injection timing; drifts under `injection_timing_deg`. |
| `boost_pressure` | bar, gauge | Turbo boost above ambient. |
| `map` | kPa, absolute | Manifold absolute pressure = ambient + boost. |
| `intake_temperature` | °C | Post-intercooler intake air temperature. |
| `air_mass_flow` | kg/s | Intake air mass flow. |
| `coolant_temperature` | °C | Coolant loop temperature. |
| `vibration_rms_x` | rad/s² | Angular-acceleration RMS from the crank-resolved sidecar. **Only populated during the 4 mission phases the sidecar actually samples (idle/climb/loiter-or-equivalent/descent) — `NaN` elsewhere (e.g. during `STARTING`), by design, not a bug.** Reflects `misfire`/`combustion_instability` (both are wired into the sidecar); does **not** reflect `mechanical_vibration`/bearing wear — see the next column. |
| `vibration_order_1x` | rad/s² | Once-per-shaft-revolution component of the SIDECAR reading above. Rises sharply under `misfire` (breaks the even firing symmetry). Same phase-coverage caveat, and same "not bearing wear" caveat, as `vibration_rms_x`. |
| `vibration_rms_x_bearing_proxy`, `vibration_order_1x_bearing_proxy` | g (RMS), g | **The `mechanical_vibration`/`bearing_health` signal.** A separate, continuous (no phase-coverage gaps, defined for the whole mission) mean-value proxy from `engine_core` itself, not the sidecar — `bearing_health` was never wired into the sidecar (only `misfire_rate`/`combustion_stability` are), so it cannot show up in the two columns above. Scales with `(rpm/rated_rpm)^2` (real rotating-imbalance physics), so it's legitimately small at low throttle even at high fault severity — judge it relative to that mission's own healthy baseline, not a fixed magnitude threshold. Found and fixed via `simulation/scripts/verify_batch.m` (see that script and `docs/build_plan.md` for the story: the first sanity batch shipped with this fault class invisible until the check caught it). |
| `battery_voltage` | V | Electrical bus voltage. |
| `battery_current` | A | Battery charge(+)/discharge(-) current. |
| `alternator_power` | kW | Alternator output — degrades under `alternator_health`. |
| `altitude` | m | Mission-commanded altitude. |
| `ambient_pressure` | kPa | ISA (+ hot-day offset) ambient pressure at `altitude`. |
| `ambient_temperature` | °C | ISA (+ hot-day offset) ambient temperature at `altitude`. |
| `air_density` | kg/m³ | Derived from ambient pressure/temperature. |
| `throttle` | fraction 0-1 | Commanded throttle position (includes OU-process jitter during flight, per `generate_mission_profile.m`). |
| `engine_state` | enum | One of `STARTING/IDLE/TAKEOFF/CLIMB/CRUISE/HIGH_ALTITUDE_CRUISE/LOITER/THROTTLE_TRANSIENT/DESCENT/SHUTDOWN/OFF`, from the mission's own scripted phase breakpoints — not re-derived from thresholds elsewhere, so it can't drift out of sync with what actually drove the simulation. |
| `engine_id` | string | The unit (simulated airframe/engine) that flew this mission — group by this across missions to reconstruct one unit's life. |
| `mission_id` | string | `<mission_shape>-M<NNN>` for this specific flight. |
| `data_origin` | enum | Always `SIMULATED` in this dataset (the schema also allows `REPLAY`/`REAL_ECU` for future real-hardware data). |

## `groundtruth/<run_id>_groundtruth.csv` — Xv + θ + sensor-fault-activity

Pre-sensor-corruption true values, the actual health-parameter values
driving the physics, and when any sensor fault was active. **Use this to
build labels/targets, not as model input.**

| Column | Units | Meaning |
| --- | --- | --- |
| `t` | s | Same time base as the telemetry file (join on `t`). |
| `rpm_true`, `torque_true`, `cht_c1_true`..`cht_c4_true`, `egt_c1_true`..`egt_c4_true`, `oil_pressure_true`, `oil_temperature_true`, `fuel_flow_true`, `rail_pressure_true`, `injection_timing_true`, `boost_pressure_true`, `map_true`, `intake_temperature_true`, `air_mass_flow_true`, `coolant_temperature_true`, `battery_voltage_true`, `battery_current_true`, `alternator_power_true` | (same units as the telemetry equivalents) | The pre-corruption ground truth for each telemetry column. Identical to the telemetry value for every channel except `cht_c3` (see below). |
| `vibration_rms_x_true`, `vibration_order_1x_true` | rad/s² | Same as telemetry (no sensor-fault path exists on vibration channels yet, so these are always equal to the telemetry columns). |
| `vibration_rms_x_bearing_proxy_true`, `vibration_order_1x_bearing_proxy_true` | g | Same as the telemetry bearing-proxy columns above (no sensor-fault path on this channel either). |
| `vibration_order_2x_true` | rad/s² | The dominant once-per-180-crank-degree combustion-firing harmonic for this 4-cylinder engine. Healthy baseline is strongly order-2-dominated; **not in the telemetry file** — it's an extra diagnostic signal beyond the frozen schema, kept here because it's informative and doesn't cost anything to keep. |
| `imep_cov_c1` | fraction | Coefficient of variation (std/mean) of cylinder 1's indicated mean effective pressure over a rolling 10-cycle window. Near-zero when healthy; rises under `combustion_instability`. Also an extra column beyond the frozen schema, same reasoning. |
| `injector_health_c1`..`injector_health_c4` | fraction, 1.0→0.0 | 1.0 = healthy delivery, 0.0 = fully fouled/no delivery, per cylinder. |
| `cooling_health` | fraction, 1.0→0.0 | 1.0 = full heat rejection, 0.0 = none. |
| `oil_pump_health` | fraction, 1.0→0.0 | 1.0 = rated oil pressure, 0.0 = no delivery. |
| `bearing_health` | fraction, 1.0→0.0 | 1.0 = nominal friction, 0.0 = seized/max friction and imbalance. |
| `turbo_efficiency_deg` | fraction, 0.0→1.0 | 0.0 = healthy map efficiency, 1.0 = fully degraded. **Inverted convention from the `_health` columns** — see "Two conventions" below. |
| `combustion_stability` | fraction, 0.0→1.0 | 0.0 = stable combustion, 1.0 = maximum cycle-to-cycle variance (drives `imep_cov_c1`). |
| `injection_timing_deg` | fraction, 0.0→1.0 | 0.0 = commanded timing (healthy), 1.0 = maximum timing drift. |
| `fuel_delivery_health` | fraction, 1.0→0.0 | 1.0 = full fuel delivery, 0.0 = full starvation. Condition-gated: only caps delivery at high demand, invisible at cruise (see `docs/build_plan.md`). |
| `alternator_health` | fraction, 1.0→0.0 | 1.0 = rated electrical output, 0.0 = none. |
| `misfire_rate_c1`..`misfire_rate_c4` | probability, 0.0→1.0 | Per-cylinder per-cycle probability of a misfire event. Independent per cylinder — a real injector/cylinder-specific fault, same pattern as `injector_health`. |
| `sensor_fault_active_cht_c3` | enum | One of `NONE/BIAS/DRIFT/NOISE/STUCK/DROPOUT` — which sensor fault (if any) is active on the `cht_c3` channel at this timestamp. Drawn independently of the unit's physical `fault_class`, per `generate_fleet.m`, specifically so a model can't learn a spurious fault↔sensor-fault correlation. |

### Two health-parameter conventions — check the suffix

Per `contract/health-parameter-registry.md`:
- **`_health` suffix**: 1.0 = healthy → 0.0 = fully failed (a `<=` threshold means failure).
- **`_deg` suffix, or a rate/probability** (`misfire_rate_c*`, `combustion_stability`): 0.0 = healthy → 1.0 = fully failed (a `>=` threshold means failure).

Getting this backwards silently inverts every severity/RUL label — check
the suffix before assuming a direction.

### `cht_c3` is the one channel with real sensor-fault corruption

`cht_c3_true` (groundtruth) is the actual physics value and always stays
clean. `cht_c3` (telemetry) is what a sensor would report — identical to
`cht_c3_true` unless `sensor_fault_active_cht_c3` is non-`NONE` at that
timestamp, in which case it carries the corresponding bias/drift/noise/
stuck/dropout corruption. Every other telemetry column currently equals its
`_true` counterpart exactly — no other channel has a sensor-fault path
built yet.

## `meta/<run_id>.meta.json` — per-mission provenance

| Field | Meaning |
| --- | --- |
| `run_id` | `<unit_id>_M<NNN>` — unique per mission. |
| `engine_id` | Same as the unit_id — which simulated engine flew this. |
| `mission_id` | `<mission_shape>-M<NNN>`. |
| `mission_shape` | One of `long_loiter`, `short_patrol`, `high_altitude_transit`, `hot_day_ground_ops`, `high_throttle_climb_heavy` — see `docs/build_plan.md` for what each stresses. |
| `fault_class` | This unit's assigned physical fault (or `healthy`) for its whole life. |
| `split` | `train` or `validation` — which folder this mission's files live in (redundant with the folder path, kept here so a shuffled/merged file list is still traceable). |
| `accumulated_hours_at_start` | This unit's total prior engine hours when THIS mission began — the input to the staged degradation curve, not calendar time or mission count. |
| `health` | The exact θ struct (health-parameter values) used for this mission — same fields as the groundtruth columns' constant values, for quick lookup without opening the CSV. |
| `sensor_fault` | `{channel, type, onset_s}` — this mission's independent sensor-fault draw and when (if) it activated, in mission-elapsed seconds. |
| `n_rows`, `duration_s`, `export_rate_hz` | Bookkeeping about the export itself. |

## Building the multi-headed LSTM: suggested head mapping

This dataset was built with a few natural output heads in mind — not
prescriptive, but a reasonable starting split of the columns above:

1. **Fault classification head** — predict `fault_class` (from the
   meta.json / constant across a mission) from the telemetry sequence.
   11-way classification (`healthy` + 10 physical fault classes).
2. **Severity / health-parameter regression head** — regress the current
   value of whichever `_health`/`_deg` groundtruth column corresponds to
   the mission's `fault_class` (i.e. its position on the 0-1 damage curve
   at each timestep, not just a single scalar per mission).
3. **RUL regression head** — not a direct column. Derive it per mission
   from `accumulated_hours_at_start` plus the unit's onset/gradual/accel
   span parameters (currently only in the MATLAB session that generated
   the batch, not yet written to meta.json — flag if you need this
   formalized into the export).
4. **Sensor-fault-vs-physical-fault discriminator head** — predict
   `sensor_fault_active_cht_c3` (or NONE) separately from the physical
   `fault_class` head, since that's the entire point of carrying both a
   `_true` and a corrupted telemetry value for `cht_c3` — a model that
   collapses these into one label has lost the thing this dataset is
   for.

Whatever the head split, **group by `engine_id` (or `run_id`) when building
sequences/batches, never by row** — see `ml/evaluation/README.md`'s
grouped-split rule, which this dataset's train/validation folder split
already enforces at the file level.

## Verifying a batch before trusting it

Run `simulation/scripts/verify_batch.m` against any `data/processed/<batch_name>`
folder before using it — for a new batch, before handing it to anyone, and
again any time the simulation scripts change. It checks, per mission:

- **Data integrity** — NaN/Inf where a column should always be defined, row
  counts, time monotonicity.
- **Physical bounds** — RPM/power/temperature/pressure/altitude against the
  published EASA TCDS limits in `contract/parameter-source-table.csv`.
- **Cross-signal consistency** — `map = ambient_pressure + boost_pressure`,
  `power = torque*rpm*2pi/60/1000`.
- **Fault-signature correctness** — for each mission's assigned `fault_class`
  and its θ severity (from `meta.json`), checks the SPECIFIC discriminator
  `contract/failure-mode-matrix.csv` defines is actually present and scales
  with severity, and that `healthy` missions show none of them. This is the
  check that matters most — a dataset can pass every bounds check and still
  teach a model nothing if the fault signatures aren't really there.
- **Batch-level coverage** — mission count and severity spread per fault
  class.

Each finding is `FAIL` (a real bug — should never happen), `WARN` (worth a
human look, may be intentional), or `INFO` (aggregate stats). It writes
`verification_report.md` into the batch folder itself, so it travels with
the data when you hand it to someone else.

**This check already caught a real bug once:** the first version of
`sanity_batch_001` shipped with `mechanical_vibration` (bearing wear)
invisible in every column — `bearing_health` had only ever been wired into
`engine_core`'s mean-value proxy (Step 4), never into the crank-resolved
sidecar, and the exporter was discarding that proxy entirely in favor of
sidecar-only vibration columns. Fixed by adding the
`vibration_*_bearing_proxy` columns above (see `docs/build_plan.md`'s Step 6
log for the full story). Passing `verify_batch.m` cleanly is necessary, not
sufficient, to trust a batch — the `INFO`-level findings above (e.g.
`cooling_degradation`/`turbo_degradation` need a comparative check against a
healthy baseline at matching conditions, not a single-mission threshold) are
real gaps in automated coverage, not resolved just because they're not
`FAIL`.

**It caught two more real bugs scaling up to `main_batch_1000`.** A unit
whose manufacturing-tolerance draw pushed friction just high enough could
sag below idle RPM during the throttle ramp and stall permanently (no fuel
scheduling ever referenced actual RPM, only commanded throttle) — engine
dead for the rest of the mission. Fixed with a closed-loop idle-speed
governor in `engine_core`. That governor's fuel trim, uncapped, could then
demand more fuel than available intake air could support during a fast
recovery, crashing AFR into single digits and producing EGT spikes past
4000°C — `verify_batch.m`'s `B_egt` check (>1200°C) caught this immediately.
Fixed with an AFR-floored smoke limiter, placed after (not before) the
injection-timing-drift fault's BSFC penalty multiplies fuel. See
`docs/build_plan.md`'s Step 6 log for the full story.

## Known limitations — read before assuming a column is more complete than it is

- **`engine_load` is a placeholder equal to `throttle`.** No independent
  load/torque-demand signal exists in `engine_core` yet.
- **`vibration_rms_x`/`vibration_order_1x` (and the extra
  `vibration_order_2x_true`/`imep_cov_c1`) are only populated during the
  mission phases the crank-resolved sidecar actually samples** (one burst
  per phase — idle/climb/loiter-equivalent/descent — not continuously).
  They are honestly `NaN` outside those phases (e.g. `STARTING`,
  `THROTTLE_TRANSIENT` on the `high_throttle_climb_heavy` shape) rather
  than interpolated or fabricated.
- **Only `cht_c3` has a real sensor-fault corruption path.** Every other
  telemetry column is identical to its groundtruth value.
- **1Hz single export rate for the whole file** — see "Sample rate" above.
- **The full designed sweep has been run: `main_batch_1000` (123 units,
  1111 missions across all 11 fault classes, `verify_batch.m`-clean).**
  Smaller than `docs/build_plan.md`'s Step 6 estimate of ~225-360 units
  (no Parallel Computing Toolbox on the generation machine, so scale was
  capped by sequential compute time), but every fault class has real
  severity-spread coverage (0 to that class's `max_severity` from
  `failure-mode-matrix.csv`) plus a healthy baseline across all 5 mission
  shapes. `sanity_batch_001` and `validation_batch_short2` were earlier,
  much smaller batches used only to validate the pipeline before this run —
  not meant for training.
- **No held-out generalization set yet** (a whole mission-shape or
  severity band never seen in training) — `ml/evaluation/README.md` calls
  for one; only train/validation exist so far.
