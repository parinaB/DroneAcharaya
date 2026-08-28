function features = run_sidecar_burst(seed, Eng)
% RUN_SIDECAR_BURST  Seed crank_resolved_sidecar from a mean-value operating
% point and run a short high-crank-resolution window, returning the
% resulting vibration/misfire/combustion-instability feature set.
%
% seed fields (all required):
%   .rpm                  crankshaft RPM (from engine_core's rpm_out)
%   .fuel_flow_kg_h        total fuel flow (from engine_core's fuel_flow_out)
%   .map_kpa               absolute manifold pressure, kPa (from map_out)
%   .injection_timing_deg  BTDC (from engine_core's inj_timing_out)
%   .misfire_rate          scalar (applied to all 4 cylinders) or 1x4 vector
%   .combustion_stability  scalar, shared across all 4 cylinders (per the matrix)
%   .burst_duration_s      how long to run the burst (default 0.3s if omitted)
%
% Returns features: vibration_rms_x, vibration_order_1x, vibration_order_2x,
% imep_cov_c1 (all from the last completed window of the burst).
%
% Design note: this runs ONCE PER MISSION PHASE (idle/climb/loiter/descent),
% not once per mission and not continuously through it -- a burst this
% detailed (Ts=2e-5s) run continuously for a whole mission would be enormously
% expensive and isn't what the sidecar is designed for (see build_plan.md
% Step 5's "runs short high-crank-resolution windows... not a full mission").
% The per-phase feature set is held constant across that phase's duration
% when assembled into the final per-mission export -- a deliberate,
% documented simplification, not a hidden shortcut.

omega_check = seed.rpm * 2*pi/60;
cycle_time_s = 4*pi/omega_check;
min_cycles = 15;  % >= the IMEP-COV block's 10-cycle window, plus warm-up margin
min_duration_s = min_cycles * cycle_time_s;
if ~isfield(seed,'burst_duration_s') || seed.burst_duration_s < min_duration_s
    seed.burst_duration_s = min_duration_s;
end
if isscalar(seed.misfire_rate)
    mf = repmat(seed.misfire_rate, 1, 4);
else
    mf = seed.misfire_rate;
end

assignin('base','Eng', Eng);

omega = seed.rpm * 2*pi/60;
set_param('crank_resolved_sidecar/CrankInertia','w', num2str(omega,10));
set_param('crank_resolved_sidecar/ConstFuelFlowSeed','Value', num2str(seed.fuel_flow_kg_h,10));
set_param('crank_resolved_sidecar/ConstPintake','Value', num2str(seed.map_kpa/100,10));
set_param('crank_resolved_sidecar/ConstInjTiming','Value', num2str(seed.injection_timing_deg,10));
set_param('crank_resolved_sidecar/ConstInstability','Value', num2str(seed.combustion_stability,10));
for c = 1:4
    set_param(sprintf('crank_resolved_sidecar/ConstMisfireC%d',c),'Value', num2str(mf(c),10));
end
set_param('crank_resolved_sidecar','StopTime', num2str(seed.burst_duration_s,10));

simOut = sim('crank_resolved_sidecar');

rms_v = simOut.get('vib_rms_out').Data;
o1 = simOut.get('vib_ord1_out').Data;
o2 = simOut.get('vib_ord2_out').Data;
cov1 = simOut.get('imep_cov1_out').Data;

features.vibration_rms_x    = rms_v(end);
features.vibration_order_1x = o1(end);
features.vibration_order_2x = o2(end);
features.imep_cov_c1        = cov1(end);
end
