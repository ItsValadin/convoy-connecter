import { useRef, useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";

export interface TripStatsData {
  sessionId: string;
  driverName: string;
  driverColor: string;
  topSpeed: number;       // m/s
  avgSpeed: number;       // m/s
  fastestAcceleration: number; // m/s²
  hardestBrake: number;   // m/s² (positive magnitude)
}

interface SpeedSample {
  speed: number; // m/s
  timestamp: number; // ms
}

export const useTripStats = (
  convoyId: string | null,
  sessionId: string,
  driverName: string,
  driverColor: string
) => {
  const [allStats, setAllStats] = useState<TripStatsData[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Local computation refs
  const prevSampleRef = useRef<SpeedSample | null>(null);
  const topSpeedRef = useRef(0);
  const speedSumRef = useRef(0);
  const speedCountRef = useRef(0);
  const fastestAccelRef = useRef(0);
  const hardestBrakeRef = useRef(0);
  const lastDbPersistRef = useRef(0);

  // Called on each GPS position update
  const recordSpeed = useCallback((speedMs: number | null) => {
    if (!convoyId) return;
    const speed = speedMs ?? 0;
    const now = performance.now();

    // Update top speed
    if (speed > topSpeedRef.current) {
      topSpeedRef.current = speed;
    }

    // Update average (only count non-zero readings)
    if (speed > 0.5) { // threshold to ignore noise when stationary
      speedSumRef.current += speed;
      speedCountRef.current += 1;
    }

    // Compute acceleration from previous sample
    const prev = prevSampleRef.current;
    if (prev && prev.timestamp > 0) {
      const dt = (now - prev.timestamp) / 1000; // seconds
      if (dt > 0.1 && dt < 5) { // ignore unreasonable time gaps
        const accel = (speed - prev.speed) / dt; // m/s²
        if (accel > fastestAccelRef.current) {
          fastestAccelRef.current = accel;
        }
        if (accel < 0 && Math.abs(accel) > hardestBrakeRef.current) {
          hardestBrakeRef.current = Math.abs(accel);
        }
      }
    }

    prevSampleRef.current = { speed, timestamp: now };

    // Persist to DB every 5 seconds
    if (now - lastDbPersistRef.current > 5000) {
      lastDbPersistRef.current = now;
      persistStats();
    }
  }, [convoyId]);

  const persistStats = useCallback(async () => {
    if (!convoyId) return;
    const avgSpeed = speedCountRef.current > 0
      ? speedSumRef.current / speedCountRef.current
      : 0;

    await supabase
      .from("convoy_trip_stats")
      .upsert({
        convoy_id: convoyId,
        session_id: sessionId,
        driver_name: driverName,
        driver_color: driverColor,
        top_speed: topSpeedRef.current,
        avg_speed: avgSpeed,
        fastest_acceleration: fastestAccelRef.current,
        hardest_brake: hardestBrakeRef.current,
        updated_at: new Date().toISOString(),
      }, { onConflict: "convoy_id,session_id" });
  }, [convoyId, sessionId, driverName, driverColor]);

  // Reset local stats
  const resetStats = useCallback(() => {
    prevSampleRef.current = null;
    topSpeedRef.current = 0;
    speedSumRef.current = 0;
    speedCountRef.current = 0;
    fastestAccelRef.current = 0;
    hardestBrakeRef.current = 0;
    lastDbPersistRef.current = 0;
  }, []);

  // Fetch all stats for the convoy
  const fetchAllStats = useCallback(async (cId: string) => {
    const { data } = await supabase
      .from("convoy_trip_stats")
      .select("*")
      .eq("convoy_id", cId);

    if (data) {
      setAllStats(data.map((s) => ({
        sessionId: s.session_id,
        driverName: s.driver_name,
        driverColor: s.driver_color,
        topSpeed: s.top_speed,
        avgSpeed: s.avg_speed,
        fastestAcceleration: s.fastest_acceleration,
        hardestBrake: s.hardest_brake,
      })));
    }
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!convoyId) {
      setAllStats([]);
      return;
    }

    fetchAllStats(convoyId);

    channelRef.current = supabase
      .channel(`trip-stats-${convoyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "convoy_trip_stats", filter: `convoy_id=eq.${convoyId}` },
        () => {
          fetchAllStats(convoyId);
        }
      )
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, [convoyId, fetchAllStats]);

  // Cleanup stats from DB on leave
  const cleanupStats = useCallback(async () => {
    if (!convoyId) return;
    await supabase
      .from("convoy_trip_stats")
      .delete()
      .eq("convoy_id", convoyId)
      .eq("session_id", sessionId);
  }, [convoyId, sessionId]);

  return {
    allStats,
    recordSpeed,
    resetStats,
    persistStats,
    cleanupStats,
  };
};
