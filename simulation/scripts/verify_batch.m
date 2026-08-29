function findings = verify_batch(batch_dir)
% VERIFY_BATCH  Automated sanity check for one data/processed/<batch_name>
% batch. Reads every meta.json (both splits), loads the matching telemetry
% + groundtruth files, and runs a battery of checks:
%
%   A. Data integrity     -- NaN/Inf where not expected, row counts, time monotonicity
%   B. Physical bounds    -- RPM/power/temperature/pressure/altitude limits,
%                            anchored to contract/parameter-source-table.csv's
%                            published EASA TCDS values where one exists
%   C. Cross-signal consistency -- map = ambient+boost, power = torque*rpm formula
%   D. Fault-signature correctness -- for each mission's assigned fault_class,
%                            check the SPECIFIC discriminator failure-mode-
%                            matrix.csv defines is actually present (not just
%                            "no NaN" -- does the fault actually show up)
%   E. Batch-level stats   -- per-fault-class mission counts, severity spread
%
% Each finding is {severity, run_id, check, message} with severity one of
% 'FAIL' (should never happen -- a real bug), 'WARN' (deserves a human look,
% may be an intentional design choice), 'INFO' (aggregate stats, not a
% problem). Prints a summary and also writes verification_report.md into
% batch_dir so it can be handed to someone else alongside the data.
%
% findings = verify_batch('E:\...\data\processed\sanity_batch_001')

meta_dir = fullfile(batch_dir, 'meta');
files = dir(fullfile(meta_dir, '*.meta.json'));
findings = {}; % rows: {severity, run_id, check, message}

% class-level accumulators for category E
class_counts = containers.Map();
class_severities = containers.Map();

for i = 1:numel(files)
    m = jsondecode(fileread(fullfile(meta_dir, files(i).name)));
    run_id = m.run_id;
    split = m.split;
    tpath = fullfile(batch_dir, split, 'telemetry', [run_id '.csv']);
    gpath = fullfile(batch_dir, split, 'groundtruth', [run_id '_groundtruth.csv']);
    if ~exist(tpath,'file') || ~exist(gpath,'file')
        findings(end+1,:) = {'FAIL', run_id, 'A_missing_files', 'telemetry or groundtruth CSV missing for this meta.json'}; %#ok<AGROW>
        continue
    end
    T = readtable(tpath);
    G = readtable(gpath);

    %% ---- A. integrity ----------------------------------------------------
    always_present = {'t','rpm','torque','power','cht_c1','cht_c2','cht_c3','cht_c4', ...
        'egt_c1','egt_c2','egt_c3','egt_c4','oil_pressure','oil_temperature','fuel_flow', ...
        'coolant_temperature','altitude','ambient_pressure'};
    for c = 1:numel(always_present)
        v = T.(always_present{c});
        if any(isnan(v)) || any(isinf(v))
            findings(end+1,:) = {'FAIL', run_id, 'A_nan_inf', sprintf('%s has NaN/Inf where it should always be defined', always_present{c})}; %#ok<AGROW>
        end
    end
    if any(diff(T.t) <= 0)
        findings(end+1,:) = {'FAIL', run_id, 'A_time_monotonic', 't column is not strictly increasing'}; %#ok<AGROW>
    end
    expected_rows = round(m.duration_s * m.export_rate_hz) + 1;
    if abs(height(T) - expected_rows) > 1
        findings(end+1,:) = {'WARN', run_id, 'A_row_count', sprintf('expected ~%d rows, got %d', expected_rows, height(T))}; %#ok<AGROW>
    end
    vib_cols = {'vibration_rms_x','vibration_order_1x'};
    for c = 1:numel(vib_cols)
        frac_nan = mean(isnan(T.(vib_cols{c})));
        if frac_nan >= 0.999
            findings(end+1,:) = {'WARN', run_id, 'A_vibration_all_nan', sprintf('%s is NaN for the entire mission -- sidecar never covered any phase', vib_cols{c})}; %#ok<AGROW>
        end
    end

    %% ---- B. physical bounds ------------------------------------------------
    if max(T.rpm) > 4220 + 20
        findings(end+1,:) = {'FAIL', run_id, 'B_rpm_overspeed', sprintf('max rpm %.1f exceeds published redline 4220', max(T.rpm))}; %#ok<AGROW>
    end
    if max(T.power) > 140
        findings(end+1,:) = {'FAIL', run_id, 'B_power', sprintf('max power %.1fkW implausible (rated 123.5kW)', max(T.power))}; %#ok<AGROW>
    end
    if max(T.oil_temperature) > 145
        findings(end+1,:) = {'FAIL', run_id, 'B_oil_temp', sprintf('max oil_temperature %.1fC exceeds TCDS hard max 140C', max(T.oil_temperature))}; %#ok<AGROW>
    end
    if max(T.coolant_temperature) > 112
        findings(end+1,:) = {'FAIL', run_id, 'B_coolant_temp', sprintf('max coolant_temperature %.1fC exceeds TCDS hard max 105C', max(T.coolant_temperature))}; %#ok<AGROW>
    end
    for c = {'egt_c1','egt_c2','egt_c3','egt_c4'}
        if max(T.(c{1})) > 1200
            findings(end+1,:) = {'FAIL', run_id, 'B_egt', sprintf('max %s %.1fC implausible', c{1}, max(T.(c{1})))}; %#ok<AGROW>
        end
    end
    if any(T.oil_pressure < -0.05)
        findings(end+1,:) = {'FAIL', run_id, 'B_oil_pressure_negative', sprintf('min oil_pressure %.2f bar is negative', min(T.oil_pressure))}; %#ok<AGROW>
    end
    if max(T.altitude) > 15000 || min(T.altitude) < -10
        findings(end+1,:) = {'FAIL', run_id, 'B_altitude', sprintf('altitude range [%.0f,%.0f]m implausible', min(T.altitude), max(T.altitude))}; %#ok<AGROW>
    elseif max(T.altitude) > 5490
        findings(end+1,:) = {'INFO', run_id, 'B_altitude_above_ceiling', sprintf('max altitude %.0fm exceeds published 5490m ceiling -- expected/deliberate for high_altitude_transit (turbo headroom stress test), not a bug', max(T.altitude))}; %#ok<AGROW>
    end

    %% ---- C. cross-signal consistency ---------------------------------------
    map_check = T.ambient_pressure + T.boost_pressure*100;
    if max(abs(T.map - map_check)) > 1.0
        findings(end+1,:) = {'FAIL', run_id, 'C_map_consistency', sprintf('max |map - (ambient+boost)| = %.2fkPa, expected ~0', max(abs(T.map-map_check)))}; %#ok<AGROW>
    end
    power_check = T.torque .* T.rpm * 2*pi/60/1000;
    if max(abs(T.power - power_check)) > 0.01
        findings(end+1,:) = {'FAIL', run_id, 'C_power_formula', 'power column does not match torque*rpm*2pi/60/1000'}; %#ok<AGROW>
    end

    %% ---- D. fault-signature correctness -------------------------------------
    fc = m.fault_class;
    egt = [T.egt_c1, T.egt_c2, T.egt_c3, T.egt_c4];
    es = string(T.engine_state);
    steady = es=="LOITER" | es=="CRUISE" | es=="HIGH_ALTITUDE_CRUISE";
    if ~any(steady), steady = true(height(T),1); end % fall back to whole mission if no steady phase
    egt_spread = max(egt(steady,:),[],2) - min(egt(steady,:),[],2);
    max_egt_spread = max(egt_spread);

    severity = NaN;
    switch fc
        case 'healthy'
            if max_egt_spread > 15
                findings(end+1,:) = {'FAIL', run_id, 'D_healthy_clean', sprintf('healthy unit shows %.1fC per-cylinder EGT spread -- should be ~0', max_egt_spread)}; %#ok<AGROW>
            end
            if any(~isnan(T.vibration_order_1x)) && max(T.vibration_order_1x,[],'omitnan') > 5
                findings(end+1,:) = {'WARN', run_id, 'D_healthy_vibration', sprintf('healthy unit shows order_1x=%.2f, expected near-zero', max(T.vibration_order_1x,[],'omitnan'))}; %#ok<AGROW>
            end

        case 'injector_degradation'
            sev = 1 - min([m.health.injector_health_c1, m.health.injector_health_c2, ...
                m.health.injector_health_c3, m.health.injector_health_c4]);
            severity = sev;
            if sev > 0.15 && max_egt_spread < 20
                findings(end+1,:) = {'FAIL', run_id, 'D_injector_signature', sprintf('injector_health degraded (severity=%.2f) but per-cylinder EGT spread only %.1fC -- fault not showing up', sev, max_egt_spread)}; %#ok<AGROW>
            end

        case 'injection_timing_drift'
            severity = m.health.injection_timing_deg;
            if severity > 0.3 && max_egt_spread > 30
                findings(end+1,:) = {'WARN', run_id, 'D_timing_drift_uniformity', sprintf('injection_timing_drift should move ALL cylinders together (small spread) but spread=%.1fC', max_egt_spread)}; %#ok<AGROW>
            end

        case 'fuel_starvation'
            severity = 1 - m.health.fuel_delivery_health;
            cap = m.health.fuel_delivery_health * 28.0 * 1.05;
            if max(T.fuel_flow) > cap
                findings(end+1,:) = {'FAIL', run_id, 'D_fuel_starvation_cap', sprintf('max fuel_flow %.2fkg/h exceeds health-scaled cap %.2f', max(T.fuel_flow), cap)}; %#ok<AGROW>
            end

        case 'alternator_degradation'
            severity = 1 - m.health.alternator_health;
            cap = m.health.alternator_health * 2.0 * 1.10;
            if max(T.alternator_power) > cap
                findings(end+1,:) = {'WARN', run_id, 'D_alternator_cap', sprintf('max alternator_power %.2fkW exceeds health-scaled cap %.2f', max(T.alternator_power), cap)}; %#ok<AGROW>
            end

        case 'lubrication_degradation'
            severity = 1 - m.health.oil_pump_health;
            cap = m.health.oil_pump_health * 2.7;
            if max(T.oil_pressure) > cap
                findings(end+1,:) = {'WARN', run_id, 'D_oil_pump_cap', sprintf('max oil_pressure %.2fbar exceeds health-scaled reference %.2f', max(T.oil_pressure), cap)}; %#ok<AGROW>
            end

        case 'combustion_instability'
            severity = m.health.combustion_stability;
            cov = G.imep_cov_c1(~isnan(G.imep_cov_c1));
            if severity > 0.3 && (isempty(cov) || max(cov) < 0.02)
                findings(end+1,:) = {'FAIL', run_id, 'D_combustion_instability_signature', sprintf('combustion_stability=%.2f but imep_cov_c1 max=%s -- fault not visible', severity, mat2str(iif(isempty(cov),NaN,max(cov))))}; %#ok<AGROW>
            end

        case 'misfire'
            severity = max([m.health.misfire_rate_c1, m.health.misfire_rate_c2, ...
                m.health.misfire_rate_c3, m.health.misfire_rate_c4]);
            o1 = T.vibration_order_1x(~isnan(T.vibration_order_1x));
            if severity > 0.2 && (isempty(o1) || max(o1) < 2)
                findings(end+1,:) = {'FAIL', run_id, 'D_misfire_signature', sprintf('misfire_rate=%.2f but vibration_order_1x max=%s -- fault not visible', severity, mat2str(iif(isempty(o1),NaN,max(o1))))}; %#ok<AGROW>
            end

        case 'mechanical_vibration'
            severity = 1 - m.health.bearing_health;
            % checks vibration_order_1x_bearing_proxy (mean-value proxy,
            % continuous, driven directly by bearing_health) -- NOT
            % vibration_order_1x (the sidecar's crank-resolved reading,
            % which only reflects misfire/combustion_instability, not
            % bearing_health; see export_mission_to_schema.m's note).
            if ~ismember('vibration_order_1x_bearing_proxy', T.Properties.VariableNames)
                findings(end+1,:) = {'FAIL', run_id, 'D_bearing_signature', 'vibration_order_1x_bearing_proxy column missing -- re-export with the current export_mission_to_schema.m'}; %#ok<AGROW>
            else
                % Threshold is deliberately tiny (not a fixed physical
                % magnitude): this signal scales with (RPM/rated_rpm)^2 per
                % parameter-source-table.csv, so a low-throttle mission
                % (e.g. hot_day_ground_ops) can legitimately show a much
                % smaller value than a high-power one even at the same
                % severity -- what matters here is "nonzero at all", not a
                % specific magnitude. Use a comparative check across the
                % batch (does severity correlate with proxy magnitude) for
                % a stronger signal than this per-mission threshold gives.
                proxy = T.vibration_order_1x_bearing_proxy(~isnan(T.vibration_order_1x_bearing_proxy));
                if severity > 0.2 && (isempty(proxy) || max(proxy) < 1e-4)
                    findings(end+1,:) = {'FAIL', run_id, 'D_bearing_signature', sprintf('bearing_health degraded (severity=%.2f) but vibration_order_1x_bearing_proxy max=%s (expected nonzero)', severity, mat2str(iif(isempty(proxy),NaN,max(proxy))))}; %#ok<AGROW>
                end
            end

        case 'cooling_degradation'
            severity = 1 - m.health.cooling_health;
            % no clean reference-free check without a matched healthy baseline
            % at the same conditions -- flag for manual/comparative review
            % rather than asserting a specific numeric threshold here.
            findings(end+1,:) = {'INFO', run_id, 'D_cooling_needs_comparison', sprintf('severity=%.2f, max coolant_temperature=%.1fC -- verify by comparing against a healthy unit of the SAME mission_shape/conditions', severity, max(T.coolant_temperature))}; %#ok<AGROW>

        case 'turbo_degradation'
            severity = m.health.turbo_efficiency_deg;
            findings(end+1,:) = {'INFO', run_id, 'D_turbo_needs_comparison', sprintf('severity=%.2f, max boost_pressure=%.2fbar at max altitude=%.0fm -- verify altitude-dependence by comparing across altitude, not a single-mission threshold', severity, max(T.boost_pressure), max(T.altitude))}; %#ok<AGROW>
    end

    if ~isKey(class_counts, fc), class_counts(fc) = 0; class_severities(fc) = []; end
    class_counts(fc) = class_counts(fc) + 1;
    if ~isnan(severity), class_severities(fc) = [class_severities(fc), severity]; end
end

%% ---- E. batch-level stats -----------------------------------------------
% no_comparison_classes never accumulate a severity list at all (see the
% switch above -- cooling_degradation/turbo_degradation push an INFO finding
% per-mission instead of setting `severity`), so an empty list there is
% expected, not a bug. For every OTHER faulted class, an all-zero (or
% otherwise degenerate) severity spread across EVERY mission means onset
% never fired for a single mission of that class in this whole batch --
% exactly the bug that shipped an entire mislabeled batch once (see
% docs/build_plan.md's Step 6 log) -- so that case is a hard FAIL, not an INFO.
no_comparison_classes = {'healthy','cooling_degradation','turbo_degradation'};
classes = keys(class_counts);
for i = 1:numel(classes)
    c = classes{i};
    sevs = class_severities(c);
    if isempty(sevs)
        if ismember(c, no_comparison_classes)
            findings(end+1,:) = {'INFO', 'BATCH', 'E_class_coverage', sprintf('%s: %d missions, no severity spread (healthy or not applicable)', c, class_counts(c))}; %#ok<AGROW>
        else
            findings(end+1,:) = {'FAIL', 'BATCH', 'E_class_coverage', sprintf('%s: %d missions but NO severity values recorded at all -- check the fault_class_registry/theta wiring for this class', c, class_counts(c))}; %#ok<AGROW>
        end
    elseif max(sevs) < 0.02 && ~ismember(c, no_comparison_classes)
        findings(end+1,:) = {'FAIL', 'BATCH', 'E_class_coverage', sprintf('%s: %d missions, severity range [%.2f, %.2f] -- onset never fired for ANY mission of this class; check onset_hours vs. n_missions x mission-duration (see generate_fleet.m)', c, class_counts(c), min(sevs), max(sevs))}; %#ok<AGROW>
    else
        findings(end+1,:) = {'INFO', 'BATCH', 'E_class_coverage', sprintf('%s: %d missions, severity range [%.2f, %.2f]', c, class_counts(c), min(sevs), max(sevs))}; %#ok<AGROW>
    end
end

%% ---- print + write report -------------------------------------------------
n_fail = sum(strcmp(findings(:,1),'FAIL'));
n_warn = sum(strcmp(findings(:,1),'WARN'));
n_info = sum(strcmp(findings(:,1),'INFO'));
fprintf('\n=== verify_batch: %s ===\n', batch_dir);
fprintf('%d missions checked. FAIL=%d WARN=%d INFO=%d\n\n', numel(files), n_fail, n_warn, n_info);
for i = 1:size(findings,1)
    fprintf('[%s] %-35s %-28s %s\n', findings{i,1}, findings{i,2}, findings{i,3}, findings{i,4});
end

report_path = fullfile(batch_dir, 'verification_report.md');
fid = fopen(report_path, 'w');
fprintf(fid, '# Verification report: %s\n\n', batch_dir);
fprintf(fid, '%d missions checked. **FAIL=%d WARN=%d INFO=%d**\n\n', numel(files), n_fail, n_warn, n_info);
fprintf(fid, '| Severity | Run | Check | Message |\n|---|---|---|---|\n');
for i = 1:size(findings,1)
    fprintf(fid, '| %s | %s | %s | %s |\n', findings{i,1}, findings{i,2}, findings{i,3}, findings{i,4});
end
fclose(fid);
fprintf('\nreport written to %s\n', report_path);
end

function v = iif(cond, a, b)
if cond, v = a; else, v = b; end
end
