# ml/features/

`feature_engineering.py` holds the single feature builder used by all three
models, so training and live inference cannot drift apart.

Three families:

1. **Spectral** (`extract_fft_bands`) — vibration energy per frequency band.
2. **Temporal** (`rolling_stats`) — rolling mean/std/min/max/slope over several
   window lengths, for drift and variance growth.
3. **Physics** (`physics_residuals`) — measured minus twin-expected value,
   giving the models deviation rather than absolute state.

Scaler statistics are always fitted on the training split only and persisted
alongside each model artifact.
