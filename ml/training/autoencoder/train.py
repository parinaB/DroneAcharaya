"""Train the anomaly-detection autoencoder on nominal-only telemetry windows.

v1 design (per docs/build_plan.md Step 8: "feature vector is residuals +
operating condition + trend features"):

- Input features are ml.features.feature_engineering.physics_residuals()
  output (measured - digital-twin-expected, per channel) + operating
  condition (rpm, engine_load, throttle, altitude, ambient_temperature,
  air_density) + a one-hot engine_state. Rolling-stat/FFT "trend features"
  are NOT included -- ml.features.feature_engineering.rolling_stats() and
  extract_fft_bands() are still unimplemented stubs, so this is a documented
  v1 simplification, not a silent shortcut.
- Row-level (flat), not windowed -- the AE README describes a windowed
  (n_windows, window_size, n_features) input, but that also depends on the
  same unimplemented rolling/FFT feature builders. A windowed encoder is a
  natural v2 once those land.
- To avoid the digital twin's own regressors leaking into what should be an
  honest residual, the AE never trains on rows the digital twin was fit on.
  It reuses fit_digital_twin.py's exact healthy-run selection, then
  reproduces that script's own train/holdout run split (same seed, same
  ratio, recovered from digital_twin's metadata.json) and trains only on
  the holdout half -- rows the twin's regressors never saw.
- Per ml/evaluation/README.md: nominal-only training, on the train split
  only. Threshold selection + evaluation (ROC-AUC, false-alarm rate) run on
  the validation split, using per-row ground-truth health columns to label
  each row genuinely healthy vs. faulted -- not on training data.
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from ml.features.feature_engineering import physics_residuals
from ml.features.fit_digital_twin import HEALTHY_KEYS_UNITY, HEALTHY_KEYS_ZERO, _find_healthy_train_runs

AE_CONDITION_FEATURES = ["rpm", "engine_load", "throttle", "altitude", "ambient_temperature", "air_density"]
ENGINE_STATE_CATEGORIES = [
    "OFF",
    "STARTING",
    "IDLE",
    "TAKEOFF",
    "CLIMB",
    "CRUISE",
    "HIGH_ALTITUDE_CRUISE",
    "LOITER",
    "THROTTLE_TRANSIENT",
    "DESCENT",
    "SHUTDOWN",
    "FAULT",
]
HEALTH_COLUMNS = HEALTHY_KEYS_UNITY + HEALTHY_KEYS_ZERO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-path",
        required=True,
        help="Path to a data/processed/<batch_name> folder (e.g. data/processed/main_batch_1000).",
    )
    parser.add_argument(
        "--output-path",
        required=True,
        help="Directory under ml/artifacts/ to write autoencoder/<version>/ into.",
    )
    parser.add_argument(
        "--digital-twin-dir",
        default=None,
        help="Directory holding the fitted digital-twin regressors + metadata.json "
        "(default: ml/artifacts/digital_twin/v1, per feature_engineering.py).",
    )
    parser.add_argument("--version", default="v1", help="Artifact version tag.")
    parser.add_argument(
        "--ae-run-pool",
        choices=["twin-holdout", "all-healthy"],
        default="twin-holdout",
        help="'twin-holdout' (default, safest): only healthy runs the digital twin never trained on. "
        "'all-healthy': every fully-healthy train-split run (~6.6x more data, mild leakage risk) -- see "
        "_select_ae_run_pool's docstring.",
    )
    parser.add_argument("--epochs", type=int, default=100, help="Training epochs.")
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--latent-dim", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--dev-frac", type=float, default=0.1, help="Run-grouped fraction held out for early stopping.")
    parser.add_argument(
        "--percentile",
        type=float,
        default=95.0,
        help="Percentile of healthy validation-split reconstruction error used as the anomaly threshold.",
    )
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


class TelemetryAutoencoder(nn.Module):
    def __init__(self, input_dim: int, latent_dim: int = 8, dropout: float = 0.1) -> None:
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, latent_dim),
        )
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 64),
            nn.ReLU(),
            nn.Linear(64, input_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.decoder(self.encoder(x))


def _load_digital_twin_metadata(digital_twin_dir: Path) -> dict:
    return json.loads((digital_twin_dir / "metadata.json").read_text())


def _reproduce_twin_holdout_run_ids(data_path: Path, twin_meta: dict) -> list[str]:
    """Recover exactly the run_ids fit_digital_twin.py held out from its own fit.

    Same run pool (_find_healthy_train_runs), same seed, same split ratio ->
    same sklearn train_test_split partition. This is the set of healthy
    train-split rows the twin's regressors never saw, so residuals computed
    on it are honest, not a replay of what the twin already memorized.
    """
    run_ids = _find_healthy_train_runs(data_path)
    n_train, n_eval = twin_meta["n_train_runs"], twin_meta["n_eval_runs"]
    test_size = n_eval / (n_train + n_eval)
    _, holdout_ids = train_test_split(run_ids, test_size=test_size, random_state=twin_meta["seed"])
    return holdout_ids


def _select_ae_run_pool(data_path: Path, twin_meta: dict, pool: str) -> list[str]:
    """Which healthy train-split runs the AE is allowed to train on.

    "twin-holdout" (default): only runs the digital twin's regressors never
    saw, so residuals are never computed with a model that partly memorized
    that exact row -- see train.py's module docstring. Safer, far less data.

    "all-healthy": every fully-healthy train-split run, including the 220
    the twin was fit on. Residuals on those 220 are computed by a model that
    already minimized its error there, so they read a little tighter than
    genuinely unseen data would -- a mild leakage risk, traded for ~6.6x more
    training data. Reasonable given the digital twin is a moderately
    regularized regressor on 5 simple inputs, not something that memorizes
    hard.
    """
    if pool == "all-healthy":
        return _find_healthy_train_runs(data_path)
    return _reproduce_twin_holdout_run_ids(data_path, twin_meta)


def _one_hot_engine_state(engine_state: pd.Series) -> pd.DataFrame:
    codes = pd.Categorical(engine_state, categories=ENGINE_STATE_CATEGORIES)
    dummies = pd.get_dummies(codes, prefix="engine_state")
    return dummies.reindex(columns=[f"engine_state_{c}" for c in ENGINE_STATE_CATEGORIES], fill_value=False).astype(
        np.float32
    )


def _build_features(
    telemetry: pd.DataFrame, digital_twin_dir: Path, residual_columns: list[str]
) -> tuple[pd.DataFrame, pd.Series]:
    """Residuals + operating condition + one-hot engine_state, NaN rows dropped.

    Returns (feature_frame, keep_mask) where keep_mask is aligned to
    telemetry's original index, for callers that also need to align labels.
    """
    residuals = physics_residuals(telemetry, artifacts_dir=digital_twin_dir)
    condition = telemetry[AE_CONDITION_FEATURES].astype(np.float32)
    engine_state_dummies = _one_hot_engine_state(telemetry["engine_state"])

    features = pd.concat([residuals[residual_columns], condition, engine_state_dummies], axis=1)
    keep_mask = features[residual_columns + AE_CONDITION_FEATURES].notna().all(axis=1)
    return features.loc[keep_mask].reset_index(drop=True), keep_mask


def _load_run_telemetry(data_path: Path, split: str, run_id: str, usecols: list[str]) -> pd.DataFrame:
    return pd.read_csv(data_path / split / "telemetry" / f"{run_id}.csv", usecols=usecols)


def _load_run_groundtruth_health(data_path: Path, split: str, run_id: str) -> pd.DataFrame:
    gt = pd.read_csv(data_path / split / "groundtruth" / f"{run_id}_groundtruth.csv", usecols=["t"] + HEALTH_COLUMNS)
    is_healthy = (gt[HEALTHY_KEYS_UNITY] == 1).all(axis=1) & (gt[HEALTHY_KEYS_ZERO] == 0).all(axis=1)
    return pd.DataFrame({"t": gt["t"], "is_healthy": is_healthy})


def main() -> None:
    args = parse_args()
    data_path = Path(args.data_path)
    digital_twin_dir = Path(args.digital_twin_dir) if args.digital_twin_dir else None
    if digital_twin_dir is None:
        digital_twin_dir = Path(__file__).resolve().parents[2] / "artifacts" / "digital_twin" / "v1"

    twin_meta = _load_digital_twin_metadata(digital_twin_dir)
    residual_columns = [f"{target}_residual" for target in twin_meta["target_channels"]]
    telemetry_cols = (
        twin_meta["target_channels"] + twin_meta["condition_features"] + AE_CONDITION_FEATURES + ["engine_state"]
    )
    telemetry_cols = sorted(set(telemetry_cols))

    ae_run_ids = _select_ae_run_pool(data_path, twin_meta, args.ae_run_pool)
    fit_run_ids, dev_run_ids = train_test_split(ae_run_ids, test_size=args.dev_frac, random_state=args.seed)
    print(f"AE run pool: {args.ae_run_pool} -- fit runs: {len(fit_run_ids)}, dev runs: {len(dev_run_ids)}")

    feature_columns = residual_columns + AE_CONDITION_FEATURES + [f"engine_state_{c}" for c in ENGINE_STATE_CATEGORIES]

    def load_pool(run_ids: list[str]) -> pd.DataFrame:
        frames = []
        for run_id in run_ids:
            telemetry = _load_run_telemetry(data_path, "train", run_id, telemetry_cols)
            features, _ = _build_features(telemetry, digital_twin_dir, residual_columns)
            frames.append(features)
        return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=feature_columns)

    fit_df = load_pool(fit_run_ids)
    dev_df = load_pool(dev_run_ids)
    print(f"AE fit rows: {len(fit_df)}, dev rows: {len(dev_df)}")

    scale_columns = residual_columns + AE_CONDITION_FEATURES
    scaler = StandardScaler()
    scaler.fit(fit_df[scale_columns])

    def scale(df: pd.DataFrame) -> np.ndarray:
        scaled = df.copy()
        scaled[scale_columns] = scaler.transform(df[scale_columns])
        return scaled[feature_columns].values.astype(np.float32)

    x_fit = scale(fit_df)
    x_dev = scale(dev_df)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("Using device:", device)

    torch.manual_seed(args.seed)
    model = TelemetryAutoencoder(input_dim=x_fit.shape[1], latent_dim=args.latent_dim).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate, weight_decay=1e-5)

    fit_loader = DataLoader(TensorDataset(torch.tensor(x_fit)), batch_size=args.batch_size, shuffle=True)
    x_dev_t = torch.tensor(x_dev).to(device)

    best_dev_loss = float("inf")
    best_state = None
    for epoch in range(args.epochs):
        model.train()
        train_loss = 0.0
        for (batch,) in fit_loader:
            batch = batch.to(device)
            optimizer.zero_grad()
            recon = model(batch)
            loss = nn.functional.mse_loss(recon, batch)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
        train_loss /= len(fit_loader)

        model.eval()
        with torch.no_grad():
            dev_recon = model(x_dev_t)
            dev_loss = nn.functional.mse_loss(dev_recon, x_dev_t).item()

        if dev_loss < best_dev_loss:
            best_dev_loss = dev_loss
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}

        print(f"Epoch {epoch + 1:3d}: train_loss={train_loss:.5f}  dev_loss={dev_loss:.5f}")

    assert best_state is not None, "--epochs must be >= 1"
    model.load_state_dict(best_state)
    model.eval()
    print(f"Best dev loss: {best_dev_loss:.5f}")

    # --- Threshold selection + evaluation on the VALIDATION split (per ml/evaluation/README.md) ---
    validation_run_ids = []
    for meta_file in sorted((data_path / "meta").glob("*.meta.json")):
        meta = json.loads(meta_file.read_text())
        if meta["split"] == "validation":
            validation_run_ids.append(meta["run_id"])
    print(f"Validation runs: {len(validation_run_ids)}")

    val_feature_frames, val_label_frames = [], []
    for run_id in validation_run_ids:
        telemetry = _load_run_telemetry(data_path, "validation", run_id, telemetry_cols + ["t"])
        labels = _load_run_groundtruth_health(data_path, "validation", run_id)
        merged = telemetry.merge(labels, on="t", how="inner", validate="one_to_one")
        features, keep_mask = _build_features(merged, digital_twin_dir, residual_columns)
        if features.empty:
            continue
        aligned_labels = merged.loc[keep_mask.values, "is_healthy"].reset_index(drop=True)
        val_feature_frames.append(features)
        val_label_frames.append(aligned_labels)

    val_df = pd.concat(val_feature_frames, ignore_index=True)
    val_is_healthy = pd.concat(val_label_frames, ignore_index=True).values
    x_val = scale(val_df)

    with torch.no_grad():
        x_val_t = torch.tensor(x_val).to(device)
        val_recon = model(x_val_t)
        recon_error = ((val_recon - x_val_t) ** 2).mean(dim=1).cpu().numpy()

    healthy_val_errors = recon_error[val_is_healthy]
    anomaly_threshold = float(np.percentile(healthy_val_errors, args.percentile))

    roc_auc = float(roc_auc_score((~val_is_healthy).astype(int), recon_error))
    false_alarm_rate = float((healthy_val_errors > anomaly_threshold).mean())
    faulted_errors = recon_error[~val_is_healthy]
    detection_rate = float((faulted_errors > anomaly_threshold).mean()) if len(faulted_errors) else float("nan")
    reconstruction_mse_healthy = float(healthy_val_errors.mean())

    print(
        f"Validation: reconstruction_mse(healthy)={reconstruction_mse_healthy:.5f} "
        f"roc_auc={roc_auc:.4f} threshold={anomaly_threshold:.5f} "
        f"false_alarm_rate={false_alarm_rate:.4f} detection_rate={detection_rate:.4f}"
    )

    # --- Write versioned artifacts ---
    out_dir = Path(args.output_path) / "autoencoder" / args.version
    out_dir.mkdir(parents=True, exist_ok=True)

    torch.save(model.state_dict(), out_dir / "model.pt")

    scaler_json = {
        "columns": scale_columns,
        "mean": scaler.mean_.tolist(),
        "std": scaler.scale_.tolist(),
    }
    (out_dir / "scaler.json").write_text(json.dumps(scaler_json, indent=2))

    threshold_json = {
        "threshold": anomaly_threshold,
        "percentile": args.percentile,
        "computed_on": "validation split, healthy rows (per-row ground-truth health labels)",
    }
    (out_dir / "threshold.json").write_text(json.dumps(threshold_json, indent=2))

    metadata = {
        "feature_columns": feature_columns,
        "residual_columns": residual_columns,
        "condition_features": AE_CONDITION_FEATURES,
        "engine_state_categories": ENGINE_STATE_CATEGORIES,
        "digital_twin_artifacts_dir": str(digital_twin_dir),
        "hyperparameters": {
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "latent_dim": args.latent_dim,
            "learning_rate": args.learning_rate,
            "dev_frac": args.dev_frac,
            "seed": args.seed,
            "ae_run_pool": args.ae_run_pool,
        },
        "dataset": str(data_path),
        "n_ae_fit_runs": len(fit_run_ids),
        "n_ae_dev_runs": len(dev_run_ids),
        "n_validation_runs": len(validation_run_ids),
        "metrics": {
            "best_dev_reconstruction_mse": best_dev_loss,
            "validation_reconstruction_mse_healthy": reconstruction_mse_healthy,
            "validation_roc_auc": roc_auc,
            "validation_false_alarm_rate": false_alarm_rate,
            "validation_detection_rate": detection_rate,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    (out_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))

    print(f"Wrote model.pt, scaler.json, threshold.json, metadata.json to {out_dir}")


if __name__ == "__main__":
    main()
