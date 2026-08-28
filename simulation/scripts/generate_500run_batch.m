% generate_500run_batch.m
% Driver for the ~500-mission review batch requested for external
% verification. Run headless: matlab -batch "run('generate_500run_batch.m')"
%
% Fleet composition: 11 fault classes (healthy + 10 physical) x 3 onset/rate
% draws x 3 manufacturing-seed replicates = 99 units, 5 missions each ->
% 495 total missions. More onset draws and missions/unit than the earlier
% 22-mission sanity batch specifically so severity actually progresses
% through the staged healthy->gradual->accelerated curve within a unit's
% own mission sequence, not just healthy-vs-one-snapshot.

cd(fileparts(mfilename('fullpath')));
addpath(pwd);
addpath(fullfile(pwd,'..','model'));

rng(2026);
fleet = generate_fleet(3, 3); % 99 units
for i = 1:numel(fleet)
    fleet(i).n_missions = 5;
    if ~strcmp(fleet(i).fault_class,'healthy')
        % spread onset across a realistic range, keep gradual/accel spans
        % randomized per-unit as generate_fleet.m already draws them
    end
end

fprintf('=== 500-run batch: %d units x 5 missions = %d total missions ===\n', ...
    numel(fleet), numel(fleet)*5);

out_dir = fullfile(pwd, '..', '..', 'data', 'processed', 'review_batch_500');
opts = struct('format','csv', 'max_missions', Inf);

tic;
run_fleet_missions(fleet, out_dir, opts);
fprintf('=== BATCH COMPLETE: %.1f hours total ===\n', toc/3600);
