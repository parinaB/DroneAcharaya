/**
 * Minimal color palette for EngineScene, kept independent of
 * app/dashboard/_lib/tokens.ts (a route-private module) since this
 * component tree is meant to be usable outside the dashboard route too.
 * Values mirror the dashboard's own CSS custom properties (see
 * app/globals.css) so the scene reads consistently alongside it without a
 * cross-route import.
 */
export const sceneColor = {
  bg: "var(--dt-bg, #0a0d0f)",
  panelBg: "var(--dt-panel-bg, #12171a)",
  border: "var(--dt-border, #232b2f)",
  text: "var(--dt-text, #e8ecee)",
  textDim: "var(--dt-text-dim, #a7b0b4)",
  textMuted: "var(--dt-text-muted, #7c868a)",
  textFaint: "var(--dt-text-faint, #5b6367)",
  accent: "var(--dt-accent, #35d68a)",
  danger: "var(--dt-danger, #ff5d5d)",
  watch: "#e8c547",
} as const;

export const font = {
  mono: "'IBM Plex Mono', monospace",
} as const;

/** Plain hex colors for actual Three.js scene objects (mesh/material color
 * props) -- THREE.Color cannot parse the CSS custom-property strings in
 * `sceneColor` above (var(--dt-...)), which are for HTML overlay `style`
 * props only. Kept visually close to sceneColor's own values without
 * needing to be pixel-identical across themes, since the 3D scene always
 * renders on a dark background regardless of the dashboard's light/dark
 * toggle. */
export const scene3dColor = {
  textFaint: "#5b6367",
  textDim: "#a7b0b4",
} as const;

/** contract/maintenance-rules.yaml's tier vocabulary -> a display color,
 * the single place this mapping is defined for the whole scene tree. */
export function tierColor(tier: "watch" | "warning" | "critical" | null): string {
  if (tier === "critical") return sceneColor.danger;
  if (tier === "warning") return sceneColor.danger;
  if (tier === "watch") return sceneColor.watch;
  return sceneColor.accent;
}
