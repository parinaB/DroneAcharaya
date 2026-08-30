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
→ cooling → lubrication → electrical. Config-driven, outputs mapped to the
frozen schema.

*Modeling paradigm — Simulink signal-flow throughout Step 2, Simscape/
Powertrain Blockset reserved for exactly one place:* every subsystem in this
step (air+turbo, CRDI fuel, combustion, crankshaft, per-cylinder thermal,
cooling, lubrication, electrical) is lumped-parameter Simulink signal-flow —
calibrated lookup tables and ODEs (Integrator/Gain), not Simscape's acausal
physical-network blocks. This includes cooling: CHT/coolant/oil are still
real physical states with real time constants (thermal mass receiving
combustion heat, rejecting it onward), just implemented as a heat-balance ODE
rather than a Simscape Fluids pipe/pump/valve network. Two reasons this holds
even for subsystems (like a coolant loop) that *would* suit Simscape's
acausal paradigm in the abstract: (1) most of what's being modeled here is a
*calibrated empirical curve* (a torque map, a boost map, a cooling
effectiveness factor), not something whose fidelity improves by expressing it
as a physical network instead of a lookup table; (2) speed at scale — Step 6
needs thousands of runs, and Simscape's per-timestep solver overhead is a
real cost multiplied across that volume. Simscape/Powertrain Blockset is
reserved entirely for Step 5's crank-resolved sidecar, because crank-angle-
resolved combustion (misfire, combustion instability, and the true
cylinder-to-cylinder torque-ripple vibration signature) is the *one* thing in
this whole model a lumped-parameter approach structurally cannot produce —
confirmed per-fault by `failure-mode-matrix.csv`'s `model_tier` column:
`crank_resolved` appears only on `misfire`, `combustion_instability`, and
`mechanical_vibration`; every other row, cooling included, is `mean_value`.

*Solver mode — resolved, dual-config on the same model, not a single global
setting:* **live/bridge-connected runs** (Step 7's twin running as a second
live copy, Step 9's bridge, Step 11's Unreal feed) need a **fixed-step**
solver — a predictable tick both for the bridge to decouple from ("Simulink's
fixed clock" vs. "everything else's variable rate," see Step 9) and for the
twin's two parallel engine copies to stay tick-aligned so
`residual = measured[t] − expected[t]` is well-defined without interpolation.
Step size should sit comfortably under the schema's fastest required rate
(`rpm`/`torque`/`power`/`engine_load`/`throttle`/`load_demand` at 50 Hz, i.e.
20 ms) — 1–5 ms is the right ballpark for the mean-value core; the
crank-resolved sidecar (Step 5) needs its own, much finer fixed step to
resolve individual combustion events within a 720° cycle, unrelated to this
number. **Offline batch dataset generation (Step 6)** has neither constraint —
no second live process to stay in lockstep with — so it keeps a variable-step
solver for speed/accuracy, and export resamples onto a uniform grid
independent of the solver's internal stepping (see Step 6). Same `.slx`,
different `SimulationInput`/configset per use case — no structural
duplication. The exact live fixed-step number is Step 7/9's call to confirm,
not dataset generation's.

**Step 3 — Verification and validation.**
Verification: does the model behave per its own equations. Validation: do
outputs land inside published data across multiple operating points — idle,
low power, cruise, high power, rated — on power, torque, fuel/BSFC,
boost/MAP, EGT. A model that matches one point and fails elsewhere is
nonsense. This is the hard gate; the physics must be right before anything
consumes it.

*Tool-quirk finding (Step 4, fuel_starvation build) -- full story:* this
build surfaced two distinct, compounding Simulink structural bugs, not one.

1. **Vector-width mismatch.** `MinmaxFuelActual` had `CompiledPortWidths`
   `Inport=[2 1]` instead of the intended `[1 1]`: an unnecessary
   intermediate Mux (`mux_fuelcap`) fed one MinMax port a width-2 vector
   `[commanded, cap]` while the other port separately got `commanded` again
   (width 1). Simulink's implicit scalar broadcasting silently computed
   `[min(commanded,commanded), min(cap,commanded)]`, a 2-element output where
   a scalar was intended. This had been present since the very first build
   of `fuel_starvation` and happened to produce numerically plausible
   results at the points originally tested, purely because MATLAB's
   `.Data(end)` linear indexing on the resulting 2-column timeseries
   coincidentally picked the correct element. Fixed by deleting
   `mux_fuelcap` and wiring both source signals directly into MinMax's two
   scalar ports.
2. **Mux output-port-order instability.** Separately, a Mux block's output
   vector order did not match the order its inputs were wired in (confirmed
   via `LineHandles`) -- port 1 was wired to one signal, but the actual
   output vector had that signal in position 2. This silently inverted a
   division (`u[1]/u[2]` computed the reciprocal of what the wiring
   implied), producing a physically nonsensical runaway (RPM far past
   redline). The index swap (`u[2]/u[1]`) fixed it at the time -- but after
   a later, unrelated edit (deleting `mux_fuelcap` above), the *same* Mux's
   output order flipped back, silently un-fixing the compensated division
   and reproducing the identical runaway. This proved a compensating
   index-swap is not a robust fix: **Mux port-to-vector-index mapping is not
   stable across model edits.**

**Resolution:** replaced the entire `Mux + Fcn(division)` pattern with a
dedicated Simulink `Divide` block (`divide_fuel_deficit_ratio`), which has
fixed, unambiguous physical numerator/denominator input ports (u1/u2) rather
than a vector-index-dependent Mux. Re-validated clean after both fixes:
healthy full-throttle 123.4kW (matches Step 3 baseline), degraded
(health=0.6) full-throttle 77.1kW / fuel pinned at 16.80kg/h (=0.6x28.0
cap), cruise (thr=0.6) identical regardless of health -- all matching the
matrix's discriminator and the numbers seen before either bug was
introduced.

Other asymmetric-operation Fcn blocks built earlier (AFR, work_fraction,
altitude-compensation ratio) were independently cross-checked against
hand-calculated values and are correct -- this was not a universal issue,
but it's real and worth remembering: **for any non-commutative operation
(division, subtraction) fed by a Mux'd multi-input signal, don't use
`Fcn` + `u[N]` indexing at all -- use a dedicated block with fixed physical
ports (`Divide`, `Subtract`) instead.** If a Mux+Fcn pattern must be kept,
verify the actual output vector order with a direct debug tap after *every*
edit that touches that Mux, not just once at build time -- the mapping can
silently change.

*Status: run on `engine_core.slx`.* Five-point throttle sweep (idle-ish/low/
cruise/high/rated) at sea level: RPM, power, torque, fuel flow, rail pressure,
injection timing, CHT, coolant, oil temp, and oil pressure all monotonic and
within TCDS/literature bounds. This caught and fixed a real bug, not a
cosmetic one: EGT's energy split (`exhaust_fraction = 1 - work_fraction -
coolant_fraction`) blew up at low throttle -- work_fraction collapses faster
than fuel-floor-driven heat release, giving idle EGT (911.9C) *higher* than
rated (694.4C) and over the literature ceiling. Fixed by making
exhaust_fraction a literature-anchored constant (matching coolant_fraction's
treatment) with the genuine leftover routed into the oil-heat path instead of
inflating exhaust -- see `parameter-source-table.csv`'s `egt_model_coeff` row.
Altitude sweep (0-5490m, rated throttle): power holds flat to the 3291m
critical altitude then falls off, EGT rises past critical altitude and stays
under its ceiling -- both expected turbocharged-engine behavior. Hot-day
sweep (ISA+0/15/30K, rated throttle): at ISA+30, CHT (233.7C) exceeds the
literature ceiling (180-220C) -- plausibly a genuine operational limit (real
POHs commonly derate power on very hot days for exactly this reason) rather
than a bug, but flagged as an open call rather than silently passed.

**Step 4 — Fault injection.**
Health scalars (0–1) degrading the relevant maps, condition-based not random.
Build Tier A first — injector, lubrication, cooling, turbo, sensor drift,
mechanical/vibration — because these are mean-value-injectable and cover the
core demo. Then Tier B — misfire, combustion instability, fuel starvation,
alternator, injection-timing drift, additional sensor modes.

*Status: Tier A complete (all 6 faults built and validated against
failure-mode-matrix.csv's discriminators). Tier B's mean-value-injectable
faults are also complete: fuel_starvation, alternator_degradation,
injection_timing_drift, and all four remaining sensor-fault modes
(sensor_bias, sensor_noise, sensor_stuck, sensor_dropout — sensor_drift was
built under Tier A). All demonstrated on cht_c3 (bias/noise/stuck, sharing
one Xv/Xs Sum-block infrastructure) except sensor_dropout, which uses
vibration_rms_x instead because cht_c1's declared missing_value_policy in
telemetry-schema.yaml is hold_last — the same mechanism as sensor_stuck — so
demonstrating dropout there would be indistinguishable from stuck; "obey
missing_value_policy" means match each field's own declared policy, not one
universal implementation. Only misfire and combustion_instability remain in
Tier B, both deferred to the Step 5 crank-resolved sidecar per their
model_tier.*

**Step 5 — Crank-resolved sidecar.**
Runs in parallel, never hot-swapped in. Seeded from the mean-value model's
current operating point (RPM, load, wall temperatures) at spin-up — that
handoff is the one state-consistency piece to get right. Produces the
high-frequency signatures for the three faults mean-value physically can't:
misfire, combustion instability, vibration.

*Runs for every mission of every unit, not just units assigned a tier-B/
crank-resolved fault.* Vibration (`vibration_rms_*`, `vibration_order_1x`) is
a required telemetry channel on every mission, healthy units included — a
healthy engine still has baseline cyclical torque ripple, and "abnormal
vibration" only means anything as a deviation from that baseline. So the
sidecar always runs, fed the *same* θ values as the mean-value core for that
unit at that moment (nominal/healthy for units not assigned `misfire`,
`combustion_instability`, or `mechanical_vibration`; genuinely degrading, per
that unit's onset/rate draw, for units that are) — one consistent θ driving
both models, never two independently-set values that could drift apart.

*Status: in progress.* New standalone model `simulation/model/crank_resolved_sidecar.slx`.
Architecture: Simscape Driveline (`fl_lib/Rotational`, the "AB" — across-based
— foundation library) for the crank/flywheel rotational network (real
inertia + viscous friction damper + torque actuators), driven by per-cylinder
combustion torque computed in a MATLAB Function block per cylinder — a
standard single-zone Wiebe combustion model (Heywood-style: Wiebe mass-
fraction-burned drives a crank-angle-domain cylinder-pressure ODE,
`dP/dphi = -gamma*P/V*dV/dphi + (gamma-1)/V*dQ/dphi`, through real slider-
crank kinematics for volume and torque) rather than a synthesized waveform,
so the resulting torque ripple has genuine physically-grounded harmonic
content. Runs short, high-crank-resolution windows (fixed-step, `Ts=2e-5s`)
seeded at a quasi-steady mean-value operating point, not a full mission —
crank-angle-domain simulation at the needed resolution is not meant to run
for mission-length durations.

Cylinder 1 is built and validated: peak cylinder pressure ~150 bar, IMEP
~21.6 bar, mean indicated torque ~85.6 Nm at the rated operating point — all
realistic for a highly-boosted CRDI diesel. Cross-check: scaling released
heat by `(1 - CoolantHeatFraction)` (i.e., treating the already-established
28% coolant-heat-fraction as the in-cylinder wall-heat-transfer loss this
simplified adiabatic-core model would otherwise omit) makes the implied
friction fraction come out to 11.2% of brake torque — essentially matching
`FrictionCoeff_Nm_per_rpm`'s own independently-derived 12% FMEP assumption
from the mean-value core. Two unrelated parts of the model agreeing this
closely is a good sign they're physically consistent with each other, not
just each independently plausible.

**Simscape quirk found (real, worth remembering):** `fl_lib/Rotational/
Elements/Inertia (AB)` with `visible_ports=BF` (both B and F ports wired,
which looked like the obvious "housing + free shaft" pattern for a torque-
driven spinning mass) turns out to RIGIDLY COUPLE B and F — connecting B to
a `Rotational World (AB)` reference then pins F to zero too, no matter what
torque is applied or what initial velocity is specified on `w`. Confirmed by
building a minimal 4-block throwaway test model (`sctest`, discarded) that
reproduced the exact same symptom (Simscape's own signal log showed the
actuator applying its commanded torque correctly, but the inertia's own
logged torque and velocity stayed at exactly zero throughout). Fixed by
setting `visible_ports=F` (single free port, no explicit ground on the other
side) — an `Inertia (AB)` block is a one-port energy-storage element, not a
two-port through element like a damper or torque actuator; only connect
both ports if you specifically want a rigid link between them. Damper,
Torque Actuator, and Motion Sensor blocks are genuinely 2-port (B=ground,
F=shared spinning node) and do NOT have this issue.

Also needed: a MATLAB Function block using `persistent` state (as the
per-cylinder combustion model does, to integrate cylinder pressure across
time steps) must have its sample time set explicitly via the block's
`SystemSampleTime` parameter (NOT the inner Stateflow chart's `SampleTime`
property, which silently no-ops) — otherwise it inherits a continuous
sample time from the Simscape network and errors at compile time
("uses constructs that are invalid when the block specifies or inherits a
continuous sample time").

**Update — cylinders 2-4, load torque, misfire, and combustion_instability
are now built and validated.** Each cylinder is an independent copy of the
same MATLAB Function (own `persistent` state, phased via `FiringOrder`:
`[cyl1,cyl2,cyl3,cyl4] -> phase offsets [0, 3pi, pi, 2pi]` rad, i.e. cyl1
fires at global phase 0, then cyl3 at 180deg, cyl4 at 360deg, cyl2 at
540deg, matching the `1-3-4-2` firing order 180 crank-degrees apart). All
four show consistent pressure/torque ranges (~150 bar peak, -519 to ~1590
Nm) at the seeded rated operating point. The propeller-side load torque
replicates `engine_core`'s own reflected-through-the-gearbox formula exactly
(`load_torque_crank = -PropLoadCoeff*(crank_rpm/GearboxRatio)^2/GearboxRatio`)
so the sidecar's equilibrium physics matches the mean-value core's, not an
independently-invented load model.

Misfire and combustion_instability are both implemented INSIDE each
cylinder's MATLAB Function (not as external per-cycle signal generators),
latched once per cycle at the cycle-start crank event: `misfire_rate` (0-1,
healthy=0) drives a Bernoulli trial (`rand() < misfire_rate`) zeroing that
cycle's heat release entirely; `combustion_stability` (0=stable, healthy=0)
drives a per-cycle Gaussian heat-release-magnitude multiplier
(`1 + combustion_stability*0.3*randn()`, floored at 0). Both validated:
healthy baseline reproduces the pre-fault numbers exactly (0 misfire events,
per-cycle peak-pressure COV=0.5%, essentially flat); `misfire_rate=0.5` on
cylinder 1 produced real misfire events with a markedly reduced (not zero —
physically correct, since the compressed-but-unignited charge still
produces a genuine blow-down torque pulse just far smaller than a firing
cycle) torque contribution during the misfired cycle; `combustion_stability
=0.8` raised per-cycle peak-pressure COV to 16.6% (vs. 0.5% healthy) — a
clear, correctly-directioned instability signature. The `misfired` output
(0/1, held per cycle) is exposed per cylinder specifically so a later
integration layer can feed it into `engine_core`'s existing per-cylinder EGT
model the same way `injector_health` already does (a misfire is functionally
a one-cycle `injector_health=0` event) — the sidecar's own job stays limited
to torque/pressure/vibration signatures, not re-deriving a second EGT model.

**Update — IMEP-COV accumulator and vibration order-tracking are now built
and validated; Step 5's core fault set is complete.**

IMEP-COV: each cylinder's MATLAB Function now accumulates `work_J += P*dV`
every step while `in_closed`, latching a proper `IMEP = work/Vd` at each
cycle boundary (superseding the peak-pressure proxy used for the earlier
validation checkpoint). A downstream MATLAB Function (`FcnImepCov1`, tapped
off cylinder 1) keeps a 10-cycle rolling buffer and reports `std/mean` each
time a new cycle's IMEP arrives. Verified: healthy baseline COV=0.44% (IMEP
itself a stable ~20.7-21.4 bar, matching the earlier single-cylinder
reference), `combustion_stability=0.8` raises it to 25.4% — a large, clearly
correctly-directioned jump, and a materially more rigorous number than the
peak-pressure-proxy's 16.6% from the earlier checkpoint.

Vibration: a new `FcnVibration` block computes angular acceleration
(`diff(omega)/Ts`) from the Simscape-sensed shaft speed and order-tracks it
via synchronous demodulation against the TRUE mechanical shaft angle
(`mod(theta_global, 2*pi)` — deliberately NOT the 4*pi-periodic combustion-
cycle angle, since order convention is defined relative to shaft rotation),
updating `vibration_rms_x`, `vibration_order_1x`, and `vibration_order_2x`
once per completed engine cycle (wraparound-edge-triggered, not a fixed
angle threshold, since a fixed threshold can be stepped over entirely at
this sample rate). Cross-validated against an independent offline
uniform-angle-resampled DFT computed directly from the logged omega trace
(order_2x: 4073 online vs. 4091 offline; order_1x: 0.7 vs. 4.8 — both
near-zero as expected) — confirms the online algorithm is correct, not
coincidentally plausible. Healthy baseline is strongly order-2-dominated
(~4073 rad/s^2, the expected once-per-180-crank-degree combustion-firing
signature for a 4-cylinder engine) with near-zero order-1 (no true
mechanical imbalance modeled in this sidecar — that stays the mean-value
proxy's domain from Step 4). Injecting `misfire_rate=0.3` on cylinder 1
raised order_1x from 0.7 to 12.3 (~18x) — physically sensible: a single
cylinder misfiring breaks the engine's even once-per-180-degree firing
symmetry, which shows up as new once-per-cycle (order-1) content riding on
top of the still-dominant order-2 combustion signature, exactly the kind of
discriminator a real health-monitoring twin would look for.

Step 5's crank-resolved fault set (misfire, combustion_instability, and a
genuine crank-resolved vibration signature) is now built and validated.
Not yet done, and left for a later integration pass rather than blocking
here: wiring the sidecar's per-cylinder `misfired` output into
`engine_core`'s existing per-cylinder EGT model (the way `injector_health`
already works), and the actual mean-value-to-sidecar operating-point handoff
automation (currently the seed values — `RatedRPM_crank`, `P_intake_bar`,
`fuel_flow_kg_h` — are set by hand for a given validation run, not read live
from an `engine_core` snapshot).

**Step 6 — Dataset generation.**
First 100–500 deliberately designed simulations, verified to make physical
sense. Then automated parameter sweeps, scaling to thousands only once the
small set is confirmed sound. Critically: fly healthy engines across the full
envelope too (altitude, hot weather, high load), so environment conditions
the residual rather than becoming a false fault label. Store health scalar,
fault class, and severity as three separate labels (plus the full
ground-truth trajectory per `ground-truth-schema.yaml`, not just an endpoint
value — see that file).

Methodology follows Chao, Kulkarni, Goebel & Fink 2021 (N-CMAPSS) structurally
— its trajectory shape, not its turbofan physics. Per-trajectory schema:
**W** (scenario descriptors — altitude, ambient P/T, throttle, airspeed,
engine_state, driven by full mission profiles, not isolated setpoints),
**Xs** (measured/noisy sensors — what `telemetry-schema.yaml` carries, post
sensor-fault-injection), **Xv** (virtual/ground-truth sensors — pre-corruption,
per `ground-truth-schema.yaml`), **θ** (health parameters, staged
healthy-hold → gradual → accelerated rather than one decay curve), **RUL**
(capped before normalizing).

*Unit is the primary structure, not "one cross-cell = one trajectory."* A unit
= one assigned physical fault mode (including healthy) + one onset-time/
degradation-rate draw (θ is a function of accumulated engine hours, not a
fixed severity) + one assigned mission shape (a unit is "a long-loiter
airframe" for its whole life — one shape per unit, not mixed, matching the
N-CMAPSS precedent; mixed-shape lifetimes are a later enhancement, not V1) +
an independent sensor-fault draw (type/onset per corruptible channel, drawn
independently of both physical fault and shape, so the model can't learn a
spurious shape↔fault or fault↔sensor-fault correlation) + a manufacturing-
tolerance seed. A unit flies many missions across its life (each mission one
instance of its assigned shape, continuous parameters LHS-drawn per mission —
weather, phase durations/loiter length, throttle jitter as a smooth OU/AR(1)
process, not i.i.d. noise). Budget: ~9 physical-fault classes (8 tier-A/B
classes + healthy) × ~5 onset/rate draws × ~5–8 seed replicates ≈ 225–360
units × ~20–50 missions each — tractable, vs. treating shape×fault×severity
combinations as independent short trajectories (≈thousands of runs for the
same coverage, an earlier estimate this design corrects). Healthy units skip
the onset/rate draw (no fault to onset) — just the seed replicates.

Five mission shapes (don't exceed this — more shapes fragments the parameter
space into thinner strata than continuous LHS sampling within a shape would
already cover): short patrol, long loiter (primary shape for slow degradation
signatures — CHT/oil-pressure creep needs sustained steady-state), high-altitude
transit (turbo/boost/cold-intake behavior), hot-day ground ops (cooling-margin
stress), high-throttle/climb-heavy (peak-torque/RPM fault signatures, e.g. ring
wear affecting peak power — needs its own **scripted** 0→100% throttle-slam
event, not left to incidental jitter, since rapid throttle transients are a
named required test case). Every mission — not just the unit's first — is
bookended with a real STARTING ramp and SHUTDOWN ramp, engine returning to
OFF/idle between missions; only the very first mission of a unit's life needs
special cold-start initial-condition handling, every later mission inherits
state from its own prior shutdown.

*The sidecar must genuinely run during generation, not just be tagged for.*
Per Step 5: every mission of every unit invokes the crank-resolved sidecar
(seeded from the mean-value core's live operating point at that mission's
start), feeding it the same θ values driving the mean-value core. Skipping
this for units not assigned a tier-B fault — e.g. approximating their
vibration channel from the mean-value core alone — would make
`failure-mode-matrix.csv`'s `crank_resolved` tag meaningless at the one point
it's supposed to matter: real exported data. The dataset-generation script is
where this either actually happens or silently doesn't; verify it explicitly,
don't assume it from the architecture description alone.

Multi-rate export, not one shared sample rate: slow channels (RPM, CHT/EGT,
pressures, fuel flow, electrical, injection timing) at ~1–10 Hz is plenty;
vibration needs FFT-reduced spectral features (per `telemetry-schema.yaml`'s
`vibration_rms_*`/`vibration_order_1x` — raw kHz waveform never rides the
contract) computed at the slow-channel timestep so every head's input stays
time-aligned. Use Latin Hypercube Sampling over each shape's continuous
parameter space, not plain uniform random draws, for the same coverage with
far fewer runs.

*Status: in progress, building incrementally.* New `simulation/scripts/`
files: `generate_mission_profile.m` (mission-shape breakpoint generator;
only `long_loiter` implemented so far) and `run_single_mission.m` (driver +
sanity check). `engine_core.slx`'s three scalar mission inputs
(`ConstAltitude`, `ConstIsatempoffset`, `StepThrottle`) were replaced with
`From Workspace` blocks (`MissionAltitude`/`MissionIsaOffset`/
`MissionThrottle`, each a `[time_s, value]` breakpoint matrix set from the
generator) so a full scripted mission can drive the model, not just a single
constant setpoint — this was a structural change to the model itself, not
just new script files.

**Finding: engine_core has no cranking/starter-motor torque model, so a
slow throttle ramp from zero stalls the engine before it ever reaches a
self-sustaining throttle level.** At constant throttle=0.12, RPM decays
from the 800rpm idle initial condition to a lower ~776rpm equilibrium (not
zero) over several minutes — a stable but off-target idle. But ramping
throttle from 0.0 up to 0.12 over 30s (an earlier, more "realistic-looking"
first attempt at a start ramp) crashes RPM to exactly zero within ~30s and
it never recovers, because torque at very low throttle can't overcome
friction and nothing in the model provides external cranking torque to get
through that regime. Bisected the actual sustaining threshold: throttle
must be >=~0.13 to hold at/above the 800rpm idle IC. Fixed by making the
mission profile's start ramp deliberately FAST (throttle 0->0.14 over 3s,
standing in for the unmodeled crank event) rather than a slow climb from
zero, then idling at 0.14 (not a lower value) before the climb phase. First
full `long_loiter` mission (87 min: start, idle, climb, transit, 70-min
loiter, descent, idle, shutdown) now runs cleanly end-to-end: RPM/power/CHT
all move sensibly through every phase (idle ~900rpm/2.2kW, climb
~3531rpm/94.2kW/CHT 40C, loiter settling ~2479rpm/34.4kW/CHT 64C after the
70-min soak, clean shutdown to 0), no NaNs, max CHT 77.9C comfortably inside
the Step-3-validated envelope. `alt_power_out` is ALTERNATOR power (0-2kW
range) — a naming trap for anyone computing engine power from logged
signals; use `torque_out .* rpm_out * 2*pi/60/1000` instead, there is no
dedicated total-engine-power channel in the current sim output.

**Update — the sidecar invocation bridge is built and validated.** New
`simulation/scripts/run_sidecar_burst.m`: takes a seed operating point (rpm,
fuel_flow_kg_h, map_kpa, injection_timing_deg, misfire_rate, combustion_
stability), sets `crank_resolved_sidecar`'s inputs and initial shaft speed
from it, and runs a burst. Design decision: invoked ONCE PER MISSION PHASE
(idle/climb/loiter/descent), not once per mission and not continuously —
build_plan.md's own text ("seeded from the mean-value core's live operating
point at that mission's start") is ambiguous between a single mission-start
burst and continuous tracking; a single burst can't populate a whole
mission's 10Hz vibration channel, and continuous crank-resolution simulation
for a full mission is exactly what Step 5 said the sidecar is NOT for. Per-
phase bursts are the resolution: "runs for every mission" stays true (it
genuinely runs, multiple times), each burst's feature set is held constant
for that phase's duration in the export — a deliberate, documented
simplification, not a silent shortcut.

Burst duration is RPM-adaptive (>= 15 engine cycles: enough for the IMEP-COV
block's 10-cycle window plus warm-up margin), not a fixed wall-clock value —
a fixed short duration would starve the COV window at low RPM (idle's cycle
time is ~4x climb's). Verified end-to-end on the `long_loiter` mission:
vibration_rms and order_2x scale sensibly with RPM/power across all four
phases (idle 900rpm -> 1158 rad/s^2, climb 3531rpm -> 3169 rad/s^2), order_1x
stays near-zero throughout (healthy, no imbalance/misfire injected), IMEP-COV
stays small (~0.0001-0.003, healthy) — matches the Step 5 validation
checkpoint's numbers at the equivalent operating points. Cost note: each
burst is real wall-clock work (~4-15s depending on RPM, since lower RPM
means a longer real-time burst window at the same fixed Ts=2e-5s step) — at
4 bursts/mission this roughly doubles Step 6's earlier compute-time estimate
for the full sweep; worth revisiting with parallelization once the full
pipeline exists, not a blocker now.

**Update — the schema-compliant exporter is built and validated end-to-end.**
New `simulation/scripts/export_mission_to_schema.m`: resamples engine_core's
output plus the per-phase sidecar features onto a common export grid and
assembles the two files `telemetry-schema.yaml` and `ground-truth-schema.yaml`
specify. Design decisions:

- **One common export rate (default 1Hz), not true per-field native rates.**
  The schema lists 1-50Hz per field, but nothing here needs 50Hz resolution
  for degradation/RUL work, a single flat table is what Parquet naturally
  wants, and the sidecar's own vibration features only update once per
  mission PHASE anyway (far coarser than any per-field native rate) — so a
  single shared rate is the honest ceiling, not an arbitrary shortcut.
- **`engine_state` comes from the mission profile's own phase breakpoints**
  (added to `generate_mission_profile.m` as `profile.phases`), not re-derived
  from signal thresholds elsewhere — one source of truth, can't drift.
- **`engine_load` is a placeholder equal to `throttle`** — no separate
  load/torque-demand signal exists in `engine_core` yet, and fabricating one
  disconnected from the actual physics would be dishonest; noted in the
  function header rather than silently substituted.
- **Only `cht_c3` has a real Xv/Xs split** (engine_core's existing
  sensor_drift/bias/noise/stuck build) — every other channel's Xs equals its
  Xv until more sensor-fault taps get built onto other channels.
- **Fixed a real schema gap while wiring this up:** `ground-truth-schema.yaml`
  listed a single shared `misfire_rate` column, but the actual Step 5 sidecar
  implements independent per-cylinder Bernoulli draws (a real per-cylinder
  fault, same pattern as `injector_health`). Corrected the schema to
  `misfire_rate_c1..c4` rather than quietly collapsing to a value that
  doesn't match what's actually simulated.

Verified: one full `long_loiter` mission (healthy unit) exported cleanly to
`data/raw/run_00001.parquet` (5221 rows, all 36 telemetry columns) +
`run_00001_groundtruth.parquet` (45 columns) + `run_00001.meta.json`,
following `data/raw/README.md`'s existing storage convention. Spot-checked:
`engine_state` correctly transitions through all 8 phases in order,
`throttle`/`rpm` move together sensibly through the STARTING ramp,
`injector_health_c1`/`misfire_rate_c1`/`sensor_fault_active_cht_c3` all show
the expected healthy/NONE defaults, and vibration/IMEP-COV columns are
honestly `NaN` (not fabricated) outside the four phases the sidecar actually
covers (e.g. during STARTING).

**Update — all five mission shapes are now implemented and validated.**
`generate_mission_profile.m` gained `short_patrol` (lower altitude, ~15-min
station time, shorter than `long_loiter`'s 70 min), `high_altitude_transit`
(climbs to 7600m/~25,000ft — the same ceiling the eventual Step 12 demo
mission uses — specifically to exercise the turbo altitude-compensation
headroom from Step 2/4, using the schema's `HIGH_ALTITUDE_CRUISE` state, not
plain `CRUISE`), `hot_day_ground_ops` (ISA+30C, altitude never changes, no
CLIMB/CRUISE/LOITER phase at all — ground idle + a scripted run-up, the
closest honest `engine_state` is `IDLE` throughout since no dedicated
ground-run-up enum value exists), and `high_throttle_climb_heavy` (a genuine
scripted 0.14->0.98 throttle SLAM over 2 seconds, using `THROTTLE_TRANSIENT`,
not incidental jitter — a named required test case per the plan).

Refactored the exporter/profile interface while doing this: `profile.
sidecar_seed_spans` (explicit `[start_s,end_s]` per phase-feature field) was
added so `export_mission_to_schema.m` no longer hardcodes phase-table row
indices to paint sidecar features across a time span — that hardcoding was
tied to `long_loiter`'s specific phase layout and would have silently
mis-painted spans for any shape with a different phase structure.

Verified `high_throttle_climb_heavy` end-to-end: the slam takes RPM from
900.6 to 3840.4 (119.9kW, near the 123.5kW rating) in about 2.5 seconds with
no stall, no NaN, and no redline overshoot (max 3840 vs. 4220 redline);
`THROTTLE_TRANSIENT` correctly appears for exactly the 2 rows spanning the
scripted slam. Verified `hot_day_ground_ops` separately: CHT/coolant climb
from a 15C start to ~69/56C by the end of the ISA+30 ground-ops sequence
with no altitude change and no NaN — a real cooling-margin stress signature,
not a flat idle trace.

**Update — LHS sampling and OU throttle jitter are built and validated.**
New `simulation/scripts/simple_lhs.m` (no Statistics and Machine Learning
Toolbox on this install, so a standard stratified-permutation LHS
construction is implemented directly rather than calling `lhsdesign`) and
`sample_mission_params.m` (per-shape dimension lists mapping LHS's (0,1)
values to physical ranges — altitude, phase durations, throttle levels,
jitter sigma, weather ISA offset). `generate_mission_profile.m` gained a
universal post-processing pass: a per-mission weather ISA-offset shift, and
throttle jitter as a discrete-time-exact Ornstein-Uhlenbeck process (zero
mean, stationary std = sigma, correlation time = tau) — genuinely smooth and
mean-reverting, not i.i.d. noise, per the plan's own explicit requirement.
Verified 5 LHS-sampled `long_loiter` missions cover the parameter space well
in just 5 draws (altitude spanned 2471-4422m, well distributed, not
clustered — the actual point of stratified sampling over plain random draws).

**Finding: applying jitter uniformly across the whole mission tipped an
already-marginal idle/start-ramp region into a real stall.** First jittered
test run: RPM decayed from the 800rpm IC to zero during the fast start ramp
and idle warm-up and never recovered, even though the jitter itself pushed
throttle back up above 0.13 multiple times afterward -- once RPM truly
hits zero, per the earlier cranking-torque finding, nothing brings it back.
Root cause: the scripted start ramp is ALREADY only barely-sufficient
(engine_core has no starter-motor torque model), so even small (~0.03 std)
throttle perturbations during that specific few-second window are enough to
tip it over. Fixed by zeroing jitter wherever the mission's NOMINAL
(commanded, pre-jitter) throttle is below 0.3 -- i.e. jitter only applies
during genuine in-flight/hold segments (climb/cruise/loiter/descent), never
during the scripted start ramp, idle warm-up, or shutdown ramp. This is
physically motivated, not just a numerical patch: a real autopilot wouldn't
inject throttle-hold noise during a scripted start/shutdown sequence either.
Re-verified after the fix: same LHS draw now reaches idle cleanly (900.6rpm
at t=90) and climbs normally, with jitter still genuinely present during
loiter (throttle std ~0.055 during the loiter segment, not flattened to zero).

**Update — the per-unit generator and orchestration loop are built and
validated end-to-end; Step 6's pipeline is functionally complete.** New
`fault_class_registry.m` (table-driven map from each of the 10 physical
fault classes -- not build_plan's early "~8" estimate, which predates Step
5's actual misfire/combustion_instability implementation -- to its Eng.*
field or sidecar parameter, convention, and per-cylinder flag),
`compute_health_trajectory.m` (the staged healthy-hold -> gradual ->
accelerated curve, 30%/70% damage split between the two phases),
`generate_fleet.m` (produces the full unit list: fault class x onset/rate
draws x seed replicates, each unit also getting an assigned mission shape,
an independent sensor-fault draw, and a manufacturing-tolerance seed),
`apply_manufacturing_tolerance.m` (small unit-to-unit build variance on
crank inertia/friction), and `run_fleet_missions.m` (the orchestration loop).

**No Parallel Computing Toolbox on this install -- the loop is sequential,
not parfor.** This is a real cost (see the earlier compute-time note),
not a stylistic choice; revisit if the toolbox becomes available.
Checkpointed instead: completed run_ids append to `completed.log` so an
interrupted batch resumes without re-simulating finished missions, and
per-mission failures are caught, logged to `errors.log`, and skipped rather
than aborting the whole batch (accumulated_hours still advances using the
intended duration so one bad mission doesn't throw off a unit's later ones).

Verified with two runs: (1) 6 consecutive healthy `long_loiter` missions for
one unit completed cleanly (~51s/mission); (2) a targeted 5-mission
`injector_degradation` unit (onset=0.3h, gradual_span=1.0h, accel_span=0.5h,
affected cylinder 3) showed EXACTLY the intended staged curve --
injector_health_c3 = 1.000 (mission 1, pre-onset) -> 0.957 -> 0.827 -> 0.725
-> 0.248 (mission 5, deep in the accelerated phase) -- and, critically, that
staged value actually reached the physics: mission 5's mid-loiter telemetry
shows cylinder 3's EGT collapsed to 174.0C while siblings sit at 571.1C
(healthy mission 1: all four cylinders at 518.1C), the exact single-cylinder
discriminator from `failure-mode-matrix.csv`, reproduced through the FULL
chain (unit's accumulated hours -> theta -> Eng.InjectorHealth_c3_init ->
engine_core -> exported telemetry) rather than just checked at the fault-
injection-block level like the original Step 4 validation did.

Step 6 is functionally complete: mission shapes, LHS sampling + OU jitter,
per-unit staged θ trajectories, independent sensor-fault draws, the sidecar
bridge, and schema export all work together correctly. What's left is
scale, not correctness: actually running the first 100-500-mission sanity
batch (build_plan's own recommended phased approach) and, after that,
deciding how far to scale the full sweep given the no-parfor constraint.

**Update — automated verification (`simulation/scripts/verify_batch.m`)
found and fixed a real bug before any mass production.** The check verifies
data integrity, physical bounds (anchored to the published EASA TCDS limits
already in `parameter-source-table.csv`), cross-signal consistency, and —
the one that actually matters — whether each mission's assigned fault_class
shows the SPECIFIC discriminator `failure-mode-matrix.csv` defines, scaling
with its θ severity, with `healthy` missions showing none of them. First run
against `sanity_batch_001` found `mechanical_vibration` completely invisible
in the data: `bearing_health` had only ever been wired into `engine_core`'s
Step 4 mean-value proxy, never into the Step 5 crank-resolved sidecar, and
`export_mission_to_schema.m` was discarding that proxy entirely in favor of
sidecar-only vibration columns (which only reflect `misfire`/
`combustion_instability`). Fixed by exporting the mean-value proxy as its
own pair of columns (`vibration_rms_x_bearing_proxy`, `vibration_order_1x_
bearing_proxy`, continuous for the whole mission, not phase-limited like the
sidecar columns) rather than conflating two physically distinct signals into
one. Re-verified clean: 0 FAIL, 0 WARN across all 22 missions after
regenerating the batch with the fix. See `data/README.md`'s "Verifying a
batch" section for the full check list and how to run it against any batch.

**Step 7 — Digital twin (residual + state).**
Runs the validated engine model forward as the live expected reference, fed
by the same canonical environment service. Signal is always measured −
model-expected-at-current-condition. Three detection layers: instantaneous
residual (detection), residual trend (prediction), residual pattern across
channels (diagnosis + sensor-vs-engine discrimination). State-machine-gated
so transients aren't misread as faults. Roadmap note for deployment: a
UKF/EKF state observer replaces the forward reference model in production —
not built now, but the stated evolution path.

**Update — the "expected reference" is data-driven, not a live re-run of
`engine_core.slx`, a deliberate departure from this section's original
wording.** `ml/features/feature_engineering.py`'s `physics_residuals()`
stub already committed to a single-DataFrame-in, residual-DataFrame-out
signature meant to serve identically "offline training and online
inference" — a live Simulink round-trip per inference call doesn't fit that
contract, and now that `main_batch_1000` exists there's enough genuinely
healthy data to fit expected-value relationships directly: 269 missions are
fully healthy end-to-end (not just the dedicated `healthy` fault class —
every other fault class's pre-onset missions count too, and dominate the
269), spread across all 5 mission shapes. `ml/features/fit_digital_twin.py`
fits one `HistGradientBoostingRegressor` per target channel (24 channels:
torque/power, per-cylinder CHT/EGT, oil/coolant, fuel system, turbo/intake,
vibration + bearing proxies, electrical) against operating condition
(rpm, throttle, altitude, ambient_temperature, air_density), training only
on the 259 healthy train-split runs and holding out 10 for eval metrics.
`physics_residuals()` loads these (cached) and gates rows in a genuine
transient (`STARTING`/`SHUTDOWN`/`THROTTLE_TRANSIENT`) to NaN rather than
computing a residual against a regime the models were never fit on — the
state-machine-gating this section already called for.

Verified end-to-end on `UNIT-mechanicalvibration-0052`: `M001` (bearing_health
= 1.0, fully healthy) gives `vibration_rms_x_bearing_proxy_residual` ≈ 0
(machine epsilon, no false alarm); `M009` (bearing_health = 0.5, deep into
onset) gives the same residual at mean 0.152 (range 0.0008–0.204) — the twin
cleanly discriminates the fault using the exact discriminator Step 6's
`verify_batch.m` fix established, purely from operating-condition regression,
no second Simulink instance involved. The UKF/EKF-in-production roadmap note
above is unaffected by this — still the stated evolution path, not built now.

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
health-parameter registry that ties two of them together, plus the
ground-truth schema added alongside this Step 6 design pass, live in
[`../contract/`](../contract/) — see that folder's
[`README.md`](../contract/README.md) for what's still open before they lock:

- [`telemetry-schema.yaml`](../contract/telemetry-schema.yaml)
- [`environment-schema.yaml`](../contract/environment-schema.yaml)
- [`parameter-source-table.csv`](../contract/parameter-source-table.csv)
- [`failure-mode-matrix.csv`](../contract/failure-mode-matrix.csv)
- [`health-parameter-registry.md`](../contract/health-parameter-registry.md) (not called out as one of the "four files" above, but required to keep the parameter table and failure matrix speaking the same health-parameter names)
- [`ground-truth-schema.yaml`](../contract/ground-truth-schema.yaml) (also not
  one of the original "four" — the simulation-only companion to the telemetry
  schema; see its header for why ground truth can't live in the telemetry
  schema itself)

They're drafts (`schema_version: 0.1-draft`, multiple `TBD` values), not yet
frozen — see [Before these lock](../contract/README.md#before-these-lock).
Note the failure matrix currently carries 15 fault rows, not the twelve named
in this plan's prose; the registry's cross-reference note explains the count.

**Steps 1-6 are built and validated.** The canonical environment service
(`simulation/model/environment_service.slx`), the mean-value engine core
(`simulation/model/engine_core.slx`), the crank-resolved sidecar
(`simulation/model/crank_resolved_sidecar.slx`), and the full Step 6 dataset
pipeline (`simulation/scripts/`) all exist and have been exercised at scale:
`data/processed/main_batch_1000/` is 123 units / 1111 missions across all 11
fault classes (healthy + 10), `verify_batch.m`-clean (0 FAIL, 0 WARN). See
this section's Step 6 log above for the two real engine bugs that surfaced
and were fixed getting there. **Step 7 has a first working slice**:
`ml/features/fit_digital_twin.py` + `feature_engineering.py`'s
`physics_residuals()` (data-driven expected-value models, transient-gated,
verified to discriminate a real fault — see the Step 7 log above). **Step 8
onward (the three trained models, bridge, Grafana/Unreal) has not been
started** — that's where the actual gap is now, not the physics layer.

Everything after Step 7 is still ahead of where the rest of the repo scaffold
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
  this plan's Layer 4 (detection / diagnosis / RUL) but hasn't been trained
  yet, nor reconciled field-for-field with the failure matrix.
- No bridge/CAN layer, Grafana dashboard, or Unreal integration exist in the
  repo yet — Steps 8 onward are still ahead.
