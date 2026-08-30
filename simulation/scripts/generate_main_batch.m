% generate_main_batch.m
% Main dataset-generation batch, following the validated design from
% generate_short_batch.m (which passed verify_batch.m with 0 FAIL/0 WARN
% across 97 missions) -- same onset/gradual/accel/n_missions ranges, just
% n_onset_draws raised from 1 to 4 for real onset-TIME diversity across the
% batch (not just mission-shape/manufacturing-tolerance diversity), per the
% "4 different batches" discussion -- one coherent fleet design rather than
% 4 separately-seeded re-runs of the same single onset point.
%
% Fleet: 11 fault classes (healthy + 10) x 4 onset draws x 3 seed replicates
% = 1 + 10*4*3 = healthy gets 3 replicates (skips onset draws), the other 10
% classes get 4*3=12 units each -> 3 + 120 = 123 units, ~8-10 missions each
% -> ~1100 total missions.
%
% Checkpointed via run_fleet_missions.m's completed.log -- if this process
% is interrupted for any reason, just re-run this same script and it will
% skip already-completed missions and continue from where it left off.

cd(fileparts(mfilename('fullpath')));
addpath(pwd);
addpath(fullfile(pwd,'..','model'));

rng(7777);
fleet_opts = struct( ...
    'n_missions_range',   [8, 10], ...
    'onset_hours_range',  [0.3, 1.0], ...
    'gradual_span_range', [0.4, 0.8], ...
    'accel_span_range',   [0.2, 0.5]);
fleet = generate_fleet(4, 3, fleet_opts); % 4 onset draws x 3 seed replicates

total_missions = sum([fleet.n_missions]);
fprintf('=== main batch: %d units, %d total missions ===\n', numel(fleet), total_missions);

out_dir = fullfile(pwd, '..', '..', 'data', 'processed', 'main_batch_1000');
opts = struct('format','csv', 'max_missions', Inf);

tic;
run_fleet_missions(fleet, out_dir, opts);
fprintf('=== BATCH COMPLETE: %.1f hours total ===\n', toc/3600);
