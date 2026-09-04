"use client";

/**
 * Shared by HealthOverlay and PredictionPanel so a live run only makes
 * roughly one POST /advisory/evaluate call per second instead of each
 * component independently re-deriving the same report.
 *
 * THROTTLE, not debounce: ticks arrive at roughly the same ~1000ms cadence
 * as the old 900ms debounce window, so a debounce here can be starved
 * indefinitely -- each new tick resets the timer before the previous one
 * ever fires, meaning the evaluate call (and therefore every recommendation
 * derived from it) never goes out even though real critical health values
 * are arriving every tick. A throttle guarantees a call fires on a fixed
 * cadence regardless of how steadily new ticks keep arriving.
 */

import { useEffect, useRef, useState } from "react";
import { evaluateAdvisory } from "../../lib/api-client";
import type { HealthScoreOut, MaintenanceReport } from "../../lib/types";

const EVALUATE_THROTTLE_MS = 900;

export function useLiveMaintenanceReport(health: HealthScoreOut | null): MaintenanceReport | null {
  const [report, setReport] = useState<MaintenanceReport | null>(null);
  const lastCallAtRef = useRef(0);
  const pendingHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always the MOST RECENT health seen, so a trailing call scheduled a
  // moment ago fires against current data, not a stale snapshot from
  // whichever tick happened to schedule it.
  const latestHealthRef = useRef<HealthScoreOut | null>(null);
  latestHealthRef.current = health;

  useEffect(() => {
    if (health === null || !health.health_parameters) {
      setReport(null);
      if (pendingHandleRef.current !== null) {
        clearTimeout(pendingHandleRef.current);
        pendingHandleRef.current = null;
      }
      return;
    }

    const callNow = () => {
      lastCallAtRef.current = Date.now();
      pendingHandleRef.current = null;
      const current = latestHealthRef.current;
      if (current === null || !current.health_parameters) return;
      const sensorFaultPreds: Record<string, string | null> = {
        cht_c3: current.sensor_fault_cht_c3,
        bearing_vibration: current.sensor_fault_bearing_vibration,
      };
      evaluateAdvisory(current.health_parameters, current.rul_estimate_hours, sensorFaultPreds)
        .then(setReport)
        .catch(() => {
          // best-effort -- callers just see no update this tick, never a fabricated report
        });
    };

    const elapsed = Date.now() - lastCallAtRef.current;
    if (elapsed >= EVALUATE_THROTTLE_MS) {
      callNow();
    } else if (pendingHandleRef.current === null) {
      // Schedule exactly one trailing call for the remainder of this
      // window -- if more ticks arrive before it fires, this effect's own
      // cleanup does NOT cancel it (only the no-health-parameters branch
      // above does), so a steady stream of ticks can no longer starve it
      // the way the old per-tick debounce could.
      pendingHandleRef.current = setTimeout(callNow, EVALUATE_THROTTLE_MS - elapsed);
    }
  }, [health]);

  return report;
}
