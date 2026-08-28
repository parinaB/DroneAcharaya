function fleet = generate_fleet(n_onset_draws, n_seed_replicates)
% GENERATE_FLEET  Build the full list of unit specs per build_plan.md Step 6:
% each unit = one physical fault mode (or healthy) + one onset-time/
% degradation-rate draw + one assigned mission shape + a manufacturing-
% tolerance seed. Sensor faults and per-mission continuous parameters are
% NOT assigned here -- sensor faults are drawn independently per unit
% below (so the model can't learn a spurious fault<->sensor-fault
% correlation), and per-mission continuous parameters (weather, jitter,
% phase durations) are drawn fresh per MISSION, not per unit, by
% run_fleet_missions.m calling sample_mission_params.m.
%
% fleet = generate_fleet(n_onset_draws, n_seed_replicates)
%   n_onset_draws      : distinct onset-time/degradation-rate combinations
%                        per faulted class (default 5, per build_plan.md's
%                        own "~5 onset/rate draws" budget language).
%   n_seed_replicates  : manufacturing-tolerance seed replicates per
%                        onset/rate draw (default 6, mid-point of the
%                        plan's "~5-8" range). Healthy units get
%                        n_onset_draws*n_seed_replicates replicates too
%                        (skipping the onset/rate draw itself, per the
%                        plan: "healthy units skip the onset/rate draw --
%                        just the seed replicates").
%
% Returns a struct array, one row per unit.

if nargin < 1, n_onset_draws = 5; end
if nargin < 2, n_seed_replicates = 6; end

reg = fault_class_registry();
fault_classes = ['healthy'; reg(:,1)];
shapes = {'long_loiter','short_patrol','high_altitude_transit', ...
    'hot_day_ground_ops','high_throttle_climb_heavy'};

fleet = struct([]);
uid = 0;
for fc = 1:numel(fault_classes)
    fault_class = fault_classes{fc};
    is_healthy = strcmp(fault_class, 'healthy');
    n_draws_this_class = 1; if ~is_healthy, n_draws_this_class = n_onset_draws; end

    ridx = find(strcmp(reg(:,1), fault_class));
    per_cyl = false;
    if ~isempty(ridx), per_cyl = reg{ridx,4}; end

    for od = 1:n_draws_this_class
        if is_healthy
            onset_hours = NaN; gradual_span = NaN; accel_span = NaN;
        else
            % onset spread across a representative unit lifetime; gradual
            % phase notably longer than the accelerated end-of-life phase
            % (slow creep, then fast failure), per build_plan.md's staging.
            onset_hours  = 20 + (od-1)/max(n_draws_this_class-1,1) * 180; % 20..200h
            gradual_span = 60  + 40*rand();   % 60-100h slow phase
            accel_span   = 10  + 15*rand();   % 10-25h fast end-of-life phase
        end

        for sr = 1:n_seed_replicates
            uid = uid + 1;
            u = struct();
            u.unit_id = sprintf('UNIT-%s-%04d', regexprep(fault_class,'_',''), uid);
            u.fault_class = fault_class;
            u.affected_cylinder = NaN;
            if per_cyl, u.affected_cylinder = randi(4); end
            u.mission_shape = shapes{randi(numel(shapes))};
            u.onset_hours = onset_hours;
            u.gradual_span_hours = gradual_span;
            u.accel_span_hours = accel_span;
            u.manufacturing_seed = randn(); % small std-normal draw; consumed by
                                              % apply_manufacturing_tolerance.m
            u.n_missions = randi([20,50]);

            % Independent sensor-fault draw (per build_plan.md: drawn
            % independently of both physical fault and shape). Only cht_c3
            % is corruptible right now (engine_core's one real Xv/Xs split).
            sf_types = {'NONE','BIAS','DRIFT','NOISE','STUCK','DROPOUT'};
            u.sensor_fault_channel = 'cht_c3';
            u.sensor_fault_type = sf_types{randi(numel(sf_types))};
            u.sensor_fault_onset_hours = NaN;
            if ~strcmp(u.sensor_fault_type,'NONE')
                u.sensor_fault_onset_hours = 10 + 190*rand();
            end

            if isempty(fleet), fleet = u; else, fleet(end+1) = u; end %#ok<AGROW>
        end
    end
end
end
