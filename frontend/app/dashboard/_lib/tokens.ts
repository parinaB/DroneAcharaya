/** Design tokens shared across the dashboard. Values are CSS custom
 * properties (defined for both themes in globals.css, scoped under
 * `.dt-root`) so every component that reads `color.*` repaints for free
 * when the theme toggle flips `data-theme` on the root element. */
export const color = {
  bg: "var(--dt-bg)",
  panelBg: "var(--dt-panel-bg)",
  panelBgAlt: "var(--dt-panel-bg-alt)",
  border: "var(--dt-border)",
  borderSoft: "var(--dt-border-soft)",
  text: "var(--dt-text)",
  textDim: "var(--dt-text-dim)",
  textMuted: "var(--dt-text-muted)",
  textFaint: "var(--dt-text-faint)",
  textLabel: "var(--dt-text-label)",
  textLabel2: "var(--dt-text-label-2)",
  textLabel3: "var(--dt-text-label-3)",
  textInactive: "var(--dt-text-inactive)",
  accent: "var(--dt-accent)",
  accentHover: "var(--dt-accent-hover)",
  accentDim: "var(--dt-accent-dim)",
  danger: "var(--dt-danger)",
  dangerHover: "var(--dt-danger-hover)",
  dangerSoft: "var(--dt-danger-soft)",
  tabOnBg: "var(--dt-tab-on-bg)",
  tabOnRing: "inset 0 0 0 1px var(--dt-tab-on-ring)",
  tabOffBg: "var(--dt-tab-off-bg)",
  tabOffRing: "inset 0 0 0 1px var(--dt-tab-off-ring)",
  wellBg: "var(--dt-well-bg)",
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
    : { bg: "transparent", fg: color.textInactive, ring: "none" };
}

export function cardTabStyle(active: boolean): TabStyle {
  return active
    ? { bg: color.tabOnBg, fg: color.text, ring: color.tabOnRing }
    : { bg: color.tabOffBg, fg: color.textDim, ring: color.tabOffRing };
}

/** Overrides a `.dt-glow-card`'s hover glow from the default accent green to
 * danger red when the card is reporting a critical reading -- derived from
 * the same `--dt-danger` token so it stays correct across both themes. */
export function glowVars(critical: boolean): Record<string, string> {
  if (!critical) return {};
  return {
    "--dt-glow": `color-mix(in srgb, ${color.danger} 55%, transparent)`,
    "--dt-glow-shadow": `color-mix(in srgb, ${color.danger} 18%, transparent)`,
  };
}
