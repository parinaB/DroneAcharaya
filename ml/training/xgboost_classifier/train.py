"""Train the multi-class XGBoost fault classifier on labelled telemetry windows."""

import argparse


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-path",
        required=True,
        help="Path to processed labelled dataset (parquet/csv).",
    )
    parser.add_argument(
        "--output-path",
        required=True,
        help="Directory under ml/artifacts/ to write the booster and metadata to.",
    )
    parser.add_argument("--n-estimators", type=int, default=600)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--learning-rate", type=float, default=0.05)
    parser.add_argument(
        "--early-stopping-rounds",
        type=int,
        default=50,
        help="Rounds without validation improvement before stopping.",
    )
    parser.add_argument(
        "--shap",
        action="store_true",
        help="Compute and persist SHAP summary values for the advisory module.",
    )
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    raise NotImplementedError(f"XGBoost classifier training not implemented yet (args={vars(args)}).")


if __name__ == "__main__":
    main()
