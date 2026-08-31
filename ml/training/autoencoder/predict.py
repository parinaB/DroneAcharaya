"""Run a trained autoencoder over every row of a data split and export a CSV.

Not a training script -- this is the AE's inference/export step: reuses
train.py's feature-building code, runs the saved model over every row of the
requested split, and writes one CSV row per telemetry row with the
autoencoder's own input features (residuals + operating condition), its
per-channel and aggregate reconstruction error, and the anomaly flag at the
saved threshold. This is exactly the shape ml/training/xgboost_classifier/
train.py will eventually read (per the notebook precedent: XGBoost trains on
the AE's error signal as an input feature alongside raw state) -- see
ml/CLAUDE.md's "one feature builder" rule for why this lives next to the AE
rather than being re-derived inside the classifier.

Per ml/evaluation/README.md's split discipline, exporting the *validation*
split is for looking at outputs / evaluation, not for handing to XGBoost as
its own training data -- that would spend the held-out set before XGBoost
is even evaluated. XGBoost's own training data should be train-split rows
the AE itself never trained on (--split train), leaving validation untouched
for XGBoost's eventual evaluation.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from ml.training.autoencoder.train import (
    AE_CONDITION_FEATURES,
    TelemetryAutoencoder,
    _build_features,
    _load_run_groundtruth_health,
    _load_run_telemetry,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-path", required=True, help="Path to a data/processed/<batch_name> folder.")
    parser.add_argument("--artifacts-dir", required=True, help="ml/artifacts/autoencoder/<version> to load.")
    parser.add_argument(
        "--digital-twin-dir",
        default=None,
        help="Digital twin artifacts dir (default: ml/artifacts/digital_twin/v1).",
    )
    parser.add_argument("--split", choices=["train", "validation"], default="validation")
    parser.add_argument("--output", required=True, help="CSV path to write.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    data_path = Path(args.data_path)
    artifacts_dir = Path(args.artifacts_dir)
    digital_twin_dir = (
        Path(args.digital_twin_dir)
        if args.digital_twin_dir
        else Path(__file__).resolve().parents[2] / "artifacts" / "digital_twin" / "v1"
    )

    ae_meta = json.loads((artifacts_dir / "metadata.json").read_text())
    scaler = json.loads((artifacts_dir / "scaler.json").read_text())
    threshold = json.loads((artifacts_dir / "threshold.json").read_text())["threshold"]

    feature_columns = ae_meta["feature_columns"]
    residual_columns = ae_meta["residual_columns"]
    scale_columns = scaler["columns"]
    mean = np.array(scaler["mean"])
    std = np.array(scaler["std"])
    error_columns = [f"ae_error__{col.removesuffix('_residual')}" for col in residual_columns]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = TelemetryAutoencoder(input_dim=len(feature_columns), latent_dim=ae_meta["hyperparameters"]["latent_dim"])
    model.load_state_dict(torch.load(artifacts_dir / "model.pt", map_location=device))
    model.to(device).eval()
    print("Using device:", device)

    twin_meta = json.loads((digital_twin_dir / "metadata.json").read_text())
    telemetry_cols = sorted(
        set(
            twin_meta["target_channels"]
            + twin_meta["condition_features"]
            + AE_CONDITION_FEATURES
            + ["engine_state", "t"]
        )
    )

    run_ids, fault_classes, mission_shapes = [], {}, {}
    for meta_file in sorted((data_path / "meta").glob("*.meta.json")):
        meta = json.loads(meta_file.read_text())
        if meta["split"] == args.split:
            run_ids.append(meta["run_id"])
            fault_classes[meta["run_id"]] = meta["fault_class"]
            mission_shapes[meta["run_id"]] = meta["mission_shape"]
    print(f"{args.split} runs: {len(run_ids)}")

    row_frames = []
    for i, run_id in enumerate(run_ids):
        telemetry = _load_run_telemetry(data_path, args.split, run_id, telemetry_cols)
        labels = _load_run_groundtruth_health(data_path, args.split, run_id)
        merged = telemetry.merge(labels, on="t", how="inner", validate="one_to_one")

        features, keep_mask = _build_features(merged, digital_twin_dir, residual_columns)
        if features.empty:
            continue

        scaled = features.copy()
        scaled[scale_columns] = (features[scale_columns].values - mean) / std
        x = torch.tensor(scaled[feature_columns].values.astype(np.float32)).to(device)

        with torch.no_grad():
            recon = model(x)
            per_channel_error = (recon - x).pow(2).cpu().numpy()

        residual_idx = [feature_columns.index(c) for c in residual_columns]
        channel_error = per_channel_error[:, residual_idx]
        recon_error = per_channel_error.mean(axis=1)

        kept = merged.loc[keep_mask.values].reset_index(drop=True)
        out = pd.DataFrame(
            {
                "run_id": run_id,
                "t": kept["t"].values,
                "engine_state": kept["engine_state"].values,
                "fault_class": fault_classes[run_id],
                "mission_shape": mission_shapes[run_id],
                "is_healthy": kept["is_healthy"].values,
            }
        )
        out = pd.concat(
            [
                out,
                features[residual_columns + AE_CONDITION_FEATURES].reset_index(drop=True),
                pd.DataFrame(channel_error, columns=error_columns),
            ],
            axis=1,
        )
        out["ae_recon_error"] = recon_error
        out["ae_anomaly_flag"] = recon_error > threshold
        row_frames.append(out)

        if (i + 1) % 50 == 0:
            print(f"  processed {i + 1}/{len(run_ids)} runs")

    result = pd.concat(row_frames, ignore_index=True)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(output_path, index=False)
    print(f"Wrote {len(result)} rows x {len(result.columns)} columns to {output_path}")


if __name__ == "__main__":
    main()
