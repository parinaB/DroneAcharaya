% regenerate_unit52_remainder.m
% Several units in generate_main_batch.m's fleet showed a severe per-mission
% slowdown (many minutes to 1hr+ instead of seconds) reproducibly WITHIN one
% long-running MATLAB -batch session, even though disk space, CPU activity,
% and the exact same mission reproduced FRESH all check out fine (verified
% directly: UNIT-mechanicalvibration-0052_M008's exact seed values, run in a
% fresh context, completed in under 30s). The pattern points at Simulink's
% growing per-session .dmr signal-logging temp file -- mechanical_vibration
% is the heaviest per-mission logger (multiple crank-resolved bursts), so its
% .dmr grows fastest within one session, and processing MANY of its missions
% back-to-back in one session is exactly what triggers the slowdown.
%
% FIX: this script now regenerates ONE UNIT PER INVOCATION (not all 13 in one
% session), so no single session's .dmr ever grows large enough to matter.
% Set `only_unit_idx` in the base workspace before calling run() on this file
% (see regenerate_remainder_driver.sh, which loops over every affected unit,
% launching a fresh `matlab -batch` process for each one).
%
% Skip points differ per unit (NOT uniformly "M006"):
%   UNIT-mechanicalvibration-0052..0059: M006 onward (stalled at M006 originally)
%   UNIT-mechanicalvibration-0060:       M003 onward (stalled earlier than the rest)
%   UNIT-mechanicalvibration-0061..0063: M001 onward (skipped entirely, pre-emptively)
%   UNIT-fuelstarvation-0090:            M003 onward (stalled during autonomous monitoring)
% All of these are being retried now (including 0052's M006/M007, previously
% accepted as permanent gaps before the real cause was understood) since the
% per-unit-fresh-session fix should let them complete like M008 did.

cd(fileparts(mfilename('fullpath')));
addpath(pwd);
addpath(fullfile(pwd,'..','model'));

out_dir = fullfile(pwd, '..', '..', 'data', 'processed', 'main_batch_1000');
completed_log = fullfile(out_dir, 'completed.log');

rng(7777);
fleet_opts = struct( ...
    'n_missions_range',   [8, 10], ...
    'onset_hours_range',  [0.3, 1.0], ...
    'gradual_span_range', [0.4, 0.8], ...
    'accel_span_range',   [0.2, 0.5]);
fleet_full = generate_fleet(4, 3, fleet_opts);

skip_from = containers.Map('KeyType','double','ValueType','double');
for idx = 52:59, skip_from(idx) = 6; end
skip_from(60) = 3;
skip_from(61) = 1;
skip_from(62) = 1;
skip_from(63) = 1;
skip_from(90) = 3;  % UNIT-fuelstarvation-0090

if ~exist('only_unit_idx','var')
    error('regenerate_unit52_remainder:noTarget', ...
        'Set only_unit_idx in the base workspace before running (one unit per invocation -- see regenerate_remainder_driver.sh).');
end
if ~isKey(skip_from, only_unit_idx)
    error('regenerate_unit52_remainder:badTarget', 'only_unit_idx=%d is not one of the affected units.', only_unit_idx);
end

i = only_unit_idx;
u = fleet_full(i);
from_mi = skip_from(i);
fake_ids = {};
for mi = from_mi:u.n_missions
    fake_ids{end+1} = sprintf('%s_M%03d', u.unit_id, mi); %#ok<AGROW>
end
fprintf('=== backfilling %s from M%03d (n_missions=%d) ===\n', u.unit_id, from_mi, u.n_missions);
fprintf('%d fake run_ids to remove from completed.log\n', numel(fake_ids));

fid = fopen(completed_log,'r');
lines = textscan(fid,'%s'); lines = lines{1};
fclose(fid);
keep = ~ismember(lines, fake_ids);
fprintf('removing %d matching entries (expect close to %d)\n', sum(~keep), numel(fake_ids));

fid = fopen(completed_log,'w');
for k = 1:numel(lines)
    if keep(k), fprintf(fid,'%s\n', lines{k}); end
end
fclose(fid);

opts = struct('format','csv', 'max_missions', Inf);
tic;
run_fleet_missions(u, out_dir, opts);
fprintf('=== %s backfill complete: %.1f min ===\n', u.unit_id, toc/60);
