"use client";

/** Minimal 16x16 line icons for the sidebar nav -- no icon library dependency. */

const common = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function DashboardIcon() {
  return (
    <svg {...common}>
      <rect x="3" y="3" width="7.5" height="9" rx="1.4" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.4" />
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.4" />
      <rect x="3" y="15" width="7.5" height="6" rx="1.4" />
    </svg>
  );
}

export function SimulationIcon() {
  return (
    <svg {...common}>
      <path d="M12 2.5 20.5 7.5V16.5L12 21.5 3.5 16.5V7.5Z" />
      <path d="M12 21.5V12" />
      <path d="M20.5 7.5 12 12 3.5 7.5" />
    </svg>
  );
}

export function HealthIcon() {
  return (
    <svg {...common}>
      <path d="M3 12h4l2 6 4-14 2 8h6" />
    </svg>
  );
}

export function FaultIcon() {
  return (
    <svg {...common}>
      <path d="M12 3 2.5 20h19Z" />
      <path d="M12 9.5v5" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ReportsIcon() {
  return (
    <svg {...common}>
      <path d="M6 2.5h9L19.5 7v14.5H6Z" />
      <path d="M15 2.5V7h4.5" />
      <path d="M8.5 12.5h7M8.5 16h7" />
    </svg>
  );
}

export function SensorsIcon() {
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 2.5v3.4M12 18.1v3.4M21.5 12h-3.4M5.9 12H2.5" />
      <path d="M18.4 5.6l-2.4 2.4M8 13.6l-2.4 2.4M18.4 18.4l-2.4-2.4M8 10.4 5.6 8" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.6 6.6l1.7 1.7M17.7 15.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 17.4l1.7-1.7M17.7 8.3l1.7-1.7" />
    </svg>
  );
}
