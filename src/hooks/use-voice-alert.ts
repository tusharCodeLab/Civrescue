import * as React from "react";
import { Incident } from "@/lib/civrescue-api";
import { speakAlert } from "@/lib/elevenlabs";

export interface VoiceAlertState {
  /** The human-readable text of the most recent alert, or null if none yet. */
  lastAlert: string | null;
  /** Clears the lastAlert so the banner can be dismissed. */
  dismissAlert: () => void;
  /** Manually set an alert message (used by the Test button). */
  triggerAlert: (message: string) => void;
}

/**
 * Watches the incident list for NEW severity-5 (critical) incidents.
 *
 * Detection strategy: record the wall-clock time when the hook mounts.
 * Any incident with `created_at` AFTER that timestamp is considered "new"
 * and will fire a voice alert.  This survives page navigation (hook remounts
 * each time but only alerts incidents created AFTER mount).
 *
 * We additionally track a Set of alerted IDs so we never double-alert the
 * same incident if it shows up in multiple query refreshes.
 */
export function useVoiceAlert(incidents: Incident[] | undefined): VoiceAlertState {
  // Record the exact moment this hook instance was mounted.
  const mountTimeRef = React.useRef<number>(Date.now());

  // Prevent double-alerting the same incident across multiple refreshes.
  const alertedIdsRef = React.useRef<Set<string>>(new Set());

  const [lastAlert, setLastAlert] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!incidents || incidents.length === 0) return;

    const mountTime = mountTimeRef.current;

    // Find critical incidents created AFTER this hook mounted AND not yet alerted.
    const newCritical = incidents.filter((inc) => {
      if (inc.severity !== "critical") return false;
      if (alertedIdsRef.current.has(inc.id)) return false;
      // created_at is an ISO string; compare to mount time.
      const createdAt = Date.parse(inc.created_at);
      return createdAt >= mountTime;
    });

    if (newCritical.length === 0) return;

    for (const inc of newCritical) {
      // Mark as alerted immediately so concurrent refreshes don't double-fire.
      alertedIdsRef.current.add(inc.id);

      const location = inc.district ?? "unknown location";
      const emergencyType = inc.incident_type ?? "Emergency";
      const message = `Critical emergency alert! ${emergencyType} reported at ${location}. Severity level 5. Immediate response required.`;

      setLastAlert(message);

      console.info("[useVoiceAlert] Firing voice alert:", message);

      speakAlert(message).catch((err: unknown) => {
        console.error("[useVoiceAlert] ElevenLabs TTS failed:", err);
      });
    }
  }, [incidents]);

  const dismissAlert = React.useCallback(() => setLastAlert(null), []);
  const triggerAlert = React.useCallback((message: string) => setLastAlert(message), []);

  return { lastAlert, dismissAlert, triggerAlert };
}
