# simulation/calibration/

Reference data used to tune the plant model against real engine behaviour.

**Purpose.** Record where each model parameter came from, and how well model
output matches the reference, so the twin's fidelity is defensible.

**Expected file types**
- `*.md` — calibration notes: parameter, chosen value, source, rationale, date.
- `*.csv` — reference tables: manufacturer performance curves, published
  MALE-class engine specs, target operating envelopes, digitised map points.

**Anticipated contents**
- `engine_parameters.md` — displacement, compression ratio, thermal masses,
  friction and lubrication coefficients, sensor noise characteristics.
- `operating_envelope.csv` — nominal and limit values per parameter per regime
  (idle, climb, cruise, loiter, descent).
- `validation_notes.md` — model-vs-reference error per parameter and per regime.

No binary MATLAB artefacts here; keep everything diffable.
