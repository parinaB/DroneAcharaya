/** Formats a duration in seconds as HH:MM:SS. */
export function hms(totalSeconds: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Flight-level style altitude label from a real altitude in meters, e.g. 1800 -> "FL059". */
export function altLabel(altitudeMeters: number | null | undefined): string {
  if (altitudeMeters === null || altitudeMeters === undefined) return "—";
  const flightLevel = Math.round(altitudeMeters * 3.28084 / 100);
  return `FL${String(flightLevel).padStart(3, "0")}`;
}

export function oatLabel(ambientTempC: number | null | undefined): string {
  if (ambientTempC === null || ambientTempC === undefined) return "—";
  const rounded = Math.round(ambientTempC * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded} °C`;
}

export function rpmLabel(rpm: number | null | undefined): string {
  if (rpm === null || rpm === undefined) return "—";
  return Math.round(rpm).toLocaleString("en-US").replace(",", " ");
}

export function celsiusLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value)} °C`;
}

export function barLabel(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)} bar`;
}

export function kgPerHourLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)} kg/h`;
}

export function kPaLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)} kPa`;
}

export function gLabel(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)} g`;
}

export function hoursLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 1) return `${(value * 60).toFixed(1)} min`;
  return `${value.toFixed(2)} h`;
}

export function faultTypeLabel(faultType: string | null | undefined): string {
  if (!faultType || faultType === "none") return "None";
  if (faultType === "unknown") return "Unknown";
  return faultType
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
