/**
 * Mirrors backend/app/bridge/frame.py, backend/app/modules/replay/schemas.py
 * and backend/app/modules/inference/schemas.py field-for-field. Field names
 * are the backend's own snake_case (not remapped) -- there is no sanctioned
 * frontend alias table for these types yet (contrast data/schema.md's
 * six-field alias mapping, which this doesn't use). Keep in sync by hand;
 * these are hand-written, not generated from the OpenAPI schema.
 */

export interface EngineFrame {
  t: number;
  data_origin: string;

  rpm: number;
  torque: number;
  power: number;
  engine_load: number;

  cht_c1: number;
  cht_c2: number;
  cht_c3: number;
  cht_c4: number;
  egt_c1: number;
  egt_c2: number;
  egt_c3: number;
  egt_c4: number;

  oil_pressure: number;
  oil_temperature: number;
  fuel_flow: number;
  rail_pressure: number;
  injection_timing: number;
  boost_pressure: number;
  map: number;
  intake_temperature: number;
  air_mass_flow: number;
  coolant_temperature: number;

  vibration_rms_x: number | null;
  vibration_order_1x: number | null;
  vibration_rms_x_bearing_proxy: number;
  vibration_order_1x_bearing_proxy: number;

  battery_voltage: number;
  battery_current: number;
  alternator_power: number;

  altitude: number;
  ambient_pressure: number;
  ambient_temperature: number;
  air_density: number;

  throttle: number;
  engine_state: string;
}

export interface LatestFrameOut extends EngineFrame {
  run_id: string;
  session_id: string;
  ts: string;
}

export interface RunSummary {
  run_id: string;
  fault_class: string | null;
  mission_shape: string | null;
  duration_s: number | null;
  n_rows: number | null;
}

export interface StartReplayResponse {
  session_id: string;
  run_id: string;
  speed: number;
}

export type SessionStatus = "starting" | "running" | "stopped" | "finished" | "error";

export interface SessionStatusOut {
  session_id: string;
  run_id: string;
  speed: number;
  status: SessionStatus;
  last_t: number | null;
  frames_written: number;
  started_at: string;
  error: string | null;
}

/**
 * backend/app/modules/inference/service.py's HEALTH_COLUMNS keys, the only
 * fault_type values the backend actually returns (plus "none"/"unknown"),
 * from both the ground-truth stand-in and the lstm_rul model path. This is
 * a DIFFERENT vocabulary from sensor_fault_cht_c3/sensor_fault_bearing_vibration
 * below (ml/artifacts/xgboost_classifier's SENSOR_FAULT_CLASSES) -- the two
 * are never merged, see HealthScoreOut's own field comments.
 */
export type FaultType =
  | "none"
  | "unknown"
  | "injector_degradation"
  | "cooling_degradation"
  | "oil_pump_degradation"
  | "bearing_wear"
  | "mechanical_vibration"
  | "fuel_starvation"
  | "alternator_degradation"
  | "turbo_degradation"
  | "injection_timing_drift"
  | "combustion_instability"
  | "misfire";

/** ml/artifacts/xgboost_classifier/v1/metadata.json's label_remapping --
 * cht_c3 uses all 5, bearing_vibration only ever NONE/DROPOUT (the other
 * 3 classes were never observed on that channel in training). */
export type SensorFaultClassChtC3 = "NONE" | "BIAS" | "DRIFT" | "NOISE" | "STUCK";
export type SensorFaultClassBearing = "NONE" | "DROPOUT";

export type HealthScoreSource = "ground_truth" | "model";

export interface HealthScoreOut {
  run_id: string;
  t: number;
  fault_type: FaultType | string;
  fault_probability: number;
  health_index: number;
  rul_estimate_hours: number | null;
  rul_lower: number | null;
  rul_upper: number | null;
  source: HealthScoreSource;
  model_version: string | null;
  /** Seconds ahead of `t` this reading describes. 0 for ground_truth
   * (describes t itself); 60 for lstm_rul (forecasts t+60s) -- see
   * ml/training/lstm_rul/README.md's "What it predicts, and when". */
  forecast_horizon_s: number;
  /** xgboost_classifier's per-channel sensor-fault classification -- a
   * different vocabulary from fault_type above, never merged into it.
   * null until the session's rolling window fills (~10 frames) or if no
   * xgboost_classifier artifact is loaded. */
  sensor_fault_cht_c3: SensorFaultClassChtC3 | null;
  sensor_fault_bearing_vibration: SensorFaultClassBearing | null;
  sensor_fault_model_version: string | null;
  /** autoencoder's reconstruction-error anomaly signal -- a third, additive
   * vocabulary independent of fault_type and sensor_fault_* above ("is
   * something generally off" vs. "which fault"/"which sensor"). Row-level,
   * not windowed, but null on frames whose engine_state is a gated
   * transient (STARTING/SHUTDOWN/THROTTLE_TRANSIENT) or if no autoencoder
   * artifact is loaded. */
  anomaly_score: number | null;
  is_anomalous: boolean | null;
  anomaly_model_version: string | null;
}
