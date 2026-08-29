function reg = fault_class_registry()
% FAULT_CLASS_REGISTRY  Table-driven map from each physical fault class (per
% failure-mode-matrix.csv) to where its health parameter actually lives and
% how to set it. 10 physical fault classes + healthy = 11, not the "~8"
% build_plan.md's early estimate used -- that predates Step 5's actual
% implementation of misfire/combustion_instability, which are genuine
% physical fault classes with their own health parameters now that the
% crank-resolved sidecar exists. Sensor faults (bias/drift/noise/stuck/
% dropout) are NOT here -- those are drawn independently per generate_unit.m,
% not part of a unit's physical fault-class assignment.
%
% Each entry: {fault_class, target, convention, per_cylinder, theta_field, max_severity}
%   target       : 'Eng.<FieldName>_init' for mean-value-core faults, or
%                  'sidecar.misfire_rate' / 'sidecar.combustion_stability'
%                  for the two crank-resolved-only faults.
%   convention   : '_health' or '_deg' -- see compute_health_trajectory.m.
%   per_cylinder : true if this fault targets ONE randomly-chosen cylinder
%                  out of 4 (injector_degradation, misfire), false if it's a
%                  single engine-wide parameter.
%   theta_field  : the matching column name in the run_fleet_missions.m
%                  theta struct / ground-truth-schema.yaml health_parameter_
%                  trajectories list (spelled out explicitly here, not
%                  derived from `target` by string manipulation -- that was
%                  fragile and got it wrong for anything with a _c%d suffix).
%   max_severity : the damage ceiling passed to compute_health_trajectory.m,
%                  copied EXACTLY from failure-mode-matrix.csv's own
%                  severity_range column -- NOT always 1.0. Running damage
%                  all the way to literal 0.0/1.0 health for every class
%                  exposed a real gap (sustained full lubrication/cooling
%                  failure has no thermal equilibrium in the current model
%                  -- oil_temperature climbs unboundedly rather than
%                  settling high-but-finite); respecting the matrix's own
%                  bound avoids that unvalidated territory instead of
%                  papering over it with an arbitrary cap. See
%                  docs/build_plan.md's Step 6 log.

reg = { ...
    'injector_degradation',    'Eng.InjectorHealth_c%d_init', '_health', true,  'injector_health_c%d',      0.6; ...
    'lubrication_degradation', 'Eng.OilPumpHealth_init',       '_health', false, 'oil_pump_health',           0.5; ...
    'cooling_degradation',     'Eng.CoolingHealth_init',       '_health', false, 'cooling_health',            0.5; ...
    'turbo_degradation',       'Eng.TurboEfficiencyDeg_init',  '_deg',    false, 'turbo_efficiency_deg',      0.7; ...
    'mechanical_vibration',    'Eng.BearingHealth_init',       '_health', false, 'bearing_health',            0.5; ...
    'misfire',                 'sidecar.misfire_rate_c%d',     '_deg',    true,  'misfire_rate_c%d',          0.3; ...
    'combustion_instability',  'sidecar.combustion_stability', '_deg',    false, 'combustion_stability',      0.5; ...
    'fuel_starvation',         'Eng.FuelDeliveryHealth_init',  '_health', false, 'fuel_delivery_health',      0.6; ...
    'alternator_degradation',  'Eng.AlternatorHealth_init',    '_health', false, 'alternator_health',         0.5; ...
    'injection_timing_drift',  'Eng.InjectionTimingDeg_init',  '_deg',    false, 'injection_timing_deg',      0.6 };
end
