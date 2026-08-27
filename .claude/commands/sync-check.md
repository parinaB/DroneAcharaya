---
description: Verify parameter/schema consistency between MVEM output, ML input expectations, and Unreal input expectations
---

Cross-check that the telemetry/parameter contract is actually consistent
across every consumer, not just documented as if it were. Read, don't
assume — every claim below must be backed by actually opening the file.

1. **Canonical schema**: read `contract/telemetry-schema.yaml` (if present
   and past draft) or `data/schema.md` (current source of truth per root
   `CLAUDE.md`) — list every field name, type, and unit.
2. **MVEM side**: check `simulation/scripts/` export logic and
   `simulation/fault_injection/` fault-type strings against that list.
   Flag any column the simulation would emit that isn't in the schema, or
   vice versa.
3. **ML side**: check `ml/features/feature_engineering.py` and each
   `ml/training/*/train.py` for the column names / health-parameter names
   they expect on read, against `contract/health-parameter-registry.md` and
   the schema. Flag drift.
4. **Backend/frontend side**: check `backend/app/modules/ingestion/` mapping
   and `frontend/lib/types.ts` (the `TelemetrySample`/`FaultType` types)
   against the schema and the documented alias table in `data/schema.md`.
   Flag anything that isn't one of the six sanctioned aliases.
5. **Unreal side**: if `unreal/` (or wherever it eventually lives) exists,
   check what fields/endpoints it consumes against the backend API contract.
   If it doesn't exist yet, say so — nothing to check.
6. Report as a table: field/parameter name → schema says → each consumer
   says → MATCH or MISMATCH. End with a short list of concrete fixes needed,
   referencing exact file paths and line numbers. Do not edit any files
   unless asked — this command reports, it doesn't fix.
