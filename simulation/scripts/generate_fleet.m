function fleet = generate_fleet(n_onset_draws, n_seed_replicates, opts)
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
% fleet = generate_fleet(n_onset_draws, n_seed_replicates, opts)
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
%   opts.n_missions_range      (default [20,50], per build_plan.md)
%   opts.onset_hours_range     (default [20,200]) -- MUST be sized so a
%                              unit's expected lifetime (n_missions x
%                              average mission duration) can actually
%                              reach onset before it runs out of missions.
%                              Defaults assume the [20,50]-mission budget
%                              above (missions average roughly 0.5-1h, so
%                              20-50 missions gives ~15-50h of life -- onset
%                              up to 200h would never fire for the SHORTER
%                              end of that range either; see the built-in
%                              sanity check below, which is exactly the kind
%                              of mismatch that shipped an entire batch of
%                              zero-severity "faulted" missions once already
%                              (docs/build_plan.md's Step 6 log).
%   opts.gradual_span_range    (default [60,100])
%   opts.accel_span_range      (default [10,25])
%
% Returns a struct array, one row per unit.

if nargin < 1, n_onset_draws = 5; end
if nargin < 2, n_seed_replicates = 6; end
if nargin < 3, opts = struct(); end
if ~isfield(opts,'n_missions_range'),   opts.n_missions_range   = [20,50]; end
if ~isfield(opts,'onset_hours_range'),  opts.onset_hours_range  = [20,200]; end
if ~isfield(opts,'gradual_span_range'), opts.gradual_span_range = [60,100]; end
if ~isfield(opts,'accel_span_range'),   opts.accel_span_range   = [10,25]; end

% Pre-flight sanity check: a unit's SHORTEST possible lifetime (its minimum
% n_missions draw x the shortest shape's typical mission duration) must be
% able to reach the LARGEST onset_hours draw, or that combination of units
% can NEVER show any degradation at all -- exactly the bug that silently
% produced an all-zero-severity batch once (see build_plan.md's Step 6 log).
% ~0.25h is hot_day_ground_ops's rough duration, the shortest of the 5 shapes.
min_lifetime_hours = opts.n_missions_range(1) * 0.25;
if opts.onset_hours_range(2) > min_lifetime_hours
    warning('generate_fleet:onsetMayNeverFire', ...
        ['onset_hours_range max (%.1fh) exceeds the shortest-shape worst-case ' ...
         'unit lifetime (%.1fh = %d missions x ~0.25h/mission). Units drawing ' ...
         'both the largest onset AND the smallest n_missions AND the shortest ' ...
         'mission shape will show zero degradation for their entire life. ' ...
         'Narrow onset_hours_range or widen n_missions_range/mission-shape mix.'], ...
        opts.onset_hours_range(2), min_lifetime_hours, opts.n_missions_range(1));
end

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
            oh = opts.onset_hours_range; gs = opts.gradual_span_range; as = opts.accel_span_range;
            onset_hours  = oh(1) + (od-1)/max(n_draws_this_class-1,1) * (oh(2)-oh(1));
            gradual_span = gs(1) + (gs(2)-gs(1))*rand();
            accel_span   = as(1) + (as(2)-as(1))*rand();
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
            u.n_missions = randi(opts.n_missions_range);

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
