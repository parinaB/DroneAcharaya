"""Loading of trained model artifacts from ml/artifacts/.

Phase 7: lstm_rul (health + RUL heads) and xgboost_classifier (sensor-fault
classification) are both wired. lstm_rul's own sensor-fault head is
deliberately NOT loaded -- ml/training/lstm_rul/README.md documents a
precision collapse (0.164 / 0.004) from a WeightedRandomSampler regression,
and explicitly says not to wire it into the backend as-is; xgboost_classifier
is the sensor-fault source instead (0.93/1.00 accuracy per its own
metadata.json). xgboost_classifier's fitted StandardScaler/OneHotEncoder
were never exported alongside the model files -- only the 3 raw model/
manifest files exist in ml/artifacts/xgboost_classifier/v1/ -- so it runs on
UNSCALED raw features. This is a deliberate tradeoff, not an oversight: tree
-based models split on raw thresholds and don't need scaled inputs to work
correctly (unlike lstm_rul, where the scaler is load-bearing), so skipping
it trades exact reproducibility of the notebook's validation run for being
able to serve predictions at all without the missing artifacts. The
engine_state one-hot category list below is reconstructed from the
notebook's own printed cell output, not re-derived from a fitted encoder.
autoencoder is not loaded yet (missing digital_twin dependency) -- see
ml/artifacts/autoencoder/v3/metadata.json for what it blocks on.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import torch
import xgboost as xgb

# ml/ is a sibling package (repo_root/ml/), not installed or on sys.path by
# default when backend/ runs standalone (`cd backend && uvicorn ...`, or a
# deploy where backend/ is the whole app). This is backend's one dependency
# on ml/ -- see ml/training/lstm_rul/model.py's own docstring for why the
# model class lives there and not duplicated here.
_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from ml.training.lstm_rul.model import EngineMultiHeadLSTM  # noqa: E402

LSTM_SEQ_LEN = 60
LSTM_FORECAST_HORIZON_S = 60.0

# ml/training/xgboost_classifier/xgboost_training.ipynb's SENSOR_COLUMNS --
# identical list/order to lstm_rul's, see cell 8 of that notebook.
XGB_SENSOR_COLUMNS = [
    "rpm",
    "torque",
    "power",
    "engine_load",
    "cht_c1",
    "cht_c2",
    "cht_c3",
    "cht_c4",
    "egt_c1",
    "egt_c2",
    "egt_c3",
    "egt_c4",
    "oil_pressure",
    "oil_temperature",
    "fuel_flow",
    "rail_pressure",
    "injection_timing",
    "boost_pressure",
    "map",
    "intake_temperature",
    "air_mass_flow",
    "coolant_temperature",
    "vibration_rms_x",
    "vibration_order_1x",
    "vibration_rms_x_bearing_proxy",
    "vibration_order_1x_bearing_proxy",
    "battery_voltage",
    "battery_current",
    "alternator_power",
    "altitude",
    "ambient_pressure",
    "ambient_temperature",
    "air_density",
    "throttle",
]
XGB_MISSING_FLAG_COLUMNS = [
    "vibration_rms_x_missing",
    "vibration_order_1x_missing",
    "vibration_rms_x_bearing_proxy_missing",
]
XGB_ROLLING_FAULT_PRONE_COLUMNS = ["cht_c3", "vibration_rms_x_bearing_proxy"]
XGB_ROLLING_WINDOW = 10  # seconds, at this dataset's 1Hz export rate
XGB_ROLLING_FEATURE_COLUMNS = [
    f"{col}_{suffix}"
    for col in XGB_ROLLING_FAULT_PRONE_COLUMNS
    for suffix in ["roll_mean", "roll_std", "dev_from_roll_mean", "diff", "stuck_run_length"]
]
# Notebook's printed cell 12 output, exactly -- OneHotEncoder(categories="auto")
# sorts alphabetically and only includes categories seen in training data
# (OFF/TAKEOFF/FAULT never occurred in main_batch_1000, so aren't here).
# Reconstructed from that printout since the fitted encoder wasn't exported --
# see this module's docstring.
XGB_ENGINE_STATE_CATEGORIES = [
    "CLIMB",
    "CRUISE",
    "DESCENT",
    "HIGH_ALTITUDE_CRUISE",
    "IDLE",
    "LOITER",
    "SHUTDOWN",
    "STARTING",
    "THROTTLE_TRANSIENT",
]
XGB_FEATURE_COLUMNS = (
    XGB_SENSOR_COLUMNS
    + XGB_MISSING_FLAG_COLUMNS
    + XGB_ROLLING_FEATURE_COLUMNS
    + [f"engine_state_{c}" for c in XGB_ENGINE_STATE_CATEGORIES]
)
# len == 34 + 3 + 10 + 9 == 56, matching the notebook's printed
# "56 input features" and both saved models' n_features_in_.

# ml/artifacts/xgboost_classifier/v1/metadata.json's label_remapping --
# each channel's XGBoost class id -> the standard SENSOR_FAULT_CLASSES name.
# Mandatory: xgboost's own class ids are NOT the same indices across the two
# channels (id 1 means BIAS on one, DROPOUT on the other).
XGB_CHT_C3_ID_TO_CLASS = {0: "NONE", 1: "BIAS", 2: "DRIFT", 3: "NOISE", 4: "STUCK"}
XGB_BEARING_ID_TO_CLASS = {0: "NONE", 1: "DROPOUT"}


@dataclass(frozen=True)
class LstmRulBundle:
    """Everything needed to run EngineMultiHeadLSTM inference: the model
    itself plus the exact fitted preprocessing it was trained against.
    Loading any one of these without the others would silently produce
    wrong predictions, so they're loaded and cached together."""

    model: EngineMultiHeadLSTM
    scaler: Any  # sklearn StandardScaler, fit on SENSOR_COLUMNS
    engine_state_encoder: Any  # sklearn OneHotEncoder, fit on engine_state
    sensor_columns: list[str]  # scaler.feature_names_in_, the canonical order
    nan_prone_columns: list[str]
    rul_scale_seconds: float
    version: str


class ModelArtifactError(Exception):
    """Raised when an artifact directory is missing or malformed -- distinct
    from NotImplementedError so callers can tell "not built yet" apart from
    "should exist but doesn't"."""


@dataclass(frozen=True)
class XgboostClassifierBundle:
    """Both per-channel XGBClassifiers. No scaler/encoder here (see this
    module's docstring) -- callers feed raw, unscaled feature vectors built
    in XGB_FEATURE_COLUMNS order."""

    cht_c3_model: xgb.XGBClassifier
    bearing_model: xgb.XGBClassifier
    version: str


# vibration_rms_x / vibration_order_1x / vibration_rms_x_bearing_proxy are
# NaN in specific engine states (crank-resolved vibration sidecar doesn't
# compute a value) -- see ml/training/lstm_rul/README.md's preprocessing
# section. Order matches the missing-flag columns the scaler was fit
# alongside (SENSOR_COLUMNS + MISSING_FLAG_COLUMNS + engine_state one-hot).
_NAN_PRONE_SENSOR_COLUMNS = [
    "vibration_rms_x",
    "vibration_order_1x",
    "vibration_rms_x_bearing_proxy",
]


@lru_cache(maxsize=4)
def load_lstm_rul_bundle(artifacts_dir: str, version: str = "v1") -> LstmRulBundle:
    """Load the lstm_rul model + its fitted scaler/encoder from
    ``{artifacts_dir}/lstm_rul/{version}/``. Cached per (artifacts_dir,
    version) pair -- safe since these files never change at runtime.

    Raises:
        ModelArtifactError: the version directory or a required file is
            missing.
    """
    version_dir = Path(artifacts_dir) / "lstm_rul" / version
    if not version_dir.is_dir():
        raise ModelArtifactError(f"lstm_rul artifact directory not found: {version_dir}")

    metadata_path = version_dir / "metadata.json"
    checkpoint_path = version_dir / "lstm_best.pt"
    scaler_path = version_dir / "scaler.joblib"
    encoder_path = version_dir / "engine_state_encoder.joblib"
    rul_scale_path = version_dir / "rul_scale_seconds.json"
    for path in (metadata_path, checkpoint_path, scaler_path, encoder_path, rul_scale_path):
        if not path.exists():
            raise ModelArtifactError(f"lstm_rul artifact missing required file: {path}")

    metadata = json.loads(metadata_path.read_text())
    arch = metadata["architecture"]

    model = EngineMultiHeadLSTM(
        input_size=arch["input_size"],
        num_health_params=arch["num_health_params"],
        num_sensor_channels=arch["num_sensor_channels"],
        num_sensor_fault_classes=arch["num_sensor_fault_classes"],
        hidden_size=arch["hidden_size"],
        num_layers=arch["num_layers"],
        dropout=arch["dropout"],
        bidirectional=arch["bidirectional"],
    )
    state_dict = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    model.load_state_dict(state_dict)
    model.eval()

    scaler = joblib.load(scaler_path)
    engine_state_encoder = joblib.load(encoder_path)
    rul_scale_seconds = json.loads(rul_scale_path.read_text())["rul_scale_seconds"]

    return LstmRulBundle(
        model=model,
        scaler=scaler,
        engine_state_encoder=engine_state_encoder,
        sensor_columns=list(scaler.feature_names_in_),
        nan_prone_columns=_NAN_PRONE_SENSOR_COLUMNS,
        rul_scale_seconds=rul_scale_seconds,
        version=version,
    )


@lru_cache(maxsize=4)
def load_xgboost_classifier_bundle(artifacts_dir: str, version: str = "v1") -> XgboostClassifierBundle:
    """Load both xgboost_classifier models from
    ``{artifacts_dir}/xgboost_classifier/{version}/``. No scaler/encoder
    (see this module's docstring) -- unlike lstm_rul, this bundle expects
    callers to build raw, unscaled feature vectors themselves.

    Raises:
        ModelArtifactError: the version directory or a required file is
            missing.
    """
    version_dir = Path(artifacts_dir) / "xgboost_classifier" / version
    if not version_dir.is_dir():
        raise ModelArtifactError(f"xgboost_classifier artifact directory not found: {version_dir}")

    cht_c3_path = version_dir / "xgboost_cht_c3.json"
    bearing_path = version_dir / "xgboost_bearing_vibration.json"
    for path in (cht_c3_path, bearing_path):
        if not path.exists():
            raise ModelArtifactError(f"xgboost_classifier artifact missing required file: {path}")

    cht_c3_model = xgb.XGBClassifier()
    cht_c3_model.load_model(cht_c3_path)
    bearing_model = xgb.XGBClassifier()
    bearing_model.load_model(bearing_path)

    return XgboostClassifierBundle(cht_c3_model=cht_c3_model, bearing_model=bearing_model, version=version)


def load_model(artifact_path: str | Path) -> Any:
    """Load a serialised model artifact from ``ml/artifacts/`` and return it.

    Only ``"digital_twin"`` remains unimplemented (still raises
    ``NotImplementedError``) -- ``"lstm_rul"`` and ``"xgboost_classifier"``
    dispatch to :func:`load_lstm_rul_bundle` / :func:`load_xgboost_classifier_bundle`.
    Callers that need to run real preprocessing (not just hold a model
    reference) should call those functions directly instead of going through
    this generic entrypoint -- xgboost_classifier's bundle has no
    scaler/encoder to hide behind this signature anyway (see this module's
    docstring for why).

    Args:
        artifact_path: Path to the artifact, absolute or relative to
            ``Settings.artifacts_dir`` (e.g. ``"xgboost_classifier/v1"``).

    Returns:
        The deserialised model object, ready for inference.

    Raises:
        NotImplementedError: for artifact families not wired yet.
    """
    from app.core.config import get_settings

    if str(artifact_path) == "lstm_rul":
        settings = get_settings()
        return load_lstm_rul_bundle(str(settings.artifacts_dir)).model

    if str(artifact_path) == "xgboost_classifier":
        settings = get_settings()
        return load_xgboost_classifier_bundle(str(settings.artifacts_dir))

    raise NotImplementedError(f"Model artifact loading not implemented yet for {artifact_path!r}.")
