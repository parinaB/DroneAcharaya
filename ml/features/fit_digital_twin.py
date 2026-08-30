"""Fit the digital twin's expected-value models (Step 7 -- data-driven approach).

For each health-relevant telemetry channel, fits a regressor mapping operating
condition (rpm, throttle, altitude, ambient_temperature, air_density) to that
channel's *expected* value under healthy operation. Fit only on missions that
are fully healthy end-to-end (every health parameter at its healthy value for
the whole run -- this includes both the dedicated `healthy` fault class AND
every other fault class's pre-onset missions, which are just as genuinely
healthy and give far more coverage across mission shapes: 269 runs, not 26).

These persisted models are what `feature_engineering.physics_residuals()`
loads at both training-feature-generation and live-inference time -- same
code path, per ml/CLAUDE.md's rule. Not one of the three trained models
(autoencoder/xgboost/lstm); this is shared infrastructure they all sit on top
of, so it lives in ml/features/ rather than ml/training/.
"""

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import train_test_split

CONDITION_FEATURES = ["rpm", "throttle", "altitude", "ambient_temperature", "air_density"]

TARGET_CHANNELS = [
    "torque", "power",
    "cht_c1", "cht_c2", "cht_c3", "cht_c4",
    "egt_c1", "egt_c2", "egt_c3", "egt_c4",
    "oil_pressure", "oil_temperature",
    "fuel_flow", "rail_pressure", "injection_timing",
    "boost_pressure", "map", "intake_temperature", "air_mass_flow",
    "coolant_temperature",
    "vibration_rms_x", "vibration_order_1x",
    "vibration_rms_x_bearing_proxy", "vibration_order_1x_bearing_proxy",
    "battery_voltage", "battery_current", "alternator_power",
]

GATED_OUT_STATES = {"STARTING", "SHUTDOWN", "THROTTLE_TRANSIENT"}

HEALTHY_KEYS_UNITY = [
    "injector_health_c1", "injector_health_c2", "injector_health_c3", "injector_health_c4",
    "cooling_health", "oil_pump_health", "bearing_health", "fuel_delivery_health",
    "alternator_health",
]
HEALTHY_KEYS_ZERO = [
    "turbo_efficiency_deg", "combustion_stability", "injection_timing_deg",
    "misfire_rate_c1", "misfire_rate_c2", "misfire_rate_c3", "misfire_rate_c4",
]


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
        help="Directory under ml/artifacts/ to write digital_twin/<version>/ into.",
    )
    parser.add_argument("--version", default="v1", help="Artifact version tag.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--holdout-frac",
        type=float,
        default=0.15,
        help="Fraction of healthy training runs held out (row-grouped) for eval metrics.",
    )
    return parser.parse_args()


def _is_fully_healthy(meta: dict) -> bool:
    h = meta["health"]
    return all(h[k] == 1 for k in HEALTHY_KEYS_UNITY) and all(h[k] == 0 for k in HEALTHY_KEYS_ZERO)


def _find_healthy_train_runs(data_path: Path) -> list[str]:
    run_ids = []
    for meta_file in sorted((data_path / "meta").glob("*.meta.json")):
        meta = json.loads(meta_file.read_text())
        if meta["split"] == "train" and _is_fully_healthy(meta):
            run_ids.append(meta["run_id"])
    return run_ids


def _load_gated_rows(data_path: Path, run_ids: list[str]) -> pd.DataFrame:
    frames = []
    needed = CONDITION_FEATURES + TARGET_CHANNELS + ["engine_state"]
    for run_id in run_ids:
        csv_path = data_path / "train" / "telemetry" / f"{run_id}.csv"
        frame = pd.read_csv(csv_path, usecols=needed)
        frame = frame[~frame["engine_state"].isin(GATED_OUT_STATES)]
        frames.append(frame)
    return pd.concat(frames, ignore_index=True)


def main() -> None:
    args = parse_args()
    data_path = Path(args.data_path)
    out_dir = Path(args.output_path) / "digital_twin" / args.version
    out_dir.mkdir(parents=True, exist_ok=True)

    run_ids = _find_healthy_train_runs(data_path)
    print(f"fitting on {len(run_ids)} fully-healthy train-split runs")
    train_run_ids, eval_run_ids = train_test_split(
        run_ids, test_size=args.holdout_frac, random_state=args.seed
    )

    train_rows = _load_gated_rows(data_path, train_run_ids)
    eval_rows = _load_gated_rows(data_path, eval_run_ids)
    print(f"train rows: {len(train_rows)}, eval rows: {len(eval_rows)}")

    metrics = {}
    x_train = train_rows[CONDITION_FEATURES]
    x_eval = eval_rows[CONDITION_FEATURES]
    for target in TARGET_CHANNELS:
        y_train = train_rows[target]
        y_eval = eval_rows[target]
        mask_train = y_train.notna()
        if mask_train.sum() < 50:
            print(f"  {target}: skipped, only {mask_train.sum()} non-NaN training rows")
            continue

        model = HistGradientBoostingRegressor(random_state=args.seed)
        model.fit(x_train[mask_train], y_train[mask_train])

        mask_eval = y_eval.notna()
        residual = y_eval[mask_eval] - model.predict(x_eval[mask_eval])
        mae = residual.abs().mean()
        rmse = (residual**2).mean() ** 0.5
        metrics[target] = {"mae": float(mae), "rmse": float(rmse), "n_eval": int(mask_eval.sum())}
        print(f"  {target}: MAE={mae:.4g} RMSE={rmse:.4g} (n={int(mask_eval.sum())})")

        joblib.dump(model, out_dir / f"{target}.joblib")

    metadata = {
        "condition_features": CONDITION_FEATURES,
        "target_channels": list(metrics.keys()),
        "gated_out_states": sorted(GATED_OUT_STATES),
        "n_train_runs": len(train_run_ids),
        "n_eval_runs": len(eval_run_ids),
        "dataset": str(data_path),
        "seed": args.seed,
        "metrics": metrics,
    }
    (out_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))
    print(f"wrote {len(metrics)} models + metadata.json to {out_dir}")


if __name__ == "__main__":
    main()
