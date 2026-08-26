# simulation/

MATLAB / Simulink physics model of the MALE UAV piston engine that generates the
synthetic telemetry the ML layer trains on. No MATLAB source is committed yet —
this tree currently holds structure and reference documentation only.

| Folder | Holds |
| --- | --- |
| `model/` | Simulink plant models (`.slx`) |
| `scripts/` | MATLAB drivers and export scripts (`.m`) |
| `calibration/` | Engine parameter references (markdown / CSV) |
| `fault_injection/` | Fault ramp definitions (`.m` / `.json`) |
