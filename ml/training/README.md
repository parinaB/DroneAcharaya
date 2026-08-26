# ml/training/

One folder per model, each with a `train.py` (argparse CLI) and a README stating
its input schema and output artifact layout.

| Model | Job |
| --- | --- |
| `autoencoder/` | Unsupervised anomaly score from nominal-only training |
| `xgboost_classifier/` | Multi-class fault type identification |
| `lstm_rul/` | Remaining-useful-life regression |

All three read from `data/processed/` and write versioned artifacts into
`ml/artifacts/` (gitignored). All three take `--data-path` and `--output-path`;
the two neural models also take `--epochs`.
