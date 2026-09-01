# data/sample_runs/

A small, **committed** set of representative runs — one nominal plus one per
fault class, trimmed short — so the backend, frontend and replay module can be
demonstrated and tested without the full dataset or a MATLAB licence.

- Format: same schema as `../raw/`, CSV for readability, kept to a few hundred KB
  each.
- Unlike `raw/` and `processed/`, this folder **is** tracked — the demo and the
  test suite depend on it.
- Treat as fixtures: if a sample run changes, tests and screenshots may need
  updating alongside it.

## Status: empty, waiting on real data

Nothing has been dropped in here yet. `backend/app/bridge/sources.py`'s
`ReplaySource` and `backend/tests/test_fixture_data.py` are both already
built against the exact layout this folder is meant to hold:

```
data/sample_runs/
  telemetry/<run_id>.csv
  groundtruth/<run_id>_groundtruth.csv
  meta/<run_id>.meta.json
```

Column set: match `../README.md`'s documented `telemetry/<run_id>.csv` and
`groundtruth/<run_id>_groundtruth.csv` tables exactly — that's the contract
the bridge reads against, not a suggestion.

Drop 2-3 short, real runs in here (one nominal, one or two faulted — trimmed
to a few hundred rows is plenty) in this exact layout and everything
downstream — `backend/tests/test_fixture_data.py`, the bridge's replay
sessions, the `/replay`/`/inference` API — activates against them with no
code changes. Until then, `backend/tests/test_fixture_data.py` skips
(doesn't fail) for each `run_id` it doesn't find a file for, and starting a
replay session against a `run_id` with no telemetry file returns a 404, not
a crash.
