# simulation/ — MVEM (MATLAB/Simulink)

Physics layer. See root [`CLAUDE.md`](../CLAUDE.md) for the full build plan
and cross-subsystem data flow; this file only covers what's specific to
working in `simulation/`.

## What lives here

| Folder | Holds |
| --- | --- |
| [`model/`](model/) | Simulink plant model (`.slx`) — the engine physics itself. |
| [`scripts/`](scripts/) | MATLAB drivers/export scripts (`.m`) that run the model and write telemetry. |
| [`fault_injection/`](fault_injection/) | Fault ramp definitions (`.json`/`.m`). |
| [`calibration/`](calibration/) | Parameter references — where each model constant came from and how it was validated. |

No `.slx`/`.m` files are committed yet — see each subfolder's README for the
anticipated file layout and entry points.

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

From `simulation/scripts/` in MATLAB (anticipated entry points — confirm
actual filenames once committed):
```matlab
run_mission('<mission_profile_id>')     % single run, returns a timetable
batch_generate('<config>')              % sweep profiles x faults x severities
export_run(run, '../data/raw/')         % write CSV/Parquet, schema column order
plot_run(run)                           % quick-look diagnostics
```

## Approval gate

No `git commit`/`push`/merge without explicit user confirmation this
session — same rule as the root [`CLAUDE.md`](../CLAUDE.md), repeated here
because `.slx` binary diffs are especially easy to push by accident.
