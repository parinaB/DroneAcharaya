"""Train the anomaly-detection autoencoder on nominal-only telemetry windows."""

import argparse


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-path",
        required=True,
        help="Path to processed nominal-run dataset (parquet/csv).",
    )
    parser.add_argument(
        "--output-path",
        required=True,
        help="Directory under ml/artifacts/ to write weights and metadata to.",
    )
    parser.add_argument("--epochs", type=int, default=100, help="Training epochs.")
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--window-size", type=int, default=64, help="Samples per window.")
    parser.add_argument("--latent-dim", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    raise NotImplementedError(f"Autoencoder training not implemented yet (args={vars(args)}).")


if __name__ == "__main__":
    main()
