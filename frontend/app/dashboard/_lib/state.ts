export type Screen = "dashboard" | "simulation";
export type Role = "operator" | "engineer" | "maintenance";
export type Camera = "ext" | "eng" | "thermal";
export type XaiTab = "drivers" | "reasoning";
export type Theme = "dark" | "light";

/** localStorage key the theme toggle persists to. */
export const THEME_STORAGE_KEY = "dt-theme";
