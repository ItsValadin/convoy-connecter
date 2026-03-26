import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { haversineDistance } from "@/hooks/useNavigationAlerts";

interface Driver {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  isLeader: boolean;
  speed?: number | null;
  heading?: number | null;
}

const STRAGGLER_THRESHOLD_M = 500; // 500m from group centroid
const CHECK_INTERVAL_MS = 5000; // check every 5s
const ALERT_COOLDOWN_MS = 30000; // don't re-alert same driver within 30s

export const useProximityAlerts = (
  drivers: Driver[],
  sessionId: string,
  active: boolean
) => {
  const lastAlertRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!active || drivers.length < 2) return;

    const interval = setInterval(() => {
      // Compute group centroid
      const centroidLat = drivers.reduce((s, d) => s + d.lat, 0) / drivers.length;
      const centroidLng = drivers.reduce((s, d) => s + d.lng, 0) / drivers.length;

      const now = Date.now();

      drivers.forEach((driver) => {
        const dist = haversineDistance(driver.lat, driver.lng, centroidLat, centroidLng);

        if (dist > STRAGGLER_THRESHOLD_M) {
          const lastAlert = lastAlertRef.current.get(driver.id) || 0;
          if (now - lastAlert < ALERT_COOLDOWN_MS) return;

          lastAlertRef.current.set(driver.id, now);

          if (driver.id === sessionId) {
            toast.warning("You're falling behind the group!", {
              description: `${Math.round(dist)}m from the convoy`,
              duration: 5000,
            });
          } else {
            toast.warning(`${driver.name} is falling behind`, {
              description: `${Math.round(dist)}m from the group`,
              duration: 4000,
            });
          }
        }
      });
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [active, drivers, sessionId]);
};
