import { useEffect, useRef, useCallback } from "react";
import type { RouteStep } from "@/components/NavigationPanel";

const ALERT_DISTANCE_M = 200; // announce when within 200m of maneuver
const MIN_ALERT_INTERVAL_MS = 8000; // don't repeat alerts faster than 8s

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const useNavigationAlerts = (
  steps: RouteStep[] | undefined,
  userLat: number | null,
  userLng: number | null,
  enabled: boolean
) => {
  const lastAlertedStepRef = useRef(-1);
  const lastAlertTimeRef = useRef(0);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    // Cancel any ongoing speech
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    synthRef.current.speak(utterance);
  }, []);

  useEffect(() => {
    if (!enabled || !steps?.length || userLat == null || userLng == null) return;

    const now = Date.now();
    if (now - lastAlertTimeRef.current < MIN_ALERT_INTERVAL_MS) return;

    // Find the next upcoming step (after the last alerted one)
    for (let i = Math.max(0, lastAlertedStepRef.current + 1); i < steps.length; i++) {
      const step = steps[i];
      const dist = haversineDistance(userLat, userLng, step.location[0], step.location[1]);

      if (dist <= ALERT_DISTANCE_M) {
        speak(step.instruction);
        lastAlertedStepRef.current = i;
        lastAlertTimeRef.current = now;
        break;
      }
    }
  }, [steps, userLat, userLng, enabled, speak]);

  // Reset when route changes
  useEffect(() => {
    lastAlertedStepRef.current = -1;
    lastAlertTimeRef.current = 0;
  }, [steps]);
};
