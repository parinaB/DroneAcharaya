% generate_short_batch.m
% Short validation batch for the two fixes made after review_batch_500's
% verification caught real problems: (1) onset_hours/gradual_span/accel_span
% were drawn in a range (20-200h) that no unit flying only 5 missions could
% ever reach, so every "faulted" mission showed zero severity; (2)
% high_altitude_transit's altitude range (up to 9000m) pushed EGT past 1200C
% in the model's unvalidated territory. Both are fixed in generate_fleet.m
% and sample_mission_params.m respectively.
%
% Deliberately SHORT (11 units x 8-10 missions ~= 99 missions, roughly an
% hour) to validate the fixes quickly before committing to another
% multi-hour batch -- do not scale this up until verify_batch.m comes back
% clean on this run.

cd(fileparts(mfilename('fullpath')));
addpath(pwd);
addpath(fullfile(pwd,'..','model'));

rng(4242);
fleet_opts = struct( ...
    'n_missions_range',   [8, 10], ...
    'onset_hours_range',  [0.3, 1.0], ...
    'gradual_span_range', [0.4, 0.8], ...
    'accel_span_range',   [0.2, 0.5]);
fleet = generate_fleet(1, 1, fleet_opts); % 11 units (healthy + 10 classes), 1 onset draw, 1 seed replicate

total_missions = sum([fleet.n_missions]);
fprintf('=== short validation batch: %d units, %d total missions ===\n', numel(fleet), total_missions);

out_dir = fullfile(pwd, '..', '..', 'data', 'processed', 'validation_batch_short2');
opts = struct('format','csv', 'max_missions', Inf);

tic;
run_fleet_missions(fleet, out_dir, opts);
fprintf('=== BATCH COMPLETE: %.1f min total ===\n', toc/60);
