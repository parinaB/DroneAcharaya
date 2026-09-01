/** Design tokens shared across the dashboard, kept in one place so the
 * dark palette from the design handoff stays consistent across screens. */
export const color = {
  bg: "#0b0d0f",
  panelBg: "#0e1113",
  panelBgAlt: "#0f1114",
  border: "#1c2125",
  borderSoft: "#1a1f23",
  text: "#e8ebed",
  textDim: "#b8c0c6",
  textMuted: "#97a1a8",
  textFaint: "#7d878e",
  textLabel: "#6f7981",
  textLabel2: "#626c74",
  textLabel3: "#5e686f",
  accent: "#4fb391",
  accentHover: "#7fcbb0",
  accentDim: "#2f6f5e",
  danger: "#ff4d3d",
  dangerHover: "#ff6a5c",
  dangerSoft: "#ff7a6d",
  tabOnBg: "#1d2427",
  tabOnRing: "inset 0 0 0 1px #2b3238",
  tabOffBg: "#12161a",
  tabOffRing: "inset 0 0 0 1px #1c2125",
} as const;

export const font = {
  mono: "'IBM Plex Mono', monospace",
  sans: "Archivo, Helvetica, Arial, sans-serif",
} as const;

export interface TabStyle {
  bg: string;
  fg: string;
  ring: string;
}

export function tabStyle(active: boolean): TabStyle {
  return active
    ? { bg: color.tabOnBg, fg: color.text, ring: color.tabOnRing }
    : { bg: "transparent", fg: "#8d979f", ring: "none" };
}

export function cardTabStyle(active: boolean): TabStyle {
  return active
    ? { bg: color.tabOnBg, fg: color.text, ring: color.tabOnRing }
    : { bg: color.tabOffBg, fg: color.textDim, ring: color.tabOffRing };
}
