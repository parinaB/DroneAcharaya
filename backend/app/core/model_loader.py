"""Loading of trained model artifacts from ml/artifacts/."""

from pathlib import Path
from typing import Any


def load_model(artifact_path: str | Path) -> Any:
    """Load a serialised model artifact from ``ml/artifacts/`` and return it.

    Args:
        artifact_path: Path to the artifact, absolute or relative to
            ``Settings.artifacts_dir`` (e.g. ``"xgb_fault_clf/v1/model.json"``).

    Returns:
        The deserialised model object, ready for inference.

    Raises:
        NotImplementedError: Always — loader dispatch (torch / xgboost / joblib)
            is not implemented yet.
    """
    raise NotImplementedError("Model artifact loading is not implemented yet.")
