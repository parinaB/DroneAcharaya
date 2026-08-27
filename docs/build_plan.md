# Build Plan

The canonical build plan for DroneAcharaya: what gets built, in what order, and
why that order is forced. This is the plan everyone — human or Claude — should
be working from. See [`ps_mapping.md`](ps_mapping.md) for how it maps back to
the SIH problem statement, [`../data/schema.md`](../data/schema.md) for the
telemetry contract as it exists today, and [`architecture.md`](architecture.md)
/ [`methodology.md`](methodology.md) for the sections this plan will eventually
fill in.

**Status:** planning document. The repo scaffold (`simulation/`, `backend/`,
`ml/`, `frontend/`) predates most of this plan and does not yet implement it —
see [Status vs. this plan](#status-vs-this-plan) at the bottom.

## The five layers

- **Layer 1 — Contract & knowledge.** Four files that are the project's
  constitution: `telemetry-schema.yaml`, `environment-schema.yaml`,
  `parameter-source-table.csv`, `failure-mode-matrix.csv`. Everything
  downstream is built to speak these. They cross-reference — the failure
  matrix names health parameters that must exist in the parameter table and
  signals that must exist in the telemetry schema — so they're built together
  in one pass.
- **Layer 2 — Physics.** The Simulink/Simscape aero-diesel engine, fault
  injection, crank-resolved sidecar.
- **Layer 3 — Digital twin.** Expected-state reference, residual calculation,
  health-parameter estimation.
- **Layer 4 — Intelligence.** Detection, diagnosis, degradation, RUL,
  maintenance advisory.
- **Layer 5 — Integration & presentation.** Bridge, CAN, recorder, replay,
  Grafana, Unreal.

## The build order

**Step 0 — The four constitution files.**
Telemetry schema carries, per field: name, data_type, unit, sample_rate,
source, valid_range, missing_value_policy, quality_flag. Environment schema
defines what the canonical atmosphere service emits. Parameter source table
carries, per parameter: value, unit, source, source_type
(published/literature/calibrated/assumed), confidence, sensitivity, notes —
sensitivity is what tells you which assumptions matter. Failure mode matrix
carries all twelve faults as rows: failure → cause → operating condition where
it appears → first weak signal → correlated signals → prediction →
consequence → action → model tier → health parameter → condition-dependent.

**Step 1 — Canonical environment service.**
One atmosphere calculation (ISA + hot-day offset → ambient T/P → air density),
implemented once, consumed by the engine, the twin's expected model, and
Unreal alike. This exists before the engine because the engine needs its
outputs, and because any mismatch here silently corrupts every residual.

**Step 2 — Healthy mean-value engine core (Simulink, via MATLAB MCP).**
One coherent representative aero-diesel, calibrated against the AE300-class
envelope — not claimed to be an AE300. Built subsystem by subsystem with a
review gate at each: air+turbo → CRDI fuel → combustion → crankshaft (RPM as
an integrated state, `J·dω/dt = T−T_load`) → per-cylinder thermal (CHT/EGT ×4)
→ cooling → lubrication → electrical. Config-driven, fixed-step solver,
outputs mapped to the frozen schema.

**Step 3 — Verification and validation.**
Verification: does the model behave per its own equations. Validation: do
outputs land inside published data across multiple operating points — idle,
low power, cruise, high power, rated — on power, torque, fuel/BSFC,
boost/MAP, EGT. A model that matches one point and fails elsewhere is
nonsense. This is the hard gate; the physics must be right before anything
consumes it.

**Step 4 — Fault injection.**
Health scalars (0–1) degrading the relevant maps, condition-based not random.
Build Tier A first — injector, lubrication, cooling, turbo, sensor drift,
mechanical/vibration — because these are mean-value-injectable and cover the
core demo. Then Tier B — misfire, combustion instability, fuel starvation,
alternator, injection-timing drift, additional sensor modes.

**Step 5 — Crank-resolved sidecar.**
Runs in parallel, never hot-swapped in. Seeded from the mean-value model's
current operating point (RPM, load, wall temperatures) at spin-up — that
handoff is the one state-consistency piece to get right. Produces the
high-frequency signatures for the three faults mean-value physically can't:
misfire, combustion instability, vibration.

**Step 6 — Dataset generation.**
First 100–500 deliberately designed simulations, verified to make physical
sense. Then automated parameter sweeps across altitude, ambient temperature,
load, mission duration, fault severity, and fault onset time — scaling to
thousands only once the small set is confirmed sound. Critically: fly healthy
engines across the full envelope too (altitude, hot weather, high load), so
environment conditions the residual rather than becoming a false fault label.
Store health scalar, fault class, and severity as three separate labels.

**Step 7 — Digital twin (residual + state).**
Runs the validated engine model forward as the live expected reference, fed
by the same canonical environment service. Signal is always measured −
model-expected-at-current-condition. Three detection layers: instantaneous
residual (detection), residual trend (prediction), residual pattern across
channels (diagnosis + sensor-vs-engine discrimination). State-machine-gated
so transients aren't misread as faults. Roadmap note for deployment: a
UKF/EKF state observer replaces the forward reference model in production —
not built now, but the stated evolution path.

**Step 8 — AI/ML + RUL.**
Feature vector is residuals + operating condition (RPM, load, throttle,
altitude, ambient T, air density, engine_state) + trend features —
environment is a conditioning feature, never a label. PCA/CUSUM for
detection, gradient boosting for classification, health-parameter filter for
degradation. RUL defined explicitly as time-until-health-parameter-crosses-a-
stated-failure-criterion, output as a distribution with confidence bands,
validated against injected ground truth.

**Step 9 — Bridge + recorder + replay.**
The anti-corruption layer whose interface was fixed at Step 0. Owns
timestamps, serialization, unit conversion, schema validation, CAN framing,
buffering, recording, replay. Decouples Simulink's fixed clock from
everything else's variable rate. This is the seam where "Simulink engine"
later swaps to "real ECU." Replay re-publishes recorded frames onto the same
bus, so live and replay run identical downstream code.

**Step 10 — Grafana / headless presentation.**
Full operator picture without Unreal: health indices, residual traces, fault
probability, RUL band, telemetry, mission timeline, advisory. The complete
system is demonstrable here.

**Step 11 — Unreal integration.**
Atmosphere scenario input (altitude, weather, temperature offset, wind — fed
into the canonical environment service, which does the actual physics),
mission scripting (the flight profiles driving the four required scenarios),
and GCS visualization (3D UAV, health display, optional telemetry-driven
engine cutaway). Slots in by replacing two things: the environment source
(script → Unreal) and the results sink (Grafana → GCS). Because everything
speaks the contract, this is a clean substitution.

**Step 12 — The demo mission.**
One multi-stage flight: takeoff → climb to 25,000 ft → cruise → loiter →
injector degrades → EGT_3 residual opens up → fuel efficiency and torque
shift → vibration rises → twin reports early injector degradation → fault
probability climbs → RUL estimate → maintenance advisory. Inside the same
mission, a sensor-drift injection the twin correctly dismisses — catching a
real developing fault while rejecting a false alarm, side by side, is what
proves digital-twin-over-threshold.

## The two invariants that hold regardless of anything

1. **Contract-first, connect-last.** The four files and both schemas are
   frozen at Step 0; the engine, twin, and AI are built headless against them;
   Unreal substitutes in at the end. This gives parallel workstreams, trivial
   dataset scaling, a demo that survives an Unreal failure, and a real
   "accepts live ECU data" story.
2. **Physics before consumers.** Nothing that consumes engine behavior — twin,
   AI, dashboard, Unreal — gets built or trusted until Step 3's validation
   gate passes across multiple operating points. The residual architecture is
   only as good as the model generating the expected values.

The four constitution files are the single action that unblocks both the
Simulink build and the residual pipeline at once — that's where to start.

## The dependency graph

Most of the plan is a straight chain, but three dependencies cross the
sequence and are the ones worth watching:

- **Contract files → everything.** Every box speaks the schema. If it isn't
  frozen first, each component invents its own field names and units, and
  integration becomes weeks of translation bugs. This is why Step 0 is Step
  0 — not because it's foundational in the abstract, but because four
  separate people can then build against it in parallel without talking
  constantly.
- **Environment service → engine AND twin AND Unreal (the shared
  dependency).** This is the non-obvious one. The atmosphere calculation
  isn't just an input to the engine — it's an input to three things that must
  all agree. If the engine computes air density one way and the twin's
  expected model computes it another, the residual contains a modeling
  mismatch, not a fault. That's a silent poison bug. So the environment
  service is a shared dependency of engine, twin, and Unreal, which is why
  it's pulled out as its own thing rather than living inside any one of
  them.
- **Engine core → fault injection, crank sidecar, AND the twin.** The engine
  feeds three consumers. Fault injection modifies it, the sidecar is seeded
  from its state, and — critically — the twin runs a second copy of the very
  same validated engine as its expected reference. This is the tightest
  coupling in the whole system: the twin literally cannot exist without the
  engine, because the engine is the twin's definition of "expected." Improve
  the engine, the twin improves for free; ship a wrong engine, the twin's
  expectations are wrong and every residual is garbage.
- **Validation gate (Step 3) gates all consumers.** Nothing downstream is
  trustworthy until the engine validates across multiple operating points.
  Fault injection on an unvalidated engine produces faults layered on
  nonsense. A twin built on an unvalidated engine compares reality against a
  wrong expectation. Dataset generation on an unvalidated engine produces
  thousands of physically-meaningless flights. The gate isn't a checkpoint
  you pass through — it's the thing that makes everything after it mean
  anything.
- **Fault injection + sidecar → dataset generation → AI.** Straight chain:
  you can't generate a training set until faults can be injected, and you
  can't train until the set exists. But note the AI has a second parent — the
  twin. AI consumes residuals (from the twin) computed over data (from
  generation). Two independent parents converging.
- **Bridge → sits between engine and all consumers.** The bridge's interface
  is a Step 0 dependency (everything is built to speak through it), but its
  implementation depends on the engine and consumers existing to connect.
  This split — interface early, implementation late — is why it appears low
  in the graph but is decided at the top.
- **Presentation → bridge + AI.** Grafana and Unreal both display what the AI
  produces, routed through the bridge. Neither has any dependency the other
  lacks — which is exactly why Unreal can substitute for Grafana at the two
  endpoints (environment source, results sink) without touching anything
  upstream.

### The three cross-links that make it a graph, not a line

1. Environment service feeds both engine and twin. Miss this and the residual
   is corrupted at the source.
2. The twin reuses the engine as its expected model. The twin's quality is
   bounded by the engine's — they're not independent components, they're the
   same physics used twice.
3. AI has two parents — twin and dataset. It needs residuals and the labeled
   data those residuals are computed over; both must be sound.

## Status vs. this plan

**Step 0 is drafted.** The four constitution files, plus a
health-parameter registry that ties two of them together, live in
[`../contract/`](../contract/) — see that folder's
[`README.md`](../contract/README.md) for what's still open before they lock:

- [`telemetry-schema.yaml`](../contract/telemetry-schema.yaml)
- [`environment-schema.yaml`](../contract/environment-schema.yaml)
- [`parameter-source-table.csv`](../contract/parameter-source-table.csv)
- [`failure-mode-matrix.csv`](../contract/failure-mode-matrix.csv)
- [`health-parameter-registry.md`](../contract/health-parameter-registry.md) (not called out as one of the "four files" above, but required to keep the parameter table and failure matrix speaking the same health-parameter names)

They're drafts (`schema_version: 0.1-draft`, multiple `TBD` values), not yet
frozen — see [Before these lock](../contract/README.md#before-these-lock).
Note the failure matrix currently carries 15 fault rows, not the twelve named
in this plan's prose; the registry's cross-reference note explains the count.

Everything after Step 0 is still ahead of where the rest of the repo scaffold
is:

- `data/schema.md` (see the root [`README.md`](../README.md)) predates
  `contract/` and defines an older, simpler flat telemetry schema with seven
  fault classes. It should be superseded by `contract/telemetry-schema.yaml`
  once that locks — until then, treat `contract/` as the newer draft and
  `data/schema.md` as what `backend/`/`ml/`/`frontend/` currently actually
  implement.
- `docs/architecture.md`, `docs/methodology.md`, and `docs/ps_mapping.md` are
  still section skeletons ("TBD") — this plan and `contract/` are what should
  fill their Layer 1–4 and dependency sections in.
- The README's three-model ML layer (autoencoder / XGBoost / LSTM) maps onto
  this plan's Layer 4 (detection / diagnosis / RUL) but hasn't been
  reconciled field-for-field with the failure matrix yet.
- No canonical environment service implementation, engine model, crank-resolved
  sidecar, bridge/CAN layer, or Unreal integration exist in the repo yet —
  Steps 1 onward are still ahead, now that Step 0 has a first draft.
