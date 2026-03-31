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
  distanceKm: number;
  durationSeconds: number;
}

interface SpeedSample {
  speed: number; // m/s
  timestamp: number; // ms
}

/** Haversine distance in km */
const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

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

  // Distance & duration refs
  const distanceKmRef = useRef(0);
  const tripStartRef = useRef<number | null>(null);
  const prevPosRef = useRef<{ lat: number; lng: number } | null>(null);

  // Route point buffering — batch insert every 5s
  const routePointBufferRef = useRef<{ lat: number; lng: number; speed: number | null; recorded_at: string }[]>([]);

  // Called on each GPS position update
  const recordPosition = useCallback((lat: number, lng: number, speedMs: number | null) => {
    if (!convoyId) return;
    const speed = speedMs ?? 0;
    const now = performance.now();

    // Start trip timer on first reading
    if (tripStartRef.current === null) {
      tripStartRef.current = Date.now();
    }

    // Distance tracking
    const prevPos = prevPosRef.current;
    if (prevPos) {
      const d = haversineKm(prevPos.lat, prevPos.lng, lat, lng);
      // Only add if reasonable (< 1km in a single update to filter GPS jumps)
      if (d < 1 && d > 0.001) {
        distanceKmRef.current += d;
      }
    }
    prevPosRef.current = { lat, lng };

    // Buffer route point (store one every ~2s by checking buffer timing)
    const lastPoint = routePointBufferRef.current[routePointBufferRef.current.length - 1];
    const shouldBuffer = !lastPoint || (Date.now() - new Date(lastPoint.recorded_at).getTime()) > 2000;
    if (shouldBuffer) {
      routePointBufferRef.current.push({
        lat, lng,
        speed: speedMs,
        recorded_at: new Date().toISOString(),
      });
    }

    // Update top speed
    if (speed > topSpeedRef.current) {
      topSpeedRef.current = speed;
    }

    // Update average (only count non-zero readings)
    if (speed > 0.5) {
      speedSumRef.current += speed;
      speedCountRef.current += 1;
    }

    // Compute acceleration from previous sample
    const prev = prevSampleRef.current;
    if (prev && prev.timestamp > 0) {
      const dt = (now - prev.timestamp) / 1000;
      if (dt > 0.1 && dt < 5) {
        const accel = (speed - prev.speed) / dt;
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
      flushRoutePoints();
    }
  }, [convoyId]);

  const flushRoutePoints = useCallback(async () => {
    if (!convoyId || routePointBufferRef.current.length === 0) return;
    const points = routePointBufferRef.current.splice(0);
    await supabase
      .from("convoy_route_points")
      .insert(points.map((p) => ({
        convoy_id: convoyId,
        session_id: sessionId,
        lat: p.lat,
        lng: p.lng,
        speed: p.speed,
        recorded_at: p.recorded_at,
      })));
  }, [convoyId, sessionId]);

  const getDurationSeconds = useCallback(() => {
    if (!tripStartRef.current) return 0;
    return Math.round((Date.now() - tripStartRef.current) / 1000);
  }, []);

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
        distance_km: distanceKmRef.current,
        duration_seconds: getDurationSeconds(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "convoy_id,session_id" });

    // Also flush route points
    await flushRoutePoints();
  }, [convoyId, sessionId, driverName, driverColor, getDurationSeconds, flushRoutePoints]);

  // Reset local stats
  const resetStats = useCallback(() => {
    prevSampleRef.current = null;
    topSpeedRef.current = 0;
    speedSumRef.current = 0;
    speedCountRef.current = 0;
    fastestAccelRef.current = 0;
    hardestBrakeRef.current = 0;
    lastDbPersistRef.current = 0;
    distanceKmRef.current = 0;
    tripStartRef.current = null;
    prevPosRef.current = null;
    routePointBufferRef.current = [];
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
        distanceKm: s.distance_km,
        durationSeconds: s.duration_seconds,
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
    recordPosition,
    resetStats,
    persistStats,
    cleanupStats,
  };
};
