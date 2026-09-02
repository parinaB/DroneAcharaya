# backend/ — bridge, DB, API (Step 9)

Integration & presentation layer. See root [`CLAUDE.md`](../CLAUDE.md) for
the full build plan and cross-subsystem data flow; this file covers what's
actually built here and the conventions for extending it.

## What lives here

| Path | Holds |
| --- | --- |
| [`app/bridge/`](app/bridge/) | The Step 9 bridge itself — where frames come from, how they're paced, how they're broadcast. |
| [`app/db/`](app/db/) | SQLAlchemy models + the write path (the recorder — see below). |
| [`migrations/`](migrations/) | Alembic migrations. Driven by `app.core.config.Settings.database_url`, not a hardcoded URL in `alembic.ini`. |
| [`app/modules/replay/`](app/modules/replay/) | Session lifecycle (start/stop/status/latest) wrapping the bridge. |
| [`app/modules/inference/`](app/modules/inference/) | `HealthScoreOut` — `lstm_rul`'s health+RUL heads and `xgboost_classifier`'s sensor-fault fields once each model's own rolling window fills, `autoencoder`'s row-level anomaly score on every scoreable frame, ground-truth stand-in / `null` before/without that (or if an artifact isn't present). |
| [`app/modules/advisory/`](app/modules/advisory/) | Explicit placeholder — no rule set exists anywhere in the repo yet. |
| [`app/modules/ingestion/`](app/modules/ingestion/) | Reports bridge/session state. Only means "current live feed health" once a real ECU source exists — right now it's just replay activity. |
| [`app/core/`](app/core/) | Settings (env-driven), logging, `model_loader.py` (loads `lstm_rul`, `xgboost_classifier`, and `autoencoder`; `digital_twin` remains `NotImplementedError` via `load_model()`'s generic dispatch since it's only ever consumed as a dependency of the autoencoder's residual features via `ml/features/feature_engineering.py`'s own cached loader, never loaded standalone). |

## Architecture

**The bridge (`app/bridge/`) is built around one seam**: `sources.py`'s
`FrameSource` protocol. `BridgeService` (`service.py`) depends only on that
protocol — never on CSVs or a live feed specifically. `ReplaySource` is the
only implementation that exists: it reads a run's telemetry CSV row-by-row,
paced to real time by the row's own `t` deltas × a `speed` multiplier, and
stamps `data_origin=REPLAY`. A future `LiveEcuSource` implements the same
protocol and swaps in via config with **zero change** to `BridgeService`,
the DB write path, or the API — that's the literal "seam where Simulink
engine later swaps to real ECU" from `docs/build_plan.md`'s Step 9.

**The DB write path (`app/db/writer.py`) *is* the recorder.** There's no
separate recording component — every frame, live or replayed, goes through
`write_telemetry()` on its way into `telemetry` table, so recording is a
free side effect of normal operation, not something bolted on. `can_framing.py`
is explicitly stubbed (`NotImplementedError`, same pattern as
`model_loader.py`) since no live CAN-bus ECU source exists to frame yet —
don't build this speculatively; wire it when a real source needs it.

**Inference runs the real `lstm_rul` model once a session's rolling window
fills, and falls back to a ground-truth stand-in before that (Phase 7).**
`BridgeService` keeps the last `LSTM_SEQ_LEN` (60) frames in memory per
session; `app/modules/inference/service.py`'s `get_health_score()` runs
`EngineMultiHeadLSTM`'s health + RUL heads once that window is full
(offloaded via `asyncio.to_thread` so a forward pass never blocks the
bridge's event loop), producing `fault_type`/`health_index` via the same
worst-column-wins aggregation `HEALTH_COLUMNS` uses for ground truth, just
fed the model's predicted 16 health values instead. Before the window fills
(first 59 frames of a session), or if no `ml/artifacts/lstm_rul/<version>/`
is present, it falls through to `ground_truth_health_score()`, which maps a
run's `fault_class` to its `contract/health-parameter-registry.md` health
column via `HEALTH_COLUMNS` — respecting the registry's two directions
(`_health`: 1.0 healthy → 0.0 failed; `_deg`/rate columns: inverted, 0.0
healthy → 1.0 failed). `HealthScoreOut` fixes the field set — the model
path only changes which branch populates it and flips `source` from
`"ground_truth"` to `"model"`, plus sets `model_version`/`forecast_horizon_s`
(60.0 for `lstm_rul`, since it forecasts state 60s *after* its input
window's last frame — see `ml/training/lstm_rul/README.md`).
**`lstm_rul`'s own sensor-fault head is deliberately NOT used** — its
README documents a precision collapse (a `WeightedRandomSampler` regression)
and says not to wire it in as-is; `fault_type`/`fault_probability` in the
model path come from the health head's worst-column only.
**`rul_estimate_hours` is real once the model path is active**; it's `None`
only in the ground-truth stand-in path, where no RUL formula exists.

**`xgboost_classifier`'s per-channel sensor-fault classification is also
wired**, independently of the `lstm_rul` branch above — `sensor_fault_cht_c3`
and `sensor_fault_bearing_vibration` are computed off the *same* rolling
frame buffer `BridgeService` keeps for `lstm_rul`, but gated on their own
much shorter threshold (`XGB_ROLLING_WINDOW`, 10 frames vs. `lstm_rul`'s 60),
so they start populating well before `lstm_rul`'s fields do. This is a
**different class vocabulary** from `fault_type`
(`NONE`/`BIAS`/`DRIFT`/`NOISE`/`STUCK` for `cht_c3`,
`NONE`/`DROPOUT` for `bearing_vibration` — see
`ml/artifacts/xgboost_classifier/v1/metadata.json`'s `label_remapping`) and
is **never merged into `fault_type`** — see `HealthScoreOut`'s own field
comments. `xgboost_classifier`'s fitted `StandardScaler`/`OneHotEncoder`
were never exported alongside its model files, so `model_loader.py`
deliberately runs it on **raw, unscaled features** instead (tree-based
models don't need scaling to split correctly, unlike `lstm_rul` where the
scaler is load-bearing) — see that module's docstring for the full
reasoning, including how the `engine_state` one-hot category list was
reconstructed from the training notebook's own printed output rather than a
fitted encoder.

**`autoencoder`'s reconstruction-error anomaly score is also wired**, a
*third* independent signal (`anomaly_score`/`is_anomalous`/
`anomaly_model_version`) alongside `lstm_rul`'s health/fault/RUL fields and
`xgboost_classifier`'s `sensor_fault_*` fields — never merged with either.
Unlike those two, it's **row-level** (`ml/training/autoencoder/README.md`'s
"Row-level (flat)" design): no rolling window is buffered for it, it scores
every frame `BridgeService` sees via
`app/modules/inference/autoencoder_features.py`'s
`build_autoencoder_features()`, which reruns
`ml/features/feature_engineering.py`'s `physics_residuals()` on that single
frame using `ml/artifacts/digital_twin/v3/`'s 27 per-channel regressors
(now present in this repo, paired with `autoencoder/v3` — mixing versions
silently produces garbage, see that model's README). Returns `null` for a
frame whose `engine_state` is a gated transient
(`STARTING`/`SHUTDOWN`/`THROTTLE_TRANSIENT`) or where a needed channel is
NaN (e.g. vibration outside its sidecar-active states) — same honest-gap
convention `xgboost_classifier`'s pre-window-fill `null`s use, just gated on
a different condition.

**No TimescaleDB.** `app/db/models.py` has zero hypertable/partitioning
calls — decided when the deployment target became Render + Supabase (free
tier, no Timescale extension). Plain indexed Postgres tables, honest at this
project's data volume (a handful of replayed missions, not a fleet); revisit
only if that scale assumption stops holding. `DATABASE_URL` defaults to a
local SQLite file (`sqlite:///./dev.db`, gitignored) so `uvicorn --reload`
works with zero setup — the same models/migrations run against Supabase's
Postgres in production via that one env var, nothing dialect-specific
anywhere in this package. See [`../ops/infra/README.md`](../ops/infra/README.md)
for the full deployment picture.

**Replay sessions are in-memory only** (`app/modules/replay/service.py`'s
`_sessions` dict) — restarting the backend process loses active sessions.
The DB rows a session already wrote stay put regardless. This is fine for
"one demo session at a time"; revisit if that stops being true.

## API surface

All under `/api/v1` (see `app/api/router.py`):

| Endpoint | What it does |
| --- | --- |
| `GET /replay/runs` | Lists runs available to replay — scans `data/sample_runs/meta/*.meta.json`. Empty until real data lands there. |
| `POST /replay/{run_id}/start` | Starts a replay session (`{"speed": 1.0}` body), returns `session_id`. 404 if no telemetry file for that `run_id`. |
| `POST /replay/{session_id}/stop` | Requests the session's bridge loop to stop after its current frame. |
| `GET /replay/{session_id}/status` | Session state: `status` (`starting`/`running`/`stopped`/`finished`/`error`), `last_t`, `frames_written`, `error`. |
| `GET /replay/{session_id}/latest` | Most recent `EngineFrame`-shaped telemetry row for that session, from the DB. |
| `GET /inference/latest?session_id=` | Most recent `HealthScoreOut` for that session. |
| `GET /advisory/latest?session_id=` | `{"status": "no advisory logic defined yet", "health_index": ..., "fault_type": ...}` — honest placeholder. |
| `GET /ingestion/status` | `{"active_sessions": N}` — bridge/session activity, not a live-ECU health check (none exists). |

`GET /health` (unversioned, in `app/main.py`) is unchanged — liveness probe.

## Non-negotiables

- **`FrameSource` stays the only thing that knows about CSVs vs. a live
  feed.** Never let `BridgeService`, the DB writer, or the API branch on
  "is this a replay" — if a distinction is genuinely needed, it belongs on
  the `EngineFrame` (e.g. `data_origin`), not as an `if isinstance(source, ReplaySource)` check.
- **`HealthScoreOut`'s field set is the contract.** Changing it changes what
  every consumer (frontend, future Unreal) can rely on — extend it
  deliberately, don't repurpose a field's meaning.
- **Ground truth is a simulation-only concept, kept structurally separate.**
  `GroundTruthLookup` (`app/modules/inference/ground_truth.py`) is not part
  of `FrameSource` — a live ECU source has no ground truth, by design (see
  `contract/ground-truth-schema.yaml`'s own header). Don't merge these.
- **No hypertables, no Timescale-specific SQL anywhere in `app/db/`.** If a
  real scale need for time-partitioning ever appears, that's a deliberate
  re-decision, not something to slip in via one migration.
- **Column names in `app/db/models.py`/`app/bridge/frame.py` are
  `data/README.md`'s, not a local rename.** Extend `contract/` first if a
  new field is genuinely needed.
- **Don't fabricate values `HEALTH_COLUMNS`/RUL don't cover.** An unknown
  `fault_class` or a missing RUL formula returns "full health"/`None`,
  never a guessed number — see `service.py`'s comments for why.

## Commands

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # .venv\Scripts\activate on Windows
pip install -r requirements.txt
alembic upgrade head                     # creates ./dev.db locally, zero setup
uvicorn app.main:app --reload            # http://localhost:8000/health
pytest                                    # 5 replay-fixture tests skip until data/sample_runs/ has files

# once data/sample_runs/<run_id> exists:
curl -X POST http://localhost:8000/api/v1/replay/<run_id>/start -H "Content-Type: application/json" -d '{"speed": 10}'
curl http://localhost:8000/api/v1/replay/<session_id>/status
curl http://localhost:8000/api/v1/replay/<session_id>/latest
curl "http://localhost:8000/api/v1/inference/latest?session_id=<session_id>"

# new migration after changing app/db/models.py:
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

No Docker anywhere — see `../ops/infra/README.md` for why, and for the
Render/Supabase deployment target.

## Testing data

`backend/tests/test_fixture_data.py` discovers whatever run_ids exist under
`../data/sample_runs/telemetry/*.csv` at collection time and skips
(doesn't fail) if there are none — see that folder's README for the exact
layout it expects. There is no committed data as of this writing.

## Approval gate

No `git commit`/`push`/merge without explicit user confirmation this
session — same rule as the root [`CLAUDE.md`](../CLAUDE.md).
