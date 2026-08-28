% run_single_mission.m
% Step 6, piece 1: drive engine_core through one full scripted mission
% (long_loiter, healthy unit) end-to-end and sanity-check the result.
%
% This is the first concrete slice of dataset generation -- NOT the full
% pipeline. No fault injection, no sidecar invocation, no schema export yet;
% those are the next pieces. Purpose here is just to prove the mission-
% profile mechanism (From Workspace throttle/altitude/ISA-offset) drives
% engine_core sensibly through a real multi-phase flight, not a single
% constant-throttle setpoint.

run(fullfile(fileparts(mfilename('fullpath')), '..', 'model', 'AeroDieselEngineParameters.m'));
assignin('base','Eng',Eng);

profile = generate_mission_profile('long_loiter');

MissionThrottle = profile.throttle;
MissionAltitude = profile.altitude;
MissionIsaOffset = profile.isa_offset;
assignin('base','MissionThrottle', MissionThrottle);
assignin('base','MissionAltitude', MissionAltitude);
assignin('base','MissionIsaOffset', MissionIsaOffset);

load_system('engine_core');
set_param('engine_core','Solver','ode23t','SolverType','Variable-step', ...
    'StopTime', num2str(profile.duration_s));

fprintf('=== running long_loiter mission, duration=%.0fs (%.1f min) ===\n', ...
    profile.duration_s, profile.duration_s/60);
tic;
simOut = sim('engine_core');
fprintf('wall-clock: %.1fs\n', toc);

t = simOut.get('rpm_out').Time;
rpm = simOut.get('rpm_out').Data;
trq = simOut.get('torque_out').Data;
pwr = trq .* rpm * 2*pi/60/1000;  % kW -- NOT alt_power_out, which is alternator power (0-2kW)
cht1 = simOut.get('cht1_out').Data;
oilp = simOut.get('oil_pressure_out').Data;
oilT = simOut.get('oil_out').Data;
fuel = simOut.get('fuel_flow_out').Data;

phases = [0, 30, 90, 390, 600, 600+4200, 600+4200+300, 600+4200+360, profile.duration_s];
labels = {'t=0 (start)','t=30 (idle)','t=90 (pre-climb)','t=390 (top of climb)', ...
    't=600 (start loiter)','t=end loiter','t=end descent','t=idle2','t=shutdown'};
fprintf('\n%-20s %8s %8s %8s %8s %8s\n','phase','RPM','kW','CHT1(C)','OilP(bar)','Fuel(kg/h)');
for i = 1:numel(phases)
    idx = find(t >= phases(i), 1);
    if isempty(idx), idx = numel(t); end
    fprintf('%-20s %8.1f %8.1f %8.1f %8.2f %8.2f\n', labels{i}, rpm(idx), pwr(idx), cht1(idx), oilp(idx), fuel(idx));
end

fprintf('\nsanity checks:\n');
fprintf('  any NaN in rpm? %d\n', any(isnan(rpm)));
fprintf('  rpm range: %.1f to %.1f\n', min(rpm), max(rpm));
fprintf('  max CHT1 reached: %.1f C\n', max(cht1));
fprintf('  min oil pressure (post-idle): %.2f bar\n', min(oilp(t>60)));

%% Sidecar bridge: one burst per mission PHASE (idle/climb/loiter/descent),
%% not once per mission and not continuously -- see run_sidecar_burst.m's
%% own header note on why. Healthy unit here (misfire_rate=0,
%% combustion_stability=0); a faulted unit would pass its assigned severities
%% instead of these hardcoded zeros.
load_system('crank_resolved_sidecar');
map_out = simOut.get('map_out').Data;
inj_timing = simOut.get('inj_timing_out').Data;

phase_points = profile.sidecar_seed_points;
names = fieldnames(phase_points);

fprintf('\n%-10s %8s %8s %10s %10s %10s %10s\n','phase','rpm','fuel','vib_rms','ord_1x','ord_2x','imep_cov');
for i = 1:numel(names)
    ph = names{i};
    tp = phase_points.(ph);
    idx = find(t >= tp, 1);
    seed = struct();
    seed.rpm = rpm(idx);
    seed.fuel_flow_kg_h = fuel(idx);
    seed.map_kpa = map_out(idx);
    seed.injection_timing_deg = inj_timing(idx);
    seed.misfire_rate = 0;
    seed.combustion_stability = 0;
    feat = run_sidecar_burst(seed, Eng);
    phase_features.(ph) = feat;
    fprintf('%-10s %8.1f %8.2f %10.1f %10.3f %10.1f %10.5f\n', ph, seed.rpm, seed.fuel_flow_kg_h, ...
        feat.vibration_rms_x, feat.vibration_order_1x, feat.vibration_order_2x, feat.imep_cov_c1);
end

%% Schema export -- writes data/raw/<run_id>.parquet (telemetry, Xs) and
%% data/raw/<run_id>_groundtruth.parquet (Xv + theta + sensor-fault-activity)
%% per telemetry-schema.yaml / ground-truth-schema.yaml, plus a .meta.json
%% sidecar, matching data/raw/README.md's storage convention.
meta_in.run_id = 'run_00001';
meta_in.engine_id = 'ENG-TEST-0001';
meta_in.mission_id = 'MSN-long_loiter-0001';
meta_in.mission_shape = 'long_loiter';
meta_in.health = struct( ...
    'injector_health_c1', Eng.InjectorHealth_c1_init, ...
    'injector_health_c2', Eng.InjectorHealth_c2_init, ...
    'injector_health_c3', Eng.InjectorHealth_c3_init, ...
    'injector_health_c4', Eng.InjectorHealth_c4_init, ...
    'cooling_health', Eng.CoolingHealth_init, ...
    'oil_pump_health', Eng.OilPumpHealth_init, ...
    'bearing_health', Eng.BearingHealth_init, ...
    'turbo_efficiency_deg', Eng.TurboEfficiencyDeg_init, ...
    'combustion_stability', 0.0, ...
    'injection_timing_deg', Eng.InjectionTimingDeg_init, ...
    'fuel_delivery_health', Eng.FuelDeliveryHealth_init, ...
    'alternator_health', Eng.AlternatorHealth_init, ...
    'misfire_rate_c1', 0.0, 'misfire_rate_c2', 0.0, ...
    'misfire_rate_c3', 0.0, 'misfire_rate_c4', 0.0);
meta_in.sensor_fault = struct('channel','none','type','NONE','onset_s',inf);
meta_in.sidecar_seed_points_used = phase_features;

[telemetry, groundtruth, meta] = export_mission_to_schema(simOut, profile, phase_features, meta_in);

out_dir = fullfile(fileparts(mfilename('fullpath')), '..', '..', 'data', 'raw');
if ~exist(out_dir,'dir'), mkdir(out_dir); end
parquetwrite(fullfile(out_dir, [meta.run_id '.parquet']), telemetry);
parquetwrite(fullfile(out_dir, [meta.run_id '_groundtruth.parquet']), groundtruth);
fid = fopen(fullfile(out_dir, [meta.run_id '.meta.json']), 'w');
fprintf(fid, '%s', jsonencode(meta, 'PrettyPrint', true));
fclose(fid);

fprintf('\nexported %d rows to %s\\%s.parquet (+ _groundtruth.parquet, .meta.json)\n', ...
    height(telemetry), out_dir, meta.run_id);
fprintf('telemetry columns: %s\n', strjoin(telemetry.Properties.VariableNames, ', '));
