% generate_sensor_fault_demo_batch.m
% Supplementary batch specifically demonstrating the 5 real sensor-fault
% types (BIAS/DRIFT/NOISE/STUCK/DROPOUT) correctly -- see
% docs/sensor_fault_injection_fix_plan.md for the full bug writeup. The
% original main_batch_1000 assigned these types across its 1111 missions,
% but three real bugs (onset timing miscalibrated, severity never wired,
% DROPOUT mislabeled to the wrong channel) meant only 1 mission out of 1111
% ever actually showed a corrupted signal. All three are now fixed in
% generate_fleet.m/run_fleet_missions.m/export_mission_to_schema.m, plus a
% missing clean-groundtruth-tap fix in engine_core.slx.
%
% Rather than regenerate the full 1111-mission batch (sensor-fault is
% independent of physical fault_class, so the other missions' physical
% trajectories don't need touching), this generates NEW healthy-baseline
% units -- fault_class='healthy', so the classifier gets the cleanest
% possible discriminative signal -- each FORCED to one of the 5 real types
% (not left to the 1-in-6 random draw, to guarantee coverage), with
% naturally-randomized onset timing per replicate. Seeds into the SAME
% data/processed/main_batch_1000 folder as new run_ids.

cd(fileparts(mfilename('fullpath')));
addpath(pwd);
addpath(fullfile(pwd,'..','model'));

out_dir = fullfile(pwd, '..', '..', 'data', 'processed', 'main_batch_1000');

rng(31415);
fleet_opts = struct( ...
    'n_missions_range',   [8, 10], ...
    'onset_hours_range',  [0.3, 1.0], ...
    'gradual_span_range', [0.4, 0.8], ...
    'accel_span_range',   [0.2, 0.5]);

n_replicates_per_type = 8;
types = {'BIAS','DRIFT','NOISE','STUCK','DROPOUT'};
avg_duration_h = containers.Map( ...
    {'hot_day_ground_ops','high_throttle_climb_heavy','short_patrol', ...
     'high_altitude_transit','long_loiter'}, ...
    {0.266, 0.289, 0.391, 0.947, 1.370});
shapes = {'long_loiter','short_patrol','high_altitude_transit', ...
    'hot_day_ground_ops','high_throttle_climb_heavy'};

demo_units = struct([]);
uid = 0;
for ti = 1:numel(types)
    for r = 1:n_replicates_per_type
        uid = uid + 1;
        u = struct();
        u.unit_id = sprintf('UNIT-sensorfaultdemo%s-%04d', lower(types{ti}), uid);
        u.fault_class = 'healthy';
        u.affected_cylinder = NaN;
        u.mission_shape = shapes{randi(numel(shapes))};
        u.onset_hours = NaN; u.gradual_span_hours = NaN; u.accel_span_hours = NaN;
        u.manufacturing_seed = randn();
        u.n_missions = randi(fleet_opts.n_missions_range);

        u.sensor_fault_type = types{ti};
        if strcmp(types{ti}, 'DROPOUT')
            u.sensor_fault_channel = 'vibration_rms_x_bearing_proxy';
        else
            u.sensor_fault_channel = 'cht_c3';
        end
        est_total_hours = u.n_missions * avg_duration_h(u.mission_shape);
        switch types{ti}
            case 'DRIFT'
                u.sensor_fault_onset_hours = 0.1*est_total_hours + 0.2*est_total_hours*rand();
            case 'DROPOUT'
                u.sensor_fault_onset_hours = 0.2*est_total_hours + 0.6*est_total_hours*rand();
                u.sensor_fault_dropout_duration_s = 30 + 90*rand();
            otherwise
                u.sensor_fault_onset_hours = 0.2*est_total_hours + 0.6*est_total_hours*rand();
        end
        if ~isfield(u, 'sensor_fault_dropout_duration_s')
            u.sensor_fault_dropout_duration_s = NaN;
        end

        if isempty(demo_units), demo_units = u; else, demo_units(end+1) = u; end %#ok<AGROW>
    end
end

fprintf('=== generating %d sensor-fault demo units (%d per type x %d types) ===\n', ...
    numel(demo_units), n_replicates_per_type, numel(types));
opts = struct('format','csv', 'max_missions', Inf);

tic;
run_fleet_missions(demo_units, out_dir, opts);
fprintf('=== sensor-fault demo batch complete: %.1f min ===\n', toc/60);
