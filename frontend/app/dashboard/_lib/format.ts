/** Formats a duration in seconds as HH:MM:SS. */
export function hms(totalSeconds: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Flight-level style altitude label, e.g. 180 -> "FL180". */
export function altLabel(alt: number): string {
  return `FL${String(alt).padStart(3, "0")}`;
}

export function oatLabel(oat: number): string {
  return `${oat > 0 ? "+" : ""}${oat} °C`;
}

/** Mixture offset in degF, lean-of-peak below zero, rich-of-peak above. */
export function mixLabel(mix: number): string {
  return mix < 0 ? `${Math.abs(mix)} °F LOP` : `${mix} °F ROP`;
}

export function rpmLabel(throttle: number): string {
  return Math.round(4200 + throttle * 15)
    .toLocaleString("en-US")
    .replace(",", " ");
}

export function chtLabel(fault: number, oat: number): string {
  return `${Math.round(180 + fault * 0.72 + Math.max(0, oat) * 0.4)} °C`;
}
