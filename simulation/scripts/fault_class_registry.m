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
% Each entry: {fault_class, target, convention, per_cylinder, theta_field}
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

reg = { ...
    'injector_degradation',    'Eng.InjectorHealth_c%d_init', '_health', true,  'injector_health_c%d'; ...
    'lubrication_degradation', 'Eng.OilPumpHealth_init',       '_health', false, 'oil_pump_health'; ...
    'cooling_degradation',     'Eng.CoolingHealth_init',       '_health', false, 'cooling_health'; ...
    'turbo_degradation',       'Eng.TurboEfficiencyDeg_init',  '_deg',    false, 'turbo_efficiency_deg'; ...
    'mechanical_vibration',    'Eng.BearingHealth_init',       '_health', false, 'bearing_health'; ...
    'misfire',                 'sidecar.misfire_rate_c%d',     '_deg',    true,  'misfire_rate_c%d'; ...
    'combustion_instability',  'sidecar.combustion_stability', '_deg',    false, 'combustion_stability'; ...
    'fuel_starvation',         'Eng.FuelDeliveryHealth_init',  '_health', false, 'fuel_delivery_health'; ...
    'alternator_degradation',  'Eng.AlternatorHealth_init',    '_health', false, 'alternator_health'; ...
    'injection_timing_drift',  'Eng.InjectionTimingDeg_init',  '_deg',    false, 'injection_timing_deg' };
end
