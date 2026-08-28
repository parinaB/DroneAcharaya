function split = assign_split(fault_class, mission_index, n_missions_this_unit, train_frac)
% ASSIGN_SPLIT  Deterministic train/validation assignment for one mission,
% grouped by run (a whole mission goes to exactly one split -- never split
% within a mission's own rows) and stratified by fault_class, per
% ml/evaluation/README.md's "split by run, not by row" / "stratify the
% grouping" rules.
%
%   fault_class            : this unit's fault class (string) -- kept as an
%                             argument for future stratification refinement
%                             (e.g. adding severity-band awareness) even
%                             though the current rule doesn't branch on it.
%   mission_index           : 1-based index of this mission within its unit
%                             (e.g. M001 -> 1, M002 -> 2, ...).
%   n_missions_this_unit    : total missions this unit flies.
%   train_frac              : (optional, default 0.8) target train fraction.
%
% Returns 'train' or 'validation'. Deterministic (same inputs -> same
% split) so re-running or resuming a batch never reshuffles an
% already-assigned run.
%
% V1 simplification: no held-out 'test' split yet (the user asked for two
% folders, train and validation) and no severity-band stratification (the
% sanity batches so far are too small per fault class for that to be
% meaningful) -- both are natural extensions once a larger batch exists,
% following the same grouped-by-run_id principle.

if nargin < 4, train_frac = 0.8; end

if n_missions_this_unit <= 1
    split = 'train'; % nothing to hold out from a single-mission unit
    return
end

% n_val evenly-spaced mission indices go to validation, the rest to train.
% max(1,...) rather than a strict round(n*(1-train_frac)): a straight
% proportional split rounds to ZERO validation missions for any unit with
% only a couple of missions (e.g. a small sanity batch), which would leave
% that unit's fault class with no held-out coverage at all -- every fault
% class having SOME validation representation matters more here than
% hitting the exact train_frac ratio when n is small.
n_val = max(1, round(n_missions_this_unit * (1 - train_frac)));
val_step = n_missions_this_unit / n_val;
val_indices = round((1:n_val) * val_step);

if any(mission_index == val_indices)
    split = 'validation';
else
    split = 'train';
end
end
