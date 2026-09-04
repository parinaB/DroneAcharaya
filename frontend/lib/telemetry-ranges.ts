/**
 * Hand-mirrored from contract/telemetry-schema.yaml's `valid_range` per
 * field -- the only source of truth for these numbers. Every range here is
 * still tagged [TBD-VALID]/[TBD-ENG] in that file (schema_version
 * "0.1-draft", not yet locked); treat these as provisional, re-copy from
 * the schema if it changes, never hand-tune a number here independently.
 *
 * Fields with no valid_range upper bound in the schema (marked `[0, TBD]`)
 * have no entry here -- normalizeAdaptive() below handles those by tracking
 * the observed max within the current session instead of assuming a fixed
 * ceiling that isn't in the contract.
 */

export interface Range {
  min: number;
  max: number;
}

export const TELEMETRY_RANGES: Record<string, Range> = {
  rpm: { min: 0, max: 3500 },
  cht_c1: { min: -40, max: 260 },
  cht_c2: { min: -40, max: 260 },
  cht_c3: { min: -40, max: 260 },
  cht_c4: { min: -40, max: 260 },
  egt_c1: { min: 0, max: 1000 },
  egt_c2: { min: 0, max: 1000 },
  egt_c3: { min: 0, max: 1000 },
  egt_c4: { min: 0, max: 1000 },
  oil_pressure: { min: 0, max: 10 },
  oil_temperature: { min: -40, max: 160 },
  battery_voltage: { min: 0, max: 36 },
};

/** Normalizes to [0, 1] against a schema-defined range, clamped -- for any
 * field present in TELEMETRY_RANGES. */
export function normalize(field: string, value: number): number {
  const range = TELEMETRY_RANGES[field];
  if (!range) return 0;
  if (range.max === range.min) return 0;
  return Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
}

/**
 * For fields the schema leaves an open upper bound on (e.g.
 * vibration_rms_x_bearing_proxy's `[0, TBD]`) -- normalizes against the
 * largest magnitude seen so far in the current session rather than a
 * fabricated fixed ceiling. `floor` keeps a healthy, near-zero signal from
 * being amplified into visual noise before any real excursion has been
 * observed (e.g. a jitter effect shouldn't look violent just because the
 * only two values seen so far were 0.05 and 0.051).
 */
export function normalizeAdaptive(value: number, seenMaxRef: { current: number }, floor: number): number {
  const magnitude = Math.abs(value);
  if (magnitude > seenMaxRef.current) {
    seenMaxRef.current = magnitude;
  }
  const denominator = Math.max(seenMaxRef.current, floor);
  return Math.max(0, Math.min(1, magnitude / denominator));
}
