# simulation/ — MVEM (MATLAB/Simulink)

Physics layer. See root [`CLAUDE.md`](../CLAUDE.md) for the full build plan
and cross-subsystem data flow; this file only covers what's specific to
working in `simulation/`.

## What lives here

| Folder | Holds |
| --- | --- |
| [`model/`](model/) | Simulink plant models (`.slx`) — `engine_core`, `crank_resolved_sidecar`, `environment_service` — plus `AeroDieselEngineParameters.m`. |
| [`scripts/`](scripts/) | MATLAB drivers/export scripts (`.m`) that run the model, inject faults, and write telemetry. |
| [`fault_injection/`](fault_injection/) | Superseded — fault ramps are `scripts/compute_health_trajectory.m` + `scripts/fault_class_registry.m`, not a separate folder. |
| [`calibration/`](calibration/) | Superseded — parameter sourcing is in `model/AeroDieselEngineParameters.m`'s comments + `../contract/parameter-source-table.csv`. |

`model/` and `scripts/` are built and validated end-to-end — see
`../docs/build_plan.md`'s Step 6 log for what's been verified and how.

## Non-negotiables

- **Output columns are the contract, not a preference.** Every exported run
  must use the exact field names in [`../data/schema.md`](../data/schema.md)
  (migrating to `../contract/telemetry-schema.yaml`) — units, casing, and
  all. If a signal you need isn't in the schema, add it to the schema first
  (and flag it in `contract/`), don't invent a column name in an export
  script.
- **Fault-type strings must match the registry exactly.** `fault_type`
  values written by `fault_injection/` have to match
  `../contract/health-parameter-registry.md` and
  `../frontend/lib/types.ts`'s `FaultType` union, character for character.
- **The environment service is shared, not reimplemented.** ISA + hot-day
  offset → air density must use the same code path the twin's expected
  model and Unreal use (`../contract/environment-schema.yaml`). Don't hand-roll
  a second atmosphere calculation here even for a quick test.
- **Every run gets a unique `run_id` and `mission_profile_id`.** Randomised
  scenarios take an explicit seed so runs are reproducible — no
  unseeded randomness in anything that gets exported.
- **Validation gates everything downstream (build-plan Step 3).** Until
  engine output lands inside published data across multiple operating
  points, treat the ML/backend/frontend/Unreal layers as building against
  provisional physics — say so if asked whether something is "done."

## Commands

From `simulation/scripts/` in MATLAB:
```matlab
run_single_mission(...)                 % one-off single mission run
generate_fleet(...)                      % build a fleet's unit list (fault x onset/rate x seed)
run_fleet_missions(fleet, out_dir, opts) % orchestration loop -- runs + exports a whole fleet
verify_batch('data/processed/<batch_name>')  % physical-sanity + fault-signature checks
```
See `generate_short_batch.m` / `generate_main_batch.m` for the actual
end-to-end call pattern used to produce a batch.

## Approval gate

Same rule as the root [`CLAUDE.md`](../CLAUDE.md): no `git commit`/`push`/
merge without explicit user confirmation — `.slx` binary diffs are
especially easy to push by accident.
