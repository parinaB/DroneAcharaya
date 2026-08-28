function [telemetry, groundtruth, meta] = export_mission_to_schema(simOut, profile, phase_features, meta_in)
% EXPORT_MISSION_TO_SCHEMA  Resample one mission's engine_core output (plus
% the per-phase sidecar features from run_sidecar_burst.m) onto a common
% export grid and assemble the two files contract/telemetry-schema.yaml and
% contract/ground-truth-schema.yaml specify.
%
% meta_in fields (all required except where noted):
%   .run_id           string, e.g. 'run_00001'
%   .engine_id        string
%   .mission_id       string
%   .health           struct of health-parameter values ACTUALLY used this
%                     run (canonical names per health-parameter-registry.md),
%                     held constant across the whole mission -- this script
%                     does not yet do staged degradation trajectories (that's
%                     the per-unit generator, still to come); a healthy run
%                     just passes every _init default.
%   .sensor_fault     (optional) struct: .channel (name) and .type (one of
%                     NONE/BIAS/DRIFT/NOISE/STUCK/DROPOUT), .onset_s. Only
%                     one corruptible channel supported for now (cht_c3, the
%                     only channel with a real Xv/Xs split built in
%                     engine_core.slx). Defaults to NONE if omitted.
%   .export_rate_hz   (optional, default 1) single common export rate for
%                     the whole table -- see the note below on why this is
%                     one rate, not the schema's per-field native rates.
%
% Returns telemetry (Xs, table), groundtruth (Xv+theta+sensor-fault-activity,
% table), and meta (struct, also written as the .meta.json sidecar).
%
% RATE NOTE: telemetry-schema.yaml lists native rates from 1-50Hz per field.
% "computed at the slow-channel timestep so every head's input stays
% time-aligned" (build_plan.md Step 6) is read here as: export everything on
% ONE common grid rather than truly separate per-field rates, since (a) nothing
% here needs 50Hz resolution for degradation/RUL work, (b) a single flat table
% is what Parquet naturally wants, (c) the sidecar vibration features only
% update once per mission PHASE anyway (run_sidecar_burst.m), which is far
% coarser than any per-field native rate in the schema. 1Hz is the default;
% revisit if the AI team asks for a specific channel at its native rate.

if ~isfield(meta_in,'export_rate_hz'), meta_in.export_rate_hz = 1; end
if ~isfield(meta_in,'sensor_fault')
    meta_in.sensor_fault = struct('channel','none','type','NONE','onset_s',inf);
end
rate = meta_in.export_rate_hz;

t_end = simOut.get('rpm_out').Time(end);
t_export = (0:1/rate:t_end)';
n = numel(t_export);

g = @(name) simOut.get(name);
resample = @(name) interp1(g(name).Time, g(name).Data, t_export, 'linear', 'extrap');

%% ---- engine_state, from the mission's own phase breakpoints ----------------
engine_state = strings(n,1);
for i = 1:size(profile.phases,1)
    ps = profile.phases{i,1}; pe = profile.phases{i,2}; label = profile.phases{i,3};
    engine_state(t_export >= ps & t_export < pe) = label;
end
engine_state(engine_state=="") = "OFF";
engine_state = categorical(engine_state);

%% ---- per-phase sidecar features, held constant across each phase's span ---
vib_rms_x = nan(n,1); vib_ord1x = nan(n,1); vib_ord2x = nan(n,1); imep_cov = nan(n,1);
phase_names = fieldnames(meta_in.sidecar_seed_points_used);
for i = 1:numel(phase_names)
    ph = phase_names{i};
    span = profile.sidecar_seed_spans.(ph);
    ps = span(1); pe = span(2);
    m = t_export >= ps & t_export < pe;
    f = phase_features.(ph);
    vib_rms_x(m) = f.vibration_rms_x;
    vib_ord1x(m) = f.vibration_order_1x;
    vib_ord2x(m) = f.vibration_order_2x;
    imep_cov(m)  = f.imep_cov_c1;
end

%% ---- true (ground-truth) values --------------------------------------------
rpm_true    = resample('rpm_out');
torque_true = resample('torque_out');
cht_c1_true = resample('cht1_out'); cht_c2_true = resample('cht2_out');
cht_c3_true = resample('cht3_out'); cht_c4_true = resample('cht4_out');
egt_c1_true = resample('egt_c1_out'); egt_c2_true = resample('egt_c2_out');
egt_c3_true = resample('egt_c3_out'); egt_c4_true = resample('egt_c4_out');
oil_pressure_true    = resample('oil_pressure_out');
oil_temperature_true = resample('oil_out');
fuel_flow_true      = resample('fuel_flow_out');
rail_pressure_true  = resample('rail_pressure_out');
injection_timing_true = resample('inj_timing_out');
boost_pressure_true = resample('boost_pressure_out');
map_true            = resample('map_out');
intake_temperature_true = resample('intake_temp_out');
air_mass_flow_true  = resample('air_mdot_out');
coolant_temperature_true = resample('coolant_out');
battery_voltage_true = resample('batt_voltage_out');
battery_current_true = resample('batt_current_out');
alternator_power_true = resample('alt_power_out');

%% ---- Xs (post sensor-fault-corruption) -- currently only cht_c3 is
%% corruptible (engine_core's built Xv/Xs split); every other channel is
%% Xs==Xv until more sensor-fault taps exist on other channels ---------------
if strcmpi(meta_in.sensor_fault.channel,'cht_c3') && ~strcmpi(meta_in.sensor_fault.type,'NONE')
    cht_c3_reported = resample('cht3_reported_out');
else
    cht_c3_reported = cht_c3_true;
end

power = torque_true .* rpm_true * 2*pi/60/1000;  % kW, derived -- NOT alt_power_out (alternator)
throttle = interp1(profile.throttle(:,1), profile.throttle(:,2), t_export, 'linear', 'extrap');
engine_load = throttle; % V1 simplification: no separate load signal exists yet -- see header note

altitude = interp1(profile.altitude(:,1), profile.altitude(:,2), t_export, 'linear', 'extrap');
ambient_pressure = resample('ambient_pressure_out');
ambient_temperature = resample('ambient_temp_out');
air_density = resample('air_density_out');

% mean-value bearing_health/imbalance vibration PROXY (Step 4), continuous
% for the whole mission -- distinct from vibration_rms_x/order_1x above,
% which are the sidecar's crank-resolved reading and only exist during the
% 4 phases it samples. bearing_health is NOT wired into the sidecar (only
% misfire_rate/combustion_stability are), so this proxy is the ONLY column
% that reflects mechanical_vibration/bearing_health faults -- do not treat
% it as redundant with vibration_rms_x/order_1x, they capture different
% physical mechanisms (see data/README.md).
vib_rms_x_proxy = resample('vib_rms_x_out');
vib_order1x_proxy = resample('vib_order1x_out');

engine_id_col = repmat(string(meta_in.engine_id), n, 1);
mission_id_col = repmat(string(meta_in.mission_id), n, 1);
data_origin = repmat(categorical("SIMULATED"), n, 1);

telemetry = table(t_export, rpm_true, torque_true, power, engine_load, ...
    cht_c1_true, cht_c2_true, cht_c3_reported, cht_c4_true, ...
    egt_c1_true, egt_c2_true, egt_c3_true, egt_c4_true, ...
    oil_pressure_true, oil_temperature_true, ...
    fuel_flow_true, rail_pressure_true, injection_timing_true, ...
    boost_pressure_true, map_true, intake_temperature_true, air_mass_flow_true, ...
    coolant_temperature_true, vib_rms_x, vib_ord1x, vib_rms_x_proxy, vib_order1x_proxy, ...
    battery_voltage_true, battery_current_true, alternator_power_true, ...
    altitude, ambient_pressure, ambient_temperature, air_density, ...
    throttle, engine_state, engine_id_col, mission_id_col, data_origin, ...
    'VariableNames', { ...
    't','rpm','torque','power','engine_load', ...
    'cht_c1','cht_c2','cht_c3','cht_c4', ...
    'egt_c1','egt_c2','egt_c3','egt_c4', ...
    'oil_pressure','oil_temperature', ...
    'fuel_flow','rail_pressure','injection_timing', ...
    'boost_pressure','map','intake_temperature','air_mass_flow', ...
    'coolant_temperature','vibration_rms_x','vibration_order_1x', ...
    'vibration_rms_x_bearing_proxy','vibration_order_1x_bearing_proxy', ...
    'battery_voltage','battery_current','alternator_power', ...
    'altitude','ambient_pressure','ambient_temperature','air_density', ...
    'throttle','engine_state','engine_id','mission_id','data_origin'});

%% ---- ground truth (Xv + theta trajectories + sensor-fault-activity) -------
health_names = fieldnames(meta_in.health);
health_cols = cell(1, numel(health_names));
for i = 1:numel(health_names)
    health_cols{i} = repmat(meta_in.health.(health_names{i}), n, 1);
end

sensor_fault_active_cht_c3 = repmat(categorical(string(meta_in.sensor_fault.type)), n, 1);
sensor_fault_active_cht_c3(t_export < meta_in.sensor_fault.onset_s) = categorical("NONE");

gt_vars = [{t_export, rpm_true, torque_true, cht_c1_true, cht_c2_true, cht_c3_true, cht_c4_true, ...
    egt_c1_true, egt_c2_true, egt_c3_true, egt_c4_true, oil_pressure_true, oil_temperature_true, ...
    fuel_flow_true, rail_pressure_true, injection_timing_true, boost_pressure_true, map_true, ...
    intake_temperature_true, air_mass_flow_true, coolant_temperature_true, ...
    vib_rms_x, vib_ord1x, vib_rms_x_proxy, vib_order1x_proxy, ...  % vibration_rms_y/z_true not modeled (no y/z axis in the sidecar yet)
    battery_voltage_true, battery_current_true, alternator_power_true}, ...
    health_cols, {sensor_fault_active_cht_c3, imep_cov, vib_ord2x}];
gt_names = [{'t','rpm_true','torque_true','cht_c1_true','cht_c2_true','cht_c3_true','cht_c4_true', ...
    'egt_c1_true','egt_c2_true','egt_c3_true','egt_c4_true','oil_pressure_true','oil_temperature_true', ...
    'fuel_flow_true','rail_pressure_true','injection_timing_true','boost_pressure_true','map_true', ...
    'intake_temperature_true','air_mass_flow_true','coolant_temperature_true', ...
    'vibration_rms_x_true','vibration_order_1x_true', ...
    'vibration_rms_x_bearing_proxy_true','vibration_order_1x_bearing_proxy_true', ...
    'battery_voltage_true','battery_current_true','alternator_power_true'}, ...
    health_names', {'sensor_fault_active_cht_c3','imep_cov_c1','vibration_order_2x_true'}];

groundtruth = table(gt_vars{:}, 'VariableNames', gt_names);

meta = meta_in;
meta.n_rows = n;
meta.duration_s = t_end;
meta.export_rate_hz = rate;
meta.generated_at_note = 'stamp actual wall-clock time when writing files, not here (Date.now-style calls avoided in this function)';
end
