function run_fleet_missions(fleet, out_dir, opts)
% RUN_FLEET_MISSIONS  Orchestration loop: for each unit in fleet, fly its
% assigned n_missions (each an instance of the unit's assigned mission
% shape, with fresh LHS-sampled continuous parameters), computing the
% staged health trajectory at each mission's start from the unit's
% accumulated engine hours, and exporting each mission via
% export_mission_to_schema.m.
%
% SEQUENTIAL, not parfor: no Parallel Computing Toolbox on this install.
% This is a real cost, not a stylistic choice -- see build_plan.md's Step 6
% compute-time note. Revisit if/when the toolbox is available.
%
% STRUCTURED OUTPUT LAYOUT (under out_dir):
%   train/telemetry/<run_id>.<ext>              validation/telemetry/<run_id>.<ext>
%   train/groundtruth/<run_id>_groundtruth.<ext> validation/groundtruth/<run_id>_groundtruth.<ext>
%   meta/<run_id>.meta.json                      (both splits together -- see data/README.md)
%   completed.log, errors.log                    (batch-level bookkeeping, at out_dir root)
% Split assignment is per-mission via assign_split.m -- grouped by run (a
% mission's rows never straddle train/validation), stratified by fault_class.
%
% Checkpointed: completed run_ids are appended to <out_dir>/completed.log
% as they finish, so an interrupted batch can be resumed by skipping any
% run_id already in that file. Per-mission failures are caught and logged
% to <out_dir>/errors.log with the run_id and error message -- one bad
% mission does not abort the whole batch.
%
% opts fields (all optional):
%   .format          'parquet' (default) or 'csv' -- output file format.
%                    Switch to 'csv' once the pipeline is fully validated;
%                    parquet is easier to inspect/debug with parquetread
%                    during development.
%   .max_missions    cap on TOTAL missions run across the whole fleet, for
%                    a quick validation pass without committing to the
%                    full multi-hour sweep (default Inf = no cap).
%   .export_rate_hz  passed through to export_mission_to_schema (default 1)
%   .train_frac      passed through to assign_split (default 0.8)

if nargin < 3, opts = struct(); end
if ~isfield(opts,'format'), opts.format = 'parquet'; end
if ~isfield(opts,'max_missions'), opts.max_missions = Inf; end
if ~isfield(opts,'export_rate_hz'), opts.export_rate_hz = 1; end
if ~isfield(opts,'train_frac'), opts.train_frac = 0.8; end

for d = {'train/telemetry','train/groundtruth','validation/telemetry','validation/groundtruth','meta'}
    dd = fullfile(out_dir, d{1});
    if ~exist(dd,'dir'), mkdir(dd); end
end
meta_dir = fullfile(out_dir, 'meta');
completed_log = fullfile(out_dir, 'completed.log');
errors_log = fullfile(out_dir, 'errors.log');
completed = {};
if exist(completed_log,'file')
    fid = fopen(completed_log,'r');
    completed = textscan(fid,'%s'); completed = completed{1};
    fclose(fid);
end

run(fullfile(fileparts(mfilename('fullpath')), '..', 'model', 'AeroDieselEngineParameters.m'));
Eng_nominal = Eng; %#ok<NODEF>
load_system('engine_core');
load_system('crank_resolved_sidecar');
reg = fault_class_registry();

n_run = 0;
for ui = 1:numel(fleet)
    unit = fleet(ui);
    accumulated_hours = 0;

    lhs = simple_lhs(unit.n_missions, 5); % 5 covers every shape's dimension count so far

    for mi = 1:unit.n_missions
        run_id = sprintf('%s_M%03d', unit.unit_id, mi);
        if n_run >= opts.max_missions
            fprintf('reached max_missions cap (%d), stopping.\n', opts.max_missions);
            return
        end
        if any(strcmp(completed, run_id))
            % already done in a prior (interrupted) run -- still need to
            % advance accumulated_hours for this unit's later missions, so
            % re-derive this mission's duration cheaply from its own
            % metadata sidecar rather than re-simulating.
            mfile = fullfile(meta_dir, [run_id '.meta.json']);
            if exist(mfile,'file')
                m = jsondecode(fileread(mfile));
                accumulated_hours = accumulated_hours + m.duration_s/3600;
            end
            continue
        end

        try
            Eng = Eng_nominal; %#ok<NASGU>
            Eng = apply_manufacturing_tolerance(Eng, unit.manufacturing_seed);

            % ---- theta at this mission's start ---------------------------
            theta = struct('injector_health_c1',1,'injector_health_c2',1, ...
                'injector_health_c3',1,'injector_health_c4',1,'cooling_health',1, ...
                'oil_pump_health',1,'bearing_health',1,'turbo_efficiency_deg',0, ...
                'combustion_stability',0,'injection_timing_deg',0,'fuel_delivery_health',1, ...
                'alternator_health',1,'misfire_rate_c1',0,'misfire_rate_c2',0, ...
                'misfire_rate_c3',0,'misfire_rate_c4',0);

            if ~strcmp(unit.fault_class,'healthy')
                ridx = find(strcmp(reg(:,1), unit.fault_class));
                target = reg{ridx,2}; convention = reg{ridx,3}; theta_field = reg{ridx,5};
                val = compute_health_trajectory(convention, unit.onset_hours, ...
                    accumulated_hours, unit.gradual_span_hours, unit.accel_span_hours);
                if contains(target,'%d')
                    target = sprintf(target, unit.affected_cylinder);
                end
                if contains(theta_field,'%d')
                    theta_field = sprintf(theta_field, unit.affected_cylinder);
                end
                if startsWith(target,'Eng.')
                    fieldname = extractAfter(target,'Eng.');
                    Eng.(fieldname) = val; %#ok<NASGU>
                end
                if isfield(theta, theta_field)
                    theta.(theta_field) = val;
                end
            end
            assignin('base','Eng',Eng);

            % ---- mission profile ------------------------------------------
            mopts = sample_mission_params(unit.mission_shape, lhs(mi,:));
            profile = generate_mission_profile(unit.mission_shape, mopts);

            assignin('base','MissionThrottle', profile.throttle);
            assignin('base','MissionAltitude', profile.altitude);
            assignin('base','MissionIsaOffset', profile.isa_offset);
            set_param('engine_core','Solver','ode23t','SolverType','Variable-step', ...
                'StopTime', num2str(profile.duration_s));
            simOut = sim('engine_core');

            % ---- sidecar bridge, one burst per phase -----------------------
            t = simOut.get('rpm_out').Time;
            rpm = simOut.get('rpm_out').Data;
            fuel = simOut.get('fuel_flow_out').Data;
            map_out = simOut.get('map_out').Data;
            inj_timing = simOut.get('inj_timing_out').Data;
            names = fieldnames(profile.sidecar_seed_points);
            phase_features = struct();
            misfire_vec = [theta.misfire_rate_c1, theta.misfire_rate_c2, ...
                theta.misfire_rate_c3, theta.misfire_rate_c4];
            for pi = 1:numel(names)
                ph = names{pi};
                idx = find(t >= profile.sidecar_seed_points.(ph), 1);
                seed = struct('rpm',rpm(idx),'fuel_flow_kg_h',fuel(idx), ...
                    'map_kpa',map_out(idx),'injection_timing_deg',inj_timing(idx), ...
                    'misfire_rate',misfire_vec,'combustion_stability',theta.combustion_stability);
                phase_features.(ph) = run_sidecar_burst(seed, Eng);
            end

            % ---- sensor fault activation for this mission ------------------
            sensor_fault = struct('channel', unit.sensor_fault_channel, ...
                'type', unit.sensor_fault_type, 'onset_s', inf);
            if ~strcmp(unit.sensor_fault_type,'NONE') && ...
                    accumulated_hours*3600 + profile.duration_s > unit.sensor_fault_onset_hours*3600
                onset_s = max(0, unit.sensor_fault_onset_hours*3600 - accumulated_hours*3600);
                sensor_fault.onset_s = onset_s;
            end

            % ---- export ------------------------------------------------------
            split = assign_split(unit.fault_class, mi, unit.n_missions, opts.train_frac);

            meta_in = struct();
            meta_in.run_id = run_id;
            meta_in.engine_id = unit.unit_id;
            meta_in.mission_id = sprintf('%s-M%03d', unit.mission_shape, mi);
            meta_in.mission_shape = unit.mission_shape;
            meta_in.fault_class = unit.fault_class;
            meta_in.split = split;
            meta_in.accumulated_hours_at_start = accumulated_hours;
            meta_in.health = theta;
            meta_in.sensor_fault = sensor_fault;
            meta_in.sidecar_seed_points_used = phase_features;
            meta_in.export_rate_hz = opts.export_rate_hz;

            [telemetry, groundtruth, meta] = export_mission_to_schema(simOut, profile, phase_features, meta_in);

            telemetry_dir = fullfile(out_dir, split, 'telemetry');
            groundtruth_dir = fullfile(out_dir, split, 'groundtruth');
            if strcmp(opts.format,'csv')
                writetable(telemetry, fullfile(telemetry_dir, [run_id '.csv']));
                writetable(groundtruth, fullfile(groundtruth_dir, [run_id '_groundtruth.csv']));
            else
                parquetwrite(fullfile(telemetry_dir, [run_id '.parquet']), telemetry);
                parquetwrite(fullfile(groundtruth_dir, [run_id '_groundtruth.parquet']), groundtruth);
            end
            fid = fopen(fullfile(meta_dir, [run_id '.meta.json']), 'w');
            fprintf(fid, '%s', jsonencode(meta, 'PrettyPrint', true));
            fclose(fid);

            fid = fopen(completed_log,'a'); fprintf(fid,'%s\n', run_id); fclose(fid);
            n_run = n_run + 1;
            accumulated_hours = accumulated_hours + profile.duration_s/3600;
            fprintf('[%d] %s OK (shape=%s, fault=%s, split=%s, acc_hrs=%.1f)\n', ...
                n_run, run_id, unit.mission_shape, unit.fault_class, split, accumulated_hours);

        catch ME
            fid = fopen(errors_log,'a');
            fprintf(fid, '%s: %s\n', run_id, ME.message);
            fclose(fid);
            fprintf('[FAILED] %s: %s\n', run_id, ME.message);
            % still advance accumulated_hours (using the profile if it got
            % far enough to exist, else a rough guess) so this unit's LATER
            % missions aren't thrown off by one failure
            if exist('profile','var') && isfield(profile,'duration_s')
                accumulated_hours = accumulated_hours + profile.duration_s/3600;
            else
                accumulated_hours = accumulated_hours + 1.5; % rough fallback guess
            end
        end
    end
end
end
