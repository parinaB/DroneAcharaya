/**
 * Shared types mirroring the backend ingestion schema.
 * Keep in sync with data/schema.md.
 */

/** Fault classes the classifier can emit. */
export type FaultType =
  | "none"
  | "injector_clog"
  | "bearing_wear"
  | "oil_starvation"
  | "cylinder_head_overheat"
  | "sensor_drift"
  | "ignition_misfire";

/** One telemetry sample as delivered by the ingestion module. */
export interface TelemetrySample {
  /** ISO-8601 timestamp of the sample. */
  timestamp: string;
  /** Engine speed, rev/min. */
  RPM: number;
  /** Cylinder head temperature, degC. */
  CHT: number;
  /** Exhaust gas temperature, degC. */
  EGT: number;
  /** Oil pressure, bar. */
  oil_pressure: number;
  /** Oil temperature, degC. */
  oil_temp: number;
  /** Fuel flow, litres/hour. */
  fuel_flow: number;
  /** Broadband vibration RMS, g. */
  vibration: number;
  /** Bus / battery voltage, V. */
  battery_voltage: number;
  /** Injection timing advance, deg before TDC. */
  injection_timing: number;
  /** Ground-truth or predicted fault class. */
  fault_type: FaultType;
  /** Remaining useful life, seconds. */
  rul: number;
}
