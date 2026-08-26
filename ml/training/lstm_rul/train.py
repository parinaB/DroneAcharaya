"""Train the LSTM remaining-useful-life regressor on faulted-run sequences."""

import argparse


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-path",
        required=True,
        help="Path to processed sequence dataset with time_to_failure targets.",
    )
    parser.add_argument(
        "--output-path",
        required=True,
        help="Directory under ml/artifacts/ to write weights and metadata to.",
    )
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--sequence-length", type=int, default=128)
    parser.add_argument("--hidden-size", type=int, default=64)
    parser.add_argument("--num-layers", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument(
        "--rul-cap",
        type=float,
        default=3600.0,
        help="Clip targets above this (seconds); early life is not predictable.",
    )
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    raise NotImplementedError(f"LSTM RUL training not implemented yet (args={vars(args)}).")


if __name__ == "__main__":
    main()
