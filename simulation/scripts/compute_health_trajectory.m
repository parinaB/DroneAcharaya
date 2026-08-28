function value = compute_health_trajectory(convention, onset_hours, accumulated_hours, gradual_span_hours, accel_span_hours)
% COMPUTE_HEALTH_TRAJECTORY  Staged healthy-hold -> gradual -> accelerated
% degradation curve (build_plan.md Step 6: "staged healthy-hold -> gradual
% -> accelerated rather than one decay curve"), evaluated at a given amount
% of accumulated engine hours.
%
%   convention : '_health' (1.0=healthy -> 0.0=failed) or '_deg' (0.0=healthy
%                -> 1.0=failed) -- per health-parameter-registry.md's two
%                conventions. Determines which direction "damage" maps to.
%   onset_hours          : accumulated hours at which degradation begins.
%                          Before this, value is exactly the healthy value.
%   accumulated_hours    : this unit's total accumulated engine hours RIGHT
%                          NOW (a function of engine hours, not calendar
%                          time or mission count -- per the plan's own
%                          explicit requirement).
%   gradual_span_hours   : duration of the slow initial degradation phase
%                          (onset -> 30% damage).
%   accel_span_hours     : duration of the faster end-of-life phase (30%
%                          damage -> 100% damage), strictly shorter than
%                          gradual_span_hours for a realistic wear curve
%                          (slow creep, then rapid failure), not enforced
%                          here but expected of the caller's draws.
%
% Returns the actual health-parameter VALUE (not a damage fraction) --
% already oriented per `convention`, ready to assign straight into an Eng.*
% field or a groundtruth row.

t = accumulated_hours - onset_hours;
if t <= 0
    damage = 0;
elseif t < gradual_span_hours
    damage = 0.3 * (t / gradual_span_hours);
elseif t < gradual_span_hours + accel_span_hours
    damage = 0.3 + 0.7 * (t - gradual_span_hours) / accel_span_hours;
else
    damage = 1.0;
end

switch convention
    case '_health'
        value = 1.0 - damage;
    case '_deg'
        value = damage;
    otherwise
        error('compute_health_trajectory:badConvention', ...
            'convention must be ''_health'' or ''_deg'', got "%s"', convention);
end
end
