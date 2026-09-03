export type Screen = "dashboard" | "simulation";
export type Role = "operator" | "engineer" | "maintenance";
export type Camera = "ext" | "eng" | "thermal";
export type XaiTab = "drivers" | "residual" | "reasoning";
export type Theme = "dark" | "light";

/** localStorage key the theme toggle persists to. */
export const THEME_STORAGE_KEY = "dt-theme";

export interface SimParams {
  throttle: number;
  alt: number;
  oat: number;
  mix: number;
  fault: number;
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  throttle: 68,
  alt: 180,
  oat: 46,
  mix: -18,
  fault: 62,
};

/** Simulation run length, seconds; matches the T+02:15:00 replay duration. */
export const SIM_RUN_LENGTH = 8100;

export const SCENARIOS = [
  { title: "Nominal cruise", subtitle: "FL180 · ISA · 62% PWR" },
  { title: "Cyl 3 misfire, MSN-4471", subtitle: "HISTORICAL REPLAY" },
  { title: "High-altitude endurance", subtitle: "FL280 · 8 H · LEAN OF PEAK" },
  { title: "Hot weather + transients", subtitle: "OAT 46 °C · STEP THROTTLE" },
] as const;
