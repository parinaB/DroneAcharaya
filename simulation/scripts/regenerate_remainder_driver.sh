#!/bin/bash
# regenerate_remainder_driver.sh
# Launches regenerate_unit52_remainder.m once per affected unit, each in a
# completely fresh matlab -batch process, so no single session's Simulink
# .dmr signal-logging temp file ever accumulates enough to trigger the
# per-session slowdown pattern (see regenerate_unit52_remainder.m's header).
#
# Units: 52-63 (mechanical_vibration remainders) + 90 (fuel_starvation remainder)

cd "$(dirname "$0")"
MATLAB="/c/Program Files/MATLAB/R2026a/bin/matlab.exe"
UNITS="52 53 54 55 56 57 58 59 60 61 62 63 90"

for u in $UNITS; do
    echo "=== unit $u: starting fresh MATLAB session ===" >> regenerate_remainder_log.txt
    "$MATLAB" -batch "only_unit_idx=$u; run('regenerate_unit52_remainder.m')" >> regenerate_remainder_log.txt 2>&1
    echo "=== unit $u: session exited ===" >> regenerate_remainder_log.txt
done

echo "=== ALL UNITS BACKFILL COMPLETE ===" >> regenerate_remainder_log.txt
