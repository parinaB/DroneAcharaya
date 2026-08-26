# simulation/fault_injection/

Definitions of the degradation and fault scenarios injected into the plant model.

**Purpose.** Produce labelled failure data — each scenario states what degrades,
how fast, from when, and to what severity, giving the ML layer its `fault_type`,
`fault_onset`, `severity` and `time_to_failure` ground truth.

**Expected file types**
- `*.json` — declarative fault ramp definitions (preferred; readable and
  diffable). One file per fault class, or one catalogue file.
- `*.m` — MATLAB functions for ramps that need logic a JSON ramp cannot express
  (state-dependent onset, intermittent faults).

**Ramp definition shape** (indicative, to be finalised):
```json
{
  "fault_type": "injector_clog",
  "target_parameter": "injector_flow_coeff",
  "onset_s": 900,
  "profile": "linear",
  "end_severity": 0.6,
  "duration_s": 1800,
  "failure_threshold": 0.85
}
```

**Fault classes planned**
`injector_clog`, `bearing_wear`, `oil_starvation`, `cylinder_head_overheat`,
`sensor_drift`, `ignition_misfire`.

**Conventions**
- Severity is normalised 0–1; `time_to_failure` is derived from when the ramp
  crosses `failure_threshold`.
- `fault_type` strings match `data/schema.md` and `frontend/lib/types.ts` exactly.
