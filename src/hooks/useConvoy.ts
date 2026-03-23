import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RealtimeChannel } from "@supabase/supabase-js";

export interface Driver {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  isLeader: boolean;
  speed?: number | null;
  heading?: number | null;
}

const DRIVER_COLORS = ["#22c55e", "#06b6d4", "#f59e0b", "#ef4444", "#a855f7", "#ec4899"];

const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const generateSessionId = () => crypto.randomUUID();

export const useConvoy = (initialCenter: [number, number]) => {
  const [convoyCode, setConvoyCode] = useState<string | null>(null);
  const [convoyId, setConvoyId] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [gpsActive, setGpsActive] = useState(false);
  const sessionIdRef = useRef(generateSessionId());
  const watchIdRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const positionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dbIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestPositionRef = useRef<{ lat: number; lng: number; speed: number | null; heading: number | null }>({
    lat: initialCenter[0], lng: initialCenter[1], speed: null, heading: null,
  });

  // Subscribe to realtime broadcast + postgres changes for convoy members
  const subscribeToConvoy = useCallback((cId: string) => {
    channelRef.current = supabase
      .channel(`convoy-${cId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "convoy_members", filter: `convoy_id=eq.${cId}` },
        () => {
          fetchMembers(cId);
        }
      )
      .on("broadcast", { event: "position" }, ({ payload }) => {
        if (payload.session_id === sessionIdRef.current) return;
        setDrivers((prev) => {
          const idx = prev.findIndex((d) => d.id === payload.session_id);
          if (idx === -1) return prev; // unknown member, wait for DB sync
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            lat: payload.lat,
            lng: payload.lng,
            speed: payload.speed,
            heading: payload.heading,
          };
          return updated;
        });
      })
      .subscribe();
  }, []);

  const fetchMembers = async (cId: string) => {
    const { data, error } = await supabase
      .from("convoy_members")
      .select("*")
      .eq("convoy_id", cId);

    if (error) {
      console.error("Error fetching members:", error);
      return;
    }

    if (data) {
      const mapped: Driver[] = data.map((m) => ({
        id: m.session_id,
        name: m.name,
        lat: m.lat,
        lng: m.lng,
        color: m.color,
        isLeader: m.is_leader,
        speed: m.speed,
        heading: m.heading,
      }));
      setDrivers(mapped);
    }
  };

  // Broadcast position instantly via Realtime, persist to DB less often
  const startPositionSync = useCallback((cId: string) => {
    // Fast broadcast every 500ms
    const broadcastInterval = setInterval(() => {
      const pos = latestPositionRef.current;
      channelRef.current?.send({
        type: "broadcast",
        event: "position",
        payload: {
          session_id: sessionIdRef.current,
          lat: pos.lat,
          lng: pos.lng,
          speed: pos.speed,
          heading: pos.heading,
        },
      });
    }, 500);

    // Slower DB persist every 5s
    const dbInterval = setInterval(async () => {
      const pos = latestPositionRef.current;
      await supabase
        .from("convoy_members")
        .update({
          lat: pos.lat,
          lng: pos.lng,
          speed: pos.speed,
          heading: pos.heading,
          last_seen: new Date().toISOString(),
        })
        .eq("convoy_id", cId)
        .eq("session_id", sessionIdRef.current);
    }, 5000);

    positionIntervalRef.current = broadcastInterval;
    dbIntervalRef.current = dbInterval;
  }, []);

  // GPS tracking
  const startGpsTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed, heading } = position.coords;
        setGpsActive(true);
        latestPositionRef.current = { lat: latitude, lng: longitude, speed, heading };
      },
      (error) => {
        console.error("GPS error:", error);
        setGpsActive(false);
        if (error.code === error.PERMISSION_DENIED) {
          toast.error("Location permission denied. Enable it in browser settings.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          toast.error("Location unavailable. Check your GPS.");
        } else if (error.code === error.TIMEOUT) {
          toast.error("Location request timed out.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  }, []);

  const handleCreate = useCallback(async (name: string) => {
    const code = generateCode();

    // Create convoy in DB
    const { data: convoy, error: convoyError } = await supabase
      .from("convoys")
      .insert({ code })
      .select()
      .single();

    if (convoyError || !convoy) {
      toast.error("Failed to create convoy");
      console.error(convoyError);
      return;
    }

    // Add self as leader
    const colorIdx = 0;
    const { error: memberError } = await supabase
      .from("convoy_members")
      .insert({
        convoy_id: convoy.id,
        session_id: sessionIdRef.current,
        name,
        lat: latestPositionRef.current.lat,
        lng: latestPositionRef.current.lng,
        color: DRIVER_COLORS[colorIdx],
        is_leader: true,
      });

    if (memberError) {
      toast.error("Failed to join convoy");
      console.error(memberError);
      return;
    }

    setConvoyCode(code);
    setConvoyId(convoy.id);
    await fetchMembers(convoy.id);
    subscribeToConvoy(convoy.id);
    startGpsTracking();
    startPositionSync(convoy.id);
    toast.success(`Convoy ${code} created!`);
  }, [subscribeToConvoy, startGpsTracking, startPositionSync]);

  const handleJoin = useCallback(async (code: string, name: string) => {
    // Find convoy by code
    const { data: convoy, error: convoyError } = await supabase
      .from("convoys")
      .select()
      .eq("code", code.toUpperCase())
      .single();

    if (convoyError || !convoy) {
      toast.error("Convoy not found");
      return;
    }

    // Count existing members to assign color
    const { count } = await supabase
      .from("convoy_members")
      .select("*", { count: "exact", head: true })
      .eq("convoy_id", convoy.id);

    const colorIdx = Math.min((count || 0), DRIVER_COLORS.length - 1);

    const { error: memberError } = await supabase
      .from("convoy_members")
      .insert({
        convoy_id: convoy.id,
        session_id: sessionIdRef.current,
        name,
        lat: latestPositionRef.current.lat,
        lng: latestPositionRef.current.lng,
        color: DRIVER_COLORS[colorIdx],
        is_leader: false,
      });

    if (memberError) {
      toast.error("Failed to join convoy");
      console.error(memberError);
      return;
    }

    setConvoyCode(code.toUpperCase());
    setConvoyId(convoy.id);
    await fetchMembers(convoy.id);
    subscribeToConvoy(convoy.id);
    startGpsTracking();
    startPositionSync(convoy.id);
    toast.success(`Joined convoy ${code}!`);
  }, [subscribeToConvoy, startGpsTracking, startPositionSync]);

  const handleLeave = useCallback(async () => {
    if (convoyId) {
      await supabase
        .from("convoy_members")
        .delete()
        .eq("convoy_id", convoyId)
        .eq("session_id", sessionIdRef.current);
    }

    // Cleanup
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (positionIntervalRef.current) {
      clearInterval(positionIntervalRef.current);
      positionIntervalRef.current = null;
    }
    if (dbIntervalRef.current) {
      clearInterval(dbIntervalRef.current);
      dbIntervalRef.current = null;
    }

    setConvoyCode(null);
    setConvoyId(null);
    setDrivers([]);
    setGpsActive(false);
    toast("You left the convoy");
  }, [convoyId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      channelRef.current?.unsubscribe();
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (positionIntervalRef.current) {
        clearInterval(positionIntervalRef.current);
      }
      if (dbIntervalRef.current) {
        clearInterval(dbIntervalRef.current);
      }
    };
  }, []);

  return {
    convoyCode,
    drivers,
    gpsActive,
    sessionId: sessionIdRef.current,
    handleCreate,
    handleJoin,
    handleLeave,
  };
};
