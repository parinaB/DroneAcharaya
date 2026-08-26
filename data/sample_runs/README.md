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
