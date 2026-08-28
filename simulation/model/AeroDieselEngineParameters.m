% AeroDieselEngineParameters.m
% Single source of truth for the aero-diesel engine model.
%
% REVISION: this file previously targeted an ad hoc ~149kW/200HP spec.
% Superseded -- now anchored to the real AE300 (Austro Engine E4), per
% EASA TCDS E.200 Issue 12 (30 June 2020) and the AE300/AE330 factsheet
% (Diamond/Austro Engine, May 2024). See
% DroneAcharaya/contract/parameter-source-table.csv for full sourcing,
% confidence, and open-decision notes on every value below.
%
% Target architecture: 4-stroke diesel, 4 cylinders inline, CRDI,
% turbocharged, intercooled, liquid cooled, WITH a real reduction gearbox
% (1:1.69) between crankshaft and propeller -- this engine is NOT direct
% drive, unlike the earlier lesson models.

Eng = struct();

%% Geometry / configuration
Eng.NumCylinders   = 4;
Eng.Displacement_L = 1.991;              % EASA TCDS E.200: 1991 cm3
Eng.Bore_mm        = 83;                 % literature (Wikipedia, citing TCDS) -- medium confidence
Eng.Stroke_mm      = 92;                 % literature (Wikipedia, citing TCDS) -- medium confidence
Eng.CompressionRatio = 18;               % OM640 DONOR engine value, NOT confirmed for AE300 itself -- low confidence, placeholder
Eng.FiringOrder    = [1 3 4 2];          % standard inline-4 firing order
Eng.ConrodLength_mm = 150;               % assumed -- no AE300-specific value published. Gives a
                                          % rod/crank ratio (l/a) of 150/(92/2) = 3.26, within the
                                          % typical 3.0-3.5 automotive-diesel range. Only used by the
                                          % crank-resolved sidecar (Step 5) for slider-crank kinematics.

%% Gearbox -- crankshaft to propeller (AE300 is NOT direct-drive)
Eng.GearboxReductionRatio = 1.69;        % EASA TCDS E.200: "gearbox with reduction ratio of 1:1.69"
                                          % crank_rpm = prop_rpm * GearboxReductionRatio

%% Mechanical (crankshaft side)
Eng.CrankInertia_kgm2        = 0.18;     % ASSUMPTION: still unsourced (parameter table flags this
                                          % high-sensitivity + unconfirmed -- revisit)
Eng.FrictionCoeff_Nm_per_rpm = 0.009401;  % DERIVED: calibrated so friction = 12% of rated crank torque
                                          % at RatedRPM_crank (see derivation below) -- the 12% figure
                                          % itself is an assumption (no published FMEP data), but no
                                          % longer an arbitrary leftover number from the old 200HP build

%% Operating range (CRANKSHAFT side -- telemetry-schema.yaml's rpm field is
%% explicitly engine_model.crankshaft, not propeller)
Eng.IdleRPM_crank    = 800;    % ASSUMPTION: OM640-class automotive diesel idle, not AE300-published
Eng.RatedRPM_crank   = 3880;   % EASA TCDS E.200 (published): "123.5 kW at 3880 rpm (2300 prop rpm)"
Eng.RedlineRPM_crank = 4220;   % EASA TCDS E.200 (published): "Maximum Engine Over-speed (Crankshaft
                                % Speed): 4220 rpm (2500 prop rpm)" -- real overspeed limit, distinct
                                % from RatedRPM_crank

%% Operating range (PROPELLER side -- post-gearbox, for the propeller-load subsystem)
Eng.RatedRPM_prop   = 2300;    % EASA TCDS E.200 (published)
Eng.RedlineRPM_prop = 2500;    % EASA TCDS E.200 (published)
% cross-check: RatedRPM_crank / GearboxReductionRatio = 3880/1.69 = 2296 =~ 2300 published (agrees)

%% Full-throttle torque curve (calibrated lookup, CRANK RPM -> Nm)
% Calibrated so RatedRPM_crank (3880) lands at crank_torque_rated (see below),
% cross-checked two independent ways (power/omega, and published max_torque/
% gearbox ratio) -- both agree to within 0.3%. BMEP across the curve is
% 9.5-19.5 bar, physically plausible for a boosted diesel (not aggressive).
% Shape past the rated point (3880->4220) tapers, representing FADEC-governed
% overspeed territory, not normal operation.
Eng.TorqueCurve.RPM_crank = [800  1400 2000 2600 3200 3880   4220];
Eng.TorqueCurve.Torque_Nm = [150  230  280  300  309  303.95 280];

%% Target performance (for validation, not forced output)
Eng.TargetPower_kW        = 123.5;  % EASA TCDS E.200 + factsheet: take-off AND max continuous, same figure for E4
Eng.TargetPower_HP        = 168;    % published figure; note 123.5kW*1.34102=165.6, small published rounding discrepancy
Eng.CrankTorqueRated_Nm   = 303.95; % derived: RatedPower_kW / omega(RatedRPM_crank)
Eng.PropTorqueRated_Nm    = 512;    % EASA TCDS E.200 + factsheet (PROPELLER shaft, post-gearbox --
                                     % resolved via power-balance cross-check: 512Nm @ 2300rpm = 123.3kW)

%% Propeller load (affinity law AT THE PROP SHAFT: Torque_prop = k * prop_rpm^2)
% DERIVED, reflected through the gearbox -- NOT simply matched at the crank
% (that was the earlier lesson2.slx bug: direct-drive assumption, no gearbox
% reflection). Full derivation:
%   1. Torque available at crank after friction = CrankTorqueRated_Nm - Friction(RatedRPM_crank)
%   2. Reflected to the prop shaft: T_prop_available = T_crank_available * GearboxReductionRatio
%      (ideal lossless gearbox: torque UP, speed DOWN through a reduction)
%   3. k = T_prop_available / RatedRPM_prop^2
% This ensures full-throttle equilibrium lands exactly at RatedRPM_crank/
% RatedRPM_prop, verified by simulation (equilibrium residual = 0.0 Nm).
Eng.PropLoadCoeff_Nm_per_prop_rpm2 = 8.576023e-05;

%% Real published operating limits (EASA TCDS E.200) -- safety bounds, not
%% nominal running values. See parameter-source-table.csv for full detail.
Eng.OilTemp_Min_degC       = 50;
Eng.OilTemp_Max_degC       = 140;
Eng.CoolantTemp_Min_degC   = 60;
Eng.CoolantTemp_Max_degC   = 105;
Eng.OilPressure_Min_Idle_bar         = 0.9;
Eng.OilPressure_Min_MaxContinuous_bar = 2.5;
Eng.OilPressure_Max_bar     = 6.5;
Eng.MaxOperatingAltitude_m  = 5490;   % 18000 ft -- comfortably inside troposphere (11000m)

%% Air / turbo path (reduced-order, per parameter-source-table.csv: turbo_boost_map
%% and volumetric_efficiency_map are literature/calibrated placeholders, not
%% AE300-specific -- calibrated here so full-load AFR at rated point comes out
%% ~20:1, a physically sane diesel figure, cross-checked against published fuel flow)
Eng.TurboBoostMap.RPM_crank      = Eng.TorqueCurve.RPM_crank;       % same breakpoints as torque curve
Eng.TurboBoostMap.PressureRatio  = [1.05 1.3 1.7 2.0 2.2 2.4 2.35]; % full-throttle reference; scales toward 1.0 at part throttle
Eng.VolumetricEfficiency         = 0.90;    % literature-typical constant (V1 -- not a full VE(RPM,MAP) map yet)
Eng.TurboCompressorEfficiency    = 0.7;     % literature-typical small automotive-derived turbo
Eng.IntercoolerEffectiveness     = 0.75;    % literature-typical, see parameter-source-table.csv
Eng.SeaLevelAirDensity_kg_m3     = 1.225;   % ISA standard, physics constant -- reference for altitude/hot-day torque derating
Eng.TurboAltitudeCompHeadroom    = 1.5;     % turbo's max PR as a multiple of its sea-level full-throttle PR --
                                             % engineering assumption (no published critical-altitude figure exists
                                             % for this engine); gives critical altitude ~3291m (60% of the 5490m
                                             % certified ceiling), a defensible design point for a road-car-derived
                                             % turbo adapted for aviation, not a purpose-built high-altitude unit

%% CRDI fuel system
% Fuel commanding (flow, rail pressure, injection timing) is scheduled off
% COMMANDED load (throttle x RPM-implied reference torque/power, computed
% BEFORE turbo/altitude derating) not actual delivered power -- a real ECU
% schedules fueling off demand, not off what the turbo manages to deliver.
Eng.FuelIdleFlow_kg_h = 2.0;   % literature-typical small-diesel idle consumption (~2.5 L/h); avoids the
                                % BSFC-based term's zero-power singularity (BSFC*power -> 0 at idle otherwise)
Eng.BSFCMap.RefPower_kW      = [74.1  123.5];    % the two published factsheet test points
Eng.BSFCMap.BSFC_g_per_kWh   = [178.1 210.5];    % back-solved (not the raw two-point 205/227 g/kWh) so that
                                                   % FuelIdleFlow_kg_h + RefPower*BSFC/1000 reproduces the
                                                   % published fuel flow (15.2, 28.0 kg/h) EXACTLY at both points --
                                                   % the naive 205/227 figures overshoot once the idle floor is added
Eng.RailPressureMap.LoadFraction = [0   0.5 1.0];
Eng.RailPressureMap.Pressure_bar = [300 900 1500]; % literature CRDI-class range (idle -> full load), see parameter-source-table.csv
Eng.InjectionTimingMap.LoadFraction    = [0 0.5 1.0];
Eng.InjectionTimingMap.Timing_degBTDC  = [0 6   12]; % idle/cruise/full-load main-injection schedule, automotive-CRDI literature
Eng.InjectorFlowRateRef_mg_per_ms = 30;    % literature-typical modern CRDI injector flow rate at RailPressureRef
Eng.RailPressureRef_bar           = 1500;  % reference pressure for the sqrt(P) injector flow-rate scaling

%% Combustion (bridges air+fuel into AFR/EGT -- the "missing link" the README
%% flagged: AFR mediates fuel flow + boost + intake air into thermal outputs)
Eng.CombustionEfficiency  = 0.98;   % literature-typical for modern CRDI diesel, see parameter-source-table.csv
Eng.StoichAFR_diesel      = 14.5;   % literature, diesel stoichiometric air-fuel ratio
Eng.CoolantHeatFraction   = 0.28;   % literature diesel heat-balance split, same figure used to derive
                                     % cooling_heat_rejection_nominal earlier -- kept as one live parameter
                                     % so both uses stay consistent, not two independently-drifting numbers
Eng.HeadHeatShareOfCoolant = 0.20;  % literature judgment call (see cht_heat_transfer_coeff derivation) --
                                     % fraction of coolant-bound heat specifically attributed to the head
Eng.CpExhaust_J_per_kgK   = 1100;   % literature-typical for diesel exhaust (slightly above dry air's 1005)

%% Thermal network (per-cylinder CHT x4, coolant loop, oil loop)
% Thermal mass = fluid volume x specific heat is the WRONG basis for a lumped
% loop's time constant -- the real driver is fluid PLUS the wetted metal in
% continuous contact with it (block passages, radiator core, oil galleries),
% which is much larger than fluid alone. An initial fluid-only estimate gave
% unrealistic ~15s coolant/oil time constants (real engines take minutes);
% revised to target literature-typical few-minute warm-up time constants instead.
Eng.CHTThermalMass_J_per_K       = 17940;  % per-cylinder, Al head mass x specific heat (unchanged -- this
                                             % one IS reasonably represented by metal mass alone)
Eng.CHTHeatTransferCoeff_W_per_K = 169/4;  % PER-CYLINDER share of the aggregate whole-head coefficient (169) --
                                             % both heat AND coefficient split by cylinder count, not heat alone
Eng.CoolantThermalMass_J_per_K   = 279648; % revised (was fluid-only 18375) -- targets ~240s (4 min) time constant
Eng.OilThermalMass_J_per_K       = 222300; % revised (was fluid-only 10560) -- targets ~300s (5 min) time constant
Eng.UARadiator_W_per_K           = 1330;   % empirically re-tuned (first-pass estimate of 1165.2 W/K assumed the
                                             % other two loops sat exactly at their own targets; once properly
                                             % coupled -- CHT/coolant/oil all feed back on each other -- that
                                             % assumption doesn't hold exactly, so this was iterated against
                                             % actual simulated steady state instead of solved by hand). Result
                                             % (simulated): CHT=204.5C, coolant=95.5C, oil=114.9C -- all three
                                             % land almost exactly on their literature/TCDS targets simultaneously.
Eng.UAOilCooler_W_per_K          = 741.0;  % calibrated: oil settles at 115C (within TCDS 50-135C band) given
                                             % coolant at its own rated steady-state (95C)
Eng.CoolantTempInit_degC         = 15;     % starts at ambient, not a mid-operating-range guess
Eng.OilTempInit_degC             = 15;
Eng.CHTInit_degC                 = 15;

%% Lubrication -- oil pressure (separate from oil temperature, built above).
% Linear model fit through the two published TCDS minimum-pressure points
% (0.9 bar @ idle, 2.5 bar @ max-continuous) -- see parameter-source-table.csv
Eng.OilPressureIdle_bar     = 0.9;
Eng.OilPumpGain_bar_per_rpm = 0.000519;

%% Fault-injection hooks (healthy baseline = 1.0 for now; Step 4 wires these to
%% actual degradation schedules). Building the hook now, not deferring it, so
%% fault injection later modifies these two signals rather than restructuring
%% the thermal/lubrication network again.
Eng.CoolingHealth_init  = 1.0;  % scales radiator UA -- cooling_degradation fault
Eng.OilPumpHealth_init  = 1.0;  % scales oil pressure AND oil-cooler UA (reduced pump flow
                                 % degrades both delivery pressure and circulation-driven cooling) --
                                 % lubrication_degradation fault

%% Electrical (all low-sensitivity -- deliberately minimal effort, see parameter-source-table.csv)
Eng.AlternatorRatedPower_kW = 2;     % assumed
Eng.BatteryCapacity_Ah      = 20;    % assumed
Eng.SystemVoltage_V         = 28;    % assumed, standard aviation 28V bus
Eng.ElectricalLoad_kW       = 0.5;   % assumed -- avionics/instrument hotel load
Eng.AlternatorHealth_init   = 1.0;   % fault hook -- alternator_degradation, scales rated output

%% Fault injection -- injector_degradation (per-cylinder)
% Each cylinder's fuel share = (fuel_flow_total/4) * injector_health_c{n} -- a
% fouled injector delivers less fuel to ITS cylinder specifically; healthy
% cylinders do NOT compensate (no ECU trim modeled for V1). This makes
% egt_c{n}/cht_c{n} diverge for the affected cylinder while siblings stay
% normal -- the exact discriminator failure-mode-matrix.csv specifies.
Eng.InjectorHealth_c1_init = 1.0;
Eng.InjectorHealth_c2_init = 1.0;
Eng.InjectorHealth_c3_init = 1.0;
Eng.InjectorHealth_c4_init = 1.0;

%% Fault injection -- turbo_degradation
% NOTE inverted convention per health-parameter-registry.md: this is a "_deg"
% scalar (0.0=healthy/full map efficiency, 1.0=fully degraded), NOT a "_health"
% scalar like the others above (which are 1.0=healthy). Reduces the turbo's
% ALTITUDE-COMPENSATION HEADROOM specifically -- matches the failure-mode-
% matrix's own discriminator ("may be invisible at sea level... altitude-
% dependence IS the discriminator"), since headroom only gets exercised once
% ambient pressure drops below sea level in the first place.
Eng.TurboEfficiencyDeg_init = 0.0;

%% Fault injection -- sensor_drift (NOT an engine fault -- corrupts the
%% measurement, per health-parameter-registry.md's separate sensor-fault
%% namespace). Demonstrated on cht_c3, per the matrix's own suggested example:
%% a channel with coupled siblings (egt_c3, coolant) so the discriminator is
%% visible -- lone channel ramps while physically-coupled channels stay clean.
%% This is the first live implementation of the Xv (ground truth) vs Xs
%% (sensor-reported) split designed into ground-truth-schema.yaml.
Eng.SensorDriftRate_c3_degC_per_s = 0;  % healthy baseline = 0 (no drift). Severity range per the
                                         % matrix is 0-20 degC; a slow monotonic ramp reaching that
                                         % range over a multi-hour mission is ~0.01 degC/s or slower.

%% Fault injection -- mechanical_vibration (bearing_health, 1.0=healthy)
% model_tier is "crank_resolved" per the matrix -- the TRUE signature needs
% the sidecar (not yet built). This is the mean-value PROXY per the README's
% own early scoping: "not a physical-domain block, a synthesized post-
% processing signal from torque ripple + an injected imbalance term."
% telemetry-schema.yaml only wants the RMS-reduced feature (raw waveform is
% explicitly out-of-band), so this computes amplitude/RMS directly rather
% than synthesizing then reducing a raw oscillation -- same result, simpler.
Eng.BearingHealth_init        = 1.0;   % 1.0=healthy (nominal friction), 0.0=seized/max friction
Eng.VibrationBaseline_g       = 0.05;  % assumed -- small, always-present healthy mechanical noise floor
Eng.VibrationImbalanceGain_g  = 0.6;   % assumed -- imbalance amplitude at full wear (bearing_health=0) AND
                                        % rated RPM. Scales with (RPM/RatedRPM)^2, matching real rotating-
                                        % imbalance physics (force ~ m*r*omega^2), so the fault is most
                                        % visible at high RPM -- consistent with the matrix's own recommended
                                        % coverage condition ("constant RPM missions repeated over time").
Eng.BearingFrictionGain        = 0.5;   % assumed -- at bearing_health=0, friction torque coefficient
                                         % increases 50% (matrix: "bearing_health raises imbalance + friction")

%% Fault injection -- fuel_starvation (fuel_delivery_health, 1.0=healthy)
% CONDITION-GATED fault, per the matrix's own discriminator: "invisible at
% cruise, appears at high load". fuel_delivery_health caps the MAXIMUM
% deliverable fuel rate -- it does NOT scale delivery at every load like
% injector_health does. A partially-blocked filter/line can still supply
% enough fuel for low/moderate demand; only once commanded demand exceeds
% the health-scaled ceiling does an actual deficit appear (restriction
% engineering: min(commanded, health*max_rated)). The resulting fuel deficit
% ratio also scales torque -- an engine literally can't make full torque
% without the fuel to back it, per the matrix's correlated_signals (torque, rpm).
Eng.FuelDeliveryHealth_init = 1.0;
Eng.MaxRatedFuelFlow_kg_h   = 28.0;  % = the validated rated-point fuel flow (Step 3), the ceiling
                                       % fuel_delivery_health scales down from

%% Fault injection -- injection_timing_drift (injection_timing_deg, 0=healthy->1=failed,
%% consistent with the corrected "_deg" convention). Shifts ALL 4 cylinders equally
%% (the discriminator vs. injector_degradation's single-cylinder signature) --
%% retarded timing reduces torque, worsens BSFC (fuel_flow up), and pushes more
%% combustion heat into the exhaust (EGT up), all from ONE drift signal.
Eng.InjectionTimingDeg_init      = 0.0;
Eng.InjectionTimingDriftMax_deg  = 8;    % assumed -- max retard at deg=1.0 (failure threshold is deg>=0.6)
Eng.TimingDriftTorquePenalty     = 0.15; % assumed -- 15% torque reduction at deg=1.0
Eng.TimingDriftBSFCPenalty       = 0.15; % assumed -- 15% BSFC worsening (fuel_flow up for same power) at deg=1.0
Eng.TimingDriftExhaustPenalty    = 0.15; % assumed -- exhaust_fraction +0.15 (0.35->0.50) at deg=1.0,
                                          % representing poorly-timed combustion pushing more heat to exhaust

%% Fault injection -- sensor_bias (NOT an engine fault -- corrupts the
%% measurement, per health-parameter-registry.md's separate sensor-fault
%% namespace). Demonstrated on cht_c3, same channel as sensor_drift, so both
%% sensor faults share the one Xv/Xs split already built (cht3_out stays true
%% physics; cht3_reported_out = true + drift ramp + bias offset, each an
%% independently-zeroable term on the same Sum block).
Eng.SensorBiasOffset_c3_degC = 0;  % healthy baseline = 0 (no bias). Severity range per the matrix
                                    % is 0-20 degC, a constant step offset (not a ramp like drift).

%% Fault injection -- sensor_noise (NOT an engine fault -- corrupts the
%% measurement). Same channel/Sum-block pattern as sensor_drift/sensor_bias:
%% a zero-mean Gaussian term (Simulink Random Number block, 0.1s sample time,
%% fixed seed for reproducibility) added into cht3_reported_out. Zero mean by
%% construction, so only VARIANCE rises -- matches the matrix's discriminator
%% ("moves variance not mean") as distinct from bias (moves mean, zero variance)
%% and drift (moves mean over time, zero variance).
Eng.SensorNoiseSigma_c3_degC = 0;  % healthy baseline = 0 (no noise, matches other sensor faults)

%% Fault injection -- sensor_stuck (NOT an engine fault -- corrupts the
%% measurement). Same channel (cht_c3) as the other sensor faults, but a
%% structurally different mechanism: a Switch+Memory sample-and-hold stage
%% AFTER the drift/bias/noise Sum, gated by a Step block (not a Constant) so
%% activation happens AT a mission time, not from t=0 -- a Constant=1 for the
%% whole run would just hold the Memory block's t=0 initial condition (0.0)
%% forever, never having passed a real reading through. Switch passes the
%% live (bias/noise/drift-corrupted) signal through before activation; once
%% the Step fires, it freezes at whatever the Memory block last held (the live
%% value one step before activation) and re-holds itself indefinitely via
%% the feedback loop -- matches the matrix's "channel derivative = 0 while
%% engine_state dynamic" discriminator exactly, since the true physics and
%% every sibling channel keep moving through a throttle transient.
Eng.SensorStuckActivationTime_s = 1e6;  % healthy baseline = 1e6s (Step block requires a finite value;
                                          % this is far beyond any realistic mission duration, so it never
                                          % activates -- effectively "never", always pass-through). Set to
                                          % a finite in-mission time to freeze cht3_reported_out at whatever
                                          % it read one step before that time -- models a hardware failure
                                          % occurring mid-mission, not a pre-existing state.

%% Fault injection -- sensor_dropout (NOT an engine fault -- corrupts the
%% measurement). Deliberately NOT demonstrated on cht_c3 like the other three
%% sensor faults: telemetry-schema.yaml's missing_value_policy for cht_c1 is
%% "hold_last", which is literally the same freeze mechanism as sensor_stuck
%% -- a dropout demo on that channel would be indistinguishable from stuck,
%% just relabeled. vibration_rms_x's declared policy is "nan" (emit NaN, set
%% quality_flag=MISSING), which is a genuinely different mechanism worth its
%% own demonstration -- "obey missing_value_policy" per the matrix means the
%% fault's behavior must match the FIELD's declared policy, not a universal
%% implementation. A rectangular Step-on/Step-off window (not a permanent
%% one-way activation like stuck) models the matrix's "intermittent" onset
%% profile and lets recovery be checked too. vibration_rms_z, derived from
%% the SAME true vibration_rms_x signal via a Gain block upstream of this
%% dropout stage, is the clean sibling for the discriminator.
Eng.SensorDropoutStartTime_s = 1e6;  % healthy baseline = 1e6s (never starts within a real mission)
Eng.SensorDropoutEndTime_s   = 2e6;  % must be > start; healthy baseline is any value past start

%% Step 5 -- crank-resolved sidecar (misfire, combustion_instability, TRUE
%% per-cylinder vibration). A standalone model, NOT hot-swapped into
%% engine_core -- it runs short high-crank-resolution windows seeded from a
%% mean-value operating point, using a single-zone Wiebe combustion model
%% (Heywood-standard) through real slider-crank kinematics (bore/stroke/rod
%% above) so the resulting torque ripple has genuine, physically-grounded
%% harmonic content rather than a synthesized waveform.
Eng.WiebeA = 6.9;   % literature (Heywood) standard diesel Wiebe-function efficiency parameter
Eng.WiebeM = 0.9;   % literature (Heywood) standard diesel Wiebe-function shape parameter
Eng.FuelLHV_MJ_per_kg = 42.8;  % published (Jet-A/diesel) -- same figure already baked into
                                % engine_core's FcnFuelpowerKw as the literal 11.8889 (=42.8/3.6);
                                % named here explicitly for the sidecar's own use
Eng.IgnitionDelay_deg = 4;      % assumed -- typical CRDI diesel ignition delay (crank degrees
                                 % between injection start and actual combustion start); combustion
                                 % start phi0 = -(injection_timing_deg_BTDC - IgnitionDelay_deg)
Eng.CombustionDuration_deg = 50; % assumed -- typical diesel combustion duration (10-90% burn), crank degrees
Eng.CylinderGamma = 1.35;       % assumed -- single constant ratio-of-specific-heats for the whole
                                 % closed cycle (compression through expansion), a standard single-
                                 % zone simplification (real gamma varies with temperature/composition
                                 % through the cycle; this is a representative blend between fresh-air
                                 % gamma_air=1.4 and hot combustion-gas gamma~1.3)
Eng.CompressionPolytropicIndex = 1.30;  % assumed -- literature-typical for diesel compression (not
                                          % used directly by the energy-release ODE, which uses
                                          % CylinderGamma throughout; kept for documentation/cross-
                                          % check against the ODE's compression-phase behavior)
