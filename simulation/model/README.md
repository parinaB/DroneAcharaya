# simulation/model/

The Simulink plant model of the MALE UAV piston engine — the "digital twin core".

**Purpose.** Represent the engine as coupled thermal, mechanical and fuel-system
subsystems so that a mission profile in produces physically consistent telemetry
out (RPM, CHT, EGT, oil pressure/temperature, fuel flow, vibration, battery
voltage, injection timing).

**Expected file types**
- `*.slx` — Simulink models. One top-level model (`male_uav_engine.slx`) plus
  referenced subsystem models where the top level gets unwieldy.
- `*.slxc` / `slprj/` — build caches. Generated, not committed.
- `*.mat` — saved operating points or bus definitions. Gitignored.

**Conventions**
- Signals leaving the model use the exact column names in `data/schema.md`.
- Fixed-step solver, sample rate documented in the model description block, so
  exported runs align with the ingestion cadence.
- Subsystem boundaries: intake/fuel, combustion/thermal, rotating assembly,
  lubrication, electrical.
