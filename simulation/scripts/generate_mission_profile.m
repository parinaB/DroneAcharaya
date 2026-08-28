function profile = generate_mission_profile(shape, opts)
% GENERATE_MISSION_PROFILE  Build a full mission's throttle/altitude/ISA-offset
% breakpoint profile for engine_core's From Workspace input blocks.
%
% profile = generate_mission_profile(shape, opts)
%   shape : one of the five build_plan.md Step 6 mission shapes, all
%           implemented: long_loiter, short_patrol, high_altitude_transit,
%           hot_day_ground_ops, high_throttle_climb_heavy.
%   opts  : struct of optional overrides -- see the getopt(...) calls below
%           for each shape's specific defaults. Universal (all shapes):
%           .weather_isa_offset_c   (default 0; NOT applied to
%                                    hot_day_ground_ops, which keeps its own
%                                    deliberate +30C regardless)
%           .throttle_jitter_sigma  (default 0 = off)
%           .throttle_jitter_tau_s  (default 8) -- OU correlation time
%           Typically produced by sample_mission_params.m from one row of an
%           LHS design, not hand-set -- see that function for the actual
%           per-shape sampling ranges used for batch generation.
%
% Returns profile.throttle / .altitude / .isa_offset, each an [N x 2]
% [time_s, value] breakpoint matrix, directly assignable to the
% MissionThrottle/MissionAltitude/MissionIsaOffset workspace variables that
% engine_core's From Workspace blocks read. profile.throttle is DENSE (fine
% uniform grid, not sparse breakpoints) whenever jitter is applied, since an
% OU process needs to be evaluated on its own fine grid, not just at the
% original phase-boundary breakpoints.

if nargin < 2
    opts = struct();
end
getopt = @(f,d) subsref_default(opts, f, d);
opts.weather_isa_offset_c  = getopt('weather_isa_offset_c', 0);
opts.throttle_jitter_sigma = getopt('throttle_jitter_sigma', 0);
opts.throttle_jitter_tau_s = getopt('throttle_jitter_tau_s', 8);
if ~isfield(opts,'cruise_altitude_m'), opts.cruise_altitude_m = 3000; end
if ~isfield(opts,'loiter_duration_s'), opts.loiter_duration_s = 4200; end
if ~isfield(opts,'loiter_throttle'),   opts.loiter_throttle   = 0.5;  end

switch shape
    case 'long_loiter'
        alt = opts.cruise_altitude_m;
        thr = opts.loiter_throttle;

        % [time_s, throttle]
        % Idle throttle is 0.14, not an arbitrary low value: engine_core's
        % torque-balance loop only sustains ~800rpm idle (its own IC) above
        % ~0.13 throttle -- below that, torque can't overcome friction and
        % RPM decays toward zero (and doesn't recover, since no starter-
        % motor/cranking torque is modeled). The start ramp below is
        % deliberately FAST (0->idle_throttle over 3s, not a slow climb from
        % zero) to stand in for an unmodeled starter-motor crank event --
        % engine_core has no cranking-torque model, so a slow throttle ramp
        % from zero just stalls the engine before it ever reaches a
        % self-sustaining throttle level.
        idle_throttle = 0.14;
        t_start_end   = 3;
        t_climb_start = 90;
        t_climb_end   = 390;
        t_cruise_end  = 600;
        t_loiter_end  = t_cruise_end + opts.loiter_duration_s;
        t_descent_end = t_loiter_end + 300;
        t_idle2_end   = t_descent_end + 60;
        t_shutdown    = t_idle2_end + 60;

        profile.throttle = [
            0,               0.0;
            t_start_end,     idle_throttle;   % fast start ramp (crank stand-in)
            t_climb_start,   idle_throttle;   % idle warm-up
            t_climb_end,     0.85;            % climb
            t_cruise_end,    0.65;             % short transit to loiter station
            t_loiter_end,    thr;              % sustained loiter
            t_descent_end,   0.18;             % descent
            t_idle2_end,     idle_throttle;    % idle before shutdown
            t_shutdown,      0.0 ];

        profile.altitude = [
            0,               0;
            t_climb_start,   0;
            t_climb_end,     alt;
            t_loiter_end,    alt;
            t_descent_end,   0;
            t_shutdown,      0 ];

        profile.isa_offset = [
            0,          0;
            t_shutdown, 0 ];

        profile.duration_s = t_shutdown;

        % engine_state per telemetry-schema.yaml's enum, keyed to these SAME
        % breakpoints (not re-derived from signal thresholds elsewhere) so
        % state labeling can never drift out of sync with the profile that
        % actually drove the sim. {start_s, end_s, state_label}
        profile.phases = { ...
            0,             t_start_end,   'STARTING'; ...
            t_start_end,   t_climb_start, 'IDLE'; ...
            t_climb_start, t_climb_end,   'CLIMB'; ...
            t_climb_end,   t_cruise_end,  'CRUISE'; ...
            t_cruise_end,  t_loiter_end,  'LOITER'; ...
            t_loiter_end,  t_descent_end, 'DESCENT'; ...
            t_descent_end, t_idle2_end,   'IDLE'; ...
            t_idle2_end,   t_shutdown,    'SHUTDOWN' };

        % representative (phase-midpoint-ish) timestamps for the sidecar
        % per-phase burst invocation (run_sidecar_burst.m) -- kept alongside
        % the profile so callers don't hand-guess these against the
        % breakpoints above. sidecar_seed_spans gives the matching [start,end]
        % time range each seed point's resulting features should be painted
        % across in the exporter -- explicit, not re-derived from profile.phases
        % index positions (which differ shape to shape).
        profile.sidecar_seed_points = struct( ...
            'idle',    (t_start_end+t_climb_start)/2, ...
            'climb',   t_climb_end - 5, ...
            'loiter',  t_cruise_end + opts.loiter_duration_s/2, ...
            'descent', t_loiter_end + 150);
        profile.sidecar_seed_spans = struct( ...
            'idle',    [t_start_end,   t_climb_start], ...
            'climb',   [t_climb_start, t_climb_end], ...
            'loiter',  [t_cruise_end,  t_loiter_end], ...
            'descent', [t_loiter_end,  t_descent_end]);

    case 'short_patrol'
        alt = getopt('patrol_altitude_m', 1500);        % lower-altitude local patrol, not a long-range transit
        patrol_thr = getopt('patrol_throttle', 0.55);
        patrol_duration_s = getopt('patrol_duration_s', 900); % 15 min station time -- short vs. long_loiter's 70 min

        idle_throttle = 0.14;    % see long_loiter's note on why this floor exists
        t_start_end   = 3;
        t_climb_start = 60;
        t_climb_end   = 240;     % faster climb to a lower altitude
        t_patrol_end  = t_climb_end + patrol_duration_s;
        t_descent_end = t_patrol_end + 180;
        t_idle2_end   = t_descent_end + 45;
        t_shutdown    = t_idle2_end + 45;

        profile.throttle = [
            0,              0.0;
            t_start_end,    idle_throttle;
            t_climb_start,  idle_throttle;
            t_climb_end,    0.75;
            t_patrol_end,   patrol_thr;
            t_descent_end,  0.18;
            t_idle2_end,    idle_throttle;
            t_shutdown,     0.0 ];

        profile.altitude = [
            0,              0;
            t_climb_start,  0;
            t_climb_end,    alt;
            t_patrol_end,   alt;
            t_descent_end,  0;
            t_shutdown,     0 ];

        profile.isa_offset = [0, 0; t_shutdown, 0];
        profile.duration_s = t_shutdown;

        profile.phases = { ...
            0,             t_start_end,   'STARTING'; ...
            t_start_end,   t_climb_start, 'IDLE'; ...
            t_climb_start, t_climb_end,   'CLIMB'; ...
            t_climb_end,   t_patrol_end,  'LOITER'; ...
            t_patrol_end,  t_descent_end, 'DESCENT'; ...
            t_descent_end, t_idle2_end,   'IDLE'; ...
            t_idle2_end,   t_shutdown,    'SHUTDOWN' };

        profile.sidecar_seed_points = struct( ...
            'idle',    (t_start_end+t_climb_start)/2, ...
            'climb',   t_climb_end - 5, ...
            'loiter',  t_climb_end + patrol_duration_s/2, ...
            'descent', t_patrol_end + 90);
        profile.sidecar_seed_spans = struct( ...
            'idle',    [t_start_end,  t_climb_start], ...
            'climb',   [t_climb_start,t_climb_end], ...
            'loiter',  [t_climb_end,  t_patrol_end], ...
            'descent', [t_patrol_end, t_descent_end]);

    case 'high_altitude_transit'
        % Turbo/boost/cold-intake behavior test: climb HIGH (near the demo
        % mission's own stated 25,000ft/~7600m) and hold there, exercising the
        % turbo altitude-compensation headroom built in Step 2/4
        % (turbo_degradation's discriminator is explicitly altitude-dependent).
        alt = getopt('transit_altitude_m', 7600);
        transit_thr = getopt('transit_throttle', 0.6);
        transit_duration_s = getopt('transit_duration_s', 1800); % 30 min at altitude

        idle_throttle = 0.14;
        t_start_end   = 3;
        t_climb_start = 60;
        t_climb_end   = 900;      % slow, sustained climb to a much higher ceiling
        t_transit_end = t_climb_end + transit_duration_s;
        t_descent_end = t_transit_end + 600; % longer descent from altitude
        t_idle2_end   = t_descent_end + 60;
        t_shutdown    = t_idle2_end + 60;

        profile.throttle = [
            0,              0.0;
            t_start_end,    idle_throttle;
            t_climb_start,  idle_throttle;
            t_climb_end,    0.9;         % sustained high-power climb
            t_transit_end,  transit_thr;
            t_descent_end,  0.16;
            t_idle2_end,    idle_throttle;
            t_shutdown,     0.0 ];

        profile.altitude = [
            0,              0;
            t_climb_start,  0;
            t_climb_end,    alt;
            t_transit_end,  alt;
            t_descent_end,  0;
            t_shutdown,     0 ];

        profile.isa_offset = [0, 0; t_shutdown, 0];
        profile.duration_s = t_shutdown;

        profile.phases = { ...
            0,             t_start_end,   'STARTING'; ...
            t_start_end,   t_climb_start, 'IDLE'; ...
            t_climb_start, t_climb_end,   'CLIMB'; ...
            t_climb_end,   t_transit_end, 'HIGH_ALTITUDE_CRUISE'; ...
            t_transit_end, t_descent_end, 'DESCENT'; ...
            t_descent_end, t_idle2_end,   'IDLE'; ...
            t_idle2_end,   t_shutdown,    'SHUTDOWN' };

        profile.sidecar_seed_points = struct( ...
            'idle',    (t_start_end+t_climb_start)/2, ...
            'climb',   t_climb_end - 5, ...
            'loiter',  t_climb_end + transit_duration_s/2, ... % "loiter" field name kept for exporter compatibility -- this is the high-altitude cruise segment
            'descent', t_transit_end + 300);
        profile.sidecar_seed_spans = struct( ...
            'idle',    [t_start_end,   t_climb_start], ...
            'climb',   [t_climb_start, t_climb_end], ...
            'loiter',  [t_climb_end,   t_transit_end], ...
            'descent', [t_transit_end, t_descent_end]);

    case 'hot_day_ground_ops'
        % Cooling-margin stress test: mostly ground idle/run-up at a hot-day
        % ISA deviation, no meaningful altitude change. No CLIMB/CRUISE/LOITER
        % phase exists for this shape -- it never leaves the ground.
        hot_isa_offset = getopt('hot_isa_offset_c', 30); % ISA+30C, a standard hot-day stress convention -- NOT
                                                           % the universal weather_isa_offset_c draw; this shape's
                                                           % whole point is the deliberate extreme, not day-to-day variance
        runup_thr = getopt('runup_throttle', 0.7);
        runup_duration_s = getopt('runup_duration_s', 300); % 5 min high-throttle ground run-up

        idle_throttle = 0.14;
        t_start_end    = 3;
        t_preidle_end  = 300;  % 5 min extended ground idle before run-up (heat soak)
        t_runup_end    = t_preidle_end + runup_duration_s;
        t_postidle_end = t_runup_end + 300; % cool-down idle after run-up
        t_shutdown     = t_postidle_end + 60;

        profile.throttle = [
            0,               0.0;
            t_start_end,     idle_throttle;
            t_preidle_end,   idle_throttle;
            t_runup_end,     runup_thr;
            t_postidle_end,  idle_throttle;
            t_shutdown,      0.0 ];

        profile.altitude = [0, 0; t_shutdown, 0];  % ground ops -- altitude never changes
        profile.isa_offset = [0, hot_isa_offset; t_shutdown, hot_isa_offset];
        profile.duration_s = t_shutdown;

        % No dedicated "ground run-up" engine_state exists in telemetry-
        % schema.yaml's enum -- IDLE is the closest honest label for the whole
        % ground-ops sequence (throttle level, not engine_state, carries the
        % run-up signal here).
        profile.phases = { ...
            0,              t_start_end,    'STARTING'; ...
            t_start_end,    t_shutdown,     'IDLE' };

        profile.sidecar_seed_points = struct( ...
            'idle',    (t_start_end+t_preidle_end)/2, ...
            'climb',   t_preidle_end + runup_duration_s/2, ... % run-up segment, reusing the 'climb' field name for exporter compatibility
            'loiter',  t_preidle_end + runup_duration_s/2, ...
            'descent', t_postidle_end - 30);
        profile.sidecar_seed_spans = struct( ...
            'idle',    [t_start_end,   t_preidle_end], ...
            'climb',   [t_preidle_end, t_runup_end], ...
            'loiter',  [t_preidle_end, t_runup_end], ...
            'descent', [t_runup_end,   t_postidle_end]);

    case 'high_throttle_climb_heavy'
        % Peak-torque/RPM fault-signature test (e.g. ring wear affecting peak
        % power): a SCRIPTED 0->100% throttle-slam event, not incidental
        % jitter -- rapid throttle transients are a named required test case.
        alt = getopt('climb_altitude_m', 4000);
        slam_hold_thr = getopt('slam_hold_throttle', 0.98);
        slam_hold_duration_s = getopt('slam_hold_duration_s', 600); % 10 min sustained near-max-power climb

        idle_throttle = 0.14;
        t_start_end   = 3;
        t_climb_start = 60;
        t_slam_start  = t_climb_start;
        t_slam_end    = t_slam_start + 2;      % 0.14->0.98 in 2s: a genuine slam
        t_hold_end    = t_slam_end + slam_hold_duration_s;
        t_descent_end = t_hold_end + 240;
        t_idle2_end   = t_descent_end + 45;
        t_shutdown    = t_idle2_end + 45;

        profile.throttle = [
            0,              0.0;
            t_start_end,    idle_throttle;
            t_slam_start,   idle_throttle;
            t_slam_end,     slam_hold_thr;   % the slam itself
            t_hold_end,     slam_hold_thr;
            t_descent_end,  0.18;
            t_idle2_end,    idle_throttle;
            t_shutdown,     0.0 ];

        profile.altitude = [
            0,              0;
            t_slam_start,   0;
            t_hold_end,     alt;   % climbing throughout the high-power hold
            t_descent_end,  0;
            t_shutdown,     0 ];

        profile.isa_offset = [0, 0; t_shutdown, 0];
        profile.duration_s = t_shutdown;

        profile.phases = { ...
            0,             t_start_end,   'STARTING'; ...
            t_start_end,   t_slam_start,  'IDLE'; ...
            t_slam_start,  t_slam_end,    'THROTTLE_TRANSIENT'; ...
            t_slam_end,    t_hold_end,    'CLIMB'; ...
            t_hold_end,    t_descent_end, 'DESCENT'; ...
            t_descent_end, t_idle2_end,   'IDLE'; ...
            t_idle2_end,   t_shutdown,    'SHUTDOWN' };

        profile.sidecar_seed_points = struct( ...
            'idle',    (t_start_end+t_slam_start)/2, ...
            'climb',   t_hold_end - 5, ...
            'loiter',  t_slam_end + slam_hold_duration_s/2, ... % mid-hold, reusing 'loiter' field name for exporter compatibility
            'descent', t_hold_end + 120);
        profile.sidecar_seed_spans = struct( ...
            'idle',    [t_start_end,  t_slam_start], ...
            'climb',   [t_slam_end,   t_hold_end], ...
            'loiter',  [t_slam_end,   t_hold_end], ...
            'descent', [t_hold_end,   t_descent_end]);

    otherwise
        error('generate_mission_profile:unimplementedShape', ...
            'Mission shape "%s" not yet implemented -- only long_loiter exists so far.', shape);
end

%% ---- universal post-processing: weather + throttle jitter -----------------
% Applied identically regardless of shape, so each shape's case above only
% needs to define its own nominal (noise-free) profile.
if ~strcmp(shape, 'hot_day_ground_ops') && opts.weather_isa_offset_c ~= 0
    profile.isa_offset(:,2) = profile.isa_offset(:,2) + opts.weather_isa_offset_c;
end

if opts.throttle_jitter_sigma > 0
    dt_fine = 1.0; % 1s grid for the OU process -- fine enough for a smooth,
                    % slowly-varying pilot/autopilot-style perturbation
    t_fine = (0:dt_fine:profile.duration_s)';
    nominal = interp1(profile.throttle(:,1), profile.throttle(:,2), t_fine, 'linear', 'extrap');
    jitter = ou_process(t_fine, opts.throttle_jitter_sigma, opts.throttle_jitter_tau_s);
    % Jitter only applies where nominal throttle is comfortably above the
    % ~0.13 idle-sustaining floor (see long_loiter's note on that threshold)
    % -- i.e. genuine in-flight/hold segments, not the scripted start ramp,
    % idle warm-up, or shutdown ramp. An autopilot wouldn't inject throttle
    % noise during those scripted transitions anyway, and doing so here
    % risks tipping an already-marginal idle/ramp region into a stall that
    % has nothing to do with the fault being tested.
    jitter(nominal < 0.3) = 0;
    jittered = min(max(nominal + jitter, 0), 1);
    profile.throttle = [t_fine, jittered];
end
end

function v = subsref_default(s, field, default)
if isfield(s, field)
    v = s.(field);
else
    v = default;
end
end

function x = ou_process(t, sigma, tau_s)
% Discrete-time-exact Ornstein-Uhlenbeck process, zero mean, stationary std
% = sigma, correlation time = tau_s. NOT i.i.d. noise -- see build_plan.md
% Step 6's explicit call for throttle jitter as "a smooth OU/AR(1) process".
n = numel(t);
x = zeros(n,1);
if n < 2
    return
end
dt = diff(t);
x(1) = sigma*randn();
for k = 2:n
    a = exp(-dt(k-1)/tau_s);
    x(k) = x(k-1)*a + sigma*sqrt(1-a^2)*randn();
end
end
