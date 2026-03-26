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

export interface Destination {
  lat: number;
  lng: number;
  label?: string | null;
}

const DRIVER_COLORS = ["#22c55e", "#06b6d4", "#f59e0b", "#ef4444", "#a855f7", "#ec4899"];

const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const STORAGE_KEY = "convoy-session";

interface SavedSession {
  convoyId: string;
  convoyCode: string;
  sessionId: string;
  name: string;
  color: string;
  isLeader: boolean;
}

const saveSession = (session: SavedSession) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

const clearSession = () => {
  localStorage.removeItem(STORAGE_KEY);
};

const loadSession = (): SavedSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const generateSessionId = () => crypto.randomUUID();

export const useConvoy = (initialCenter: [number, number]) => {
  const [convoyCode, setConvoyCode] = useState<string | null>(null);
  const [convoyId, setConvoyId] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [gpsActive, setGpsActive] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [isLeader, setIsLeader] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected">("connected");
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const savedSession = loadSession();
  const sessionIdRef = useRef(savedSession?.sessionId || generateSessionId());
  const hasAttemptedRejoinRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const positionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dbIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestPositionRef = useRef<{ lat: number; lng: number; speed: number | null; heading: number | null }>({
    lat: initialCenter[0], lng: initialCenter[1], speed: null, heading: null,
  });

  // Fetch destination from convoy record
  const fetchDestination = async (cId: string) => {
    const { data } = await supabase
      .from("convoys")
      .select("destination_lat, destination_lng, destination_label")
      .eq("id", cId)
      .single();
    if (data && data.destination_lat != null && data.destination_lng != null) {
      setDestination({ lat: data.destination_lat, lng: data.destination_lng, label: data.destination_label });
    } else {
      setDestination(null);
    }
  };

  // Track recently left session IDs to prevent fetchMembers from re-adding them
  const recentlyLeftRef = useRef<Set<string>>(new Set());

  // Subscribe to realtime broadcast + postgres changes for convoy members
  const subscribeToConvoy = useCallback((cId: string) => {
    channelRef.current = supabase
      .channel(`convoy-${cId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "convoy_members", filter: `convoy_id=eq.${cId}` },
        (payload) => {
          // Don't refetch if this is a simple UPDATE (position change) — broadcast handles that
          if (payload.eventType === 'UPDATE') return;
          fetchMembers(cId);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "convoys", filter: `id=eq.${cId}` },
        () => {
          fetchDestination(cId);
        }
      )
      .on("broadcast", { event: "position" }, ({ payload }) => {
        if (payload.session_id === sessionIdRef.current) return;
        setDrivers((prev) => {
          const idx = prev.findIndex((d) => d.id === payload.session_id);
          if (idx === -1) return prev;
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
      .on("broadcast", { event: "join" }, ({ payload }) => {
        if (payload.session_id === sessionIdRef.current) return;
        toast.success(`${payload.name} joined the convoy`);
      })
      .on("broadcast", { event: "leave" }, ({ payload }) => {
        // Mark as recently left so fetchMembers won't re-add them
        recentlyLeftRef.current.add(payload.session_id);
        setTimeout(() => recentlyLeftRef.current.delete(payload.session_id), 10000);

        setDrivers((prev) => {
          const leavingDriver = prev.find((d) => d.id === payload.session_id);
          if (leavingDriver) {
            if (leavingDriver.isLeader) {
              toast.warning(`${leavingDriver.name} (leader) left the convoy`);
            } else {
              toast(`${leavingDriver.name} left the convoy`);
            }
          }
          const remaining = prev.filter((d) => d.id !== payload.session_id);

          // Auto-promote the earliest joined member to leader if the leader left
          if (leavingDriver?.isLeader && remaining.length > 0) {
            const newLeader = remaining[0];
            remaining[0] = { ...newLeader, isLeader: true };

            // Update DB to reflect new leader
            if (newLeader.id === sessionIdRef.current) {
              setIsLeader(true);
              toast.success("You are now the convoy leader!");
              supabase
                .from("convoy_members")
                .update({ is_leader: true })
                .eq("session_id", newLeader.id)
                .then();
            }
          }

          return remaining;
        });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("connected");
          reconnectAttemptRef.current = 0;
          // Re-sync members and refresh our last_seen on reconnect
          fetchMembers(cId);
          const pos = latestPositionRef.current;
          supabase
            .from("convoy_members")
            .update({ lat: pos.lat, lng: pos.lng, speed: pos.speed, heading: pos.heading, last_seen: new Date().toISOString() })
            .eq("convoy_id", cId)
            .eq("session_id", sessionIdRef.current)
            .then();
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionStatus("disconnected");
          // Auto-reconnect with exponential backoff
          const delay = Math.min(2000 * Math.pow(2, reconnectAttemptRef.current), 15000);
          reconnectAttemptRef.current += 1;
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            channelRef.current?.subscribe();
          }, delay);
        }
      });
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
      const now = Date.now();
      const STALE_THRESHOLD = 60000;
      const active: typeof data = [];
      const staleIds: string[] = [];

      for (const m of data) {
        if (recentlyLeftRef.current.has(m.session_id)) {
          staleIds.push(m.id);
          continue;
        }
        const lastSeen = new Date(m.last_seen).getTime();
        if (now - lastSeen >= STALE_THRESHOLD) {
          staleIds.push(m.id);
          continue;
        }
        active.push(m);
      }

      // Delete stale members from DB so they don't persist
      if (staleIds.length > 0) {
        supabase
          .from("convoy_members")
          .delete()
          .in("id", staleIds)
          .then();
      }

      const mapped: Driver[] = active.map((m) => ({
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
        // Update self in drivers list immediately so the marker moves locally
        setDrivers((prev) => {
          const idx = prev.findIndex((d) => d.id === sessionIdRef.current);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], lat: latitude, lng: longitude, speed, heading };
          return updated;
        });
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
    setIsLeader(true);
    saveSession({ convoyId: convoy.id, convoyCode: code, sessionId: sessionIdRef.current, name, color: DRIVER_COLORS[colorIdx], isLeader: true });
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
    setIsLeader(false);
    saveSession({ convoyId: convoy.id, convoyCode: code.toUpperCase(), sessionId: sessionIdRef.current, name, color: DRIVER_COLORS[colorIdx], isLeader: false });
    await fetchMembers(convoy.id);
    await fetchDestination(convoy.id);
    subscribeToConvoy(convoy.id);
    startGpsTracking();
    startPositionSync(convoy.id);
    // Broadcast join to other members
    channelRef.current?.send({
      type: "broadcast",
      event: "join",
      payload: { session_id: sessionIdRef.current, name },
    });
    toast.success(`Joined convoy ${code}!`);
  }, [subscribeToConvoy, startGpsTracking, startPositionSync]);

  const handleSetDestination = useCallback(async (lat: number, lng: number, label?: string) => {
    if (!convoyId || !isLeader) return;
    const destinationLabel = label || null;
    await supabase
      .from("convoys")
      .update({ destination_lat: lat, destination_lng: lng, destination_label: destinationLabel })
      .eq("id", convoyId);
    setDestination({ lat, lng, label: destinationLabel });
    toast.success("Destination set!");
  }, [convoyId, isLeader]);

  const handleClearDestination = useCallback(async () => {
    if (!convoyId || !isLeader) return;
    setDestination(null);
    toast("Destination cleared");
    await supabase
      .from("convoys")
      .update({ destination_lat: null, destination_lng: null, destination_label: null })
      .eq("id", convoyId);
  }, [convoyId, isLeader]);

  const handleLeave = useCallback(async () => {
    // Broadcast leave to other members instantly and wait for it
    try {
      await channelRef.current?.send({
        type: "broadcast",
        event: "leave",
        payload: { session_id: sessionIdRef.current },
      });
    } catch (e) {
      console.error("Failed to broadcast leave:", e);
    }

    if (convoyId) {
      await supabase
        .from("convoy_members")
        .delete()
        .eq("convoy_id", convoyId)
        .eq("session_id", sessionIdRef.current);
    }

    // Small delay to ensure broadcast is received before unsubscribing
    await new Promise((resolve) => setTimeout(resolve, 300));

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

    clearSession();
    setConvoyCode(null);
    setConvoyId(null);
    setDrivers([]);
    setGpsActive(false);
    setDestination(null);
    setIsLeader(false);
    toast("You left the convoy");
  }, [convoyId]);

  // beforeunload: broadcast leave but keep DB record so auto-rejoin works on next load
  // visibilitychange: on hidden do nothing, on visible re-sync
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (convoyId) {
        // Best-effort broadcast leave so others see us go temporarily
        channelRef.current?.send({
          type: "broadcast",
          event: "leave",
          payload: { session_id: sessionIdRef.current },
        });
      }
    };

    const handleVisibilityChange = () => {
      if (!convoyId) return;

      if (document.visibilityState === "visible") {
        // User returned — immediately refresh last_seen so we don't get pruned
        const pos = latestPositionRef.current;
        supabase
          .from("convoy_members")
          .update({ lat: pos.lat, lng: pos.lng, speed: pos.speed, heading: pos.heading, last_seen: new Date().toISOString() })
          .eq("convoy_id", convoyId)
          .eq("session_id", sessionIdRef.current)
          .then(({ data, error }) => {
            if (error) console.error("Failed to refresh last_seen on resume:", error);
          });
        // Re-fetch members to resync state
        fetchMembers(convoyId);
        // Re-subscribe channel if it went stale
        if (channelRef.current) {
          channelRef.current.subscribe();
        }
      }
      // On hidden: do nothing — stale pruning handles truly gone users after 60s
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [convoyId]);

  // Periodic stale member cleanup every 15s
  useEffect(() => {
    if (!convoyId) return;
    const interval = setInterval(() => {
      fetchMembers(convoyId);
    }, 15000);
    return () => clearInterval(interval);
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

  // Auto-rejoin convoy from saved session on mount
  useEffect(() => {
    if (hasAttemptedRejoinRef.current || convoyId) return;
    hasAttemptedRejoinRef.current = true;

    const saved = loadSession();
    if (!saved) return;

    const attemptRejoin = async () => {
      // Check if convoy still exists
      const { data: convoy, error } = await supabase
        .from("convoys")
        .select("id, code")
        .eq("id", saved.convoyId)
        .single();

      if (error || !convoy) {
        clearSession();
        return;
      }

      // Re-use the saved session ID
      sessionIdRef.current = saved.sessionId;

      // Upsert ourselves back into the convoy (we may have been pruned)
      const pos = latestPositionRef.current;
      await supabase
        .from("convoy_members")
        .upsert({
          convoy_id: convoy.id,
          session_id: saved.sessionId,
          name: saved.name,
          lat: pos.lat,
          lng: pos.lng,
          color: saved.color,
          is_leader: saved.isLeader,
          last_seen: new Date().toISOString(),
        }, { onConflict: "convoy_id,session_id" });

      setConvoyCode(convoy.code);
      setConvoyId(convoy.id);
      setIsLeader(saved.isLeader);
      await fetchMembers(convoy.id);
      await fetchDestination(convoy.id);
      subscribeToConvoy(convoy.id);
      startGpsTracking();
      startPositionSync(convoy.id);
      toast.success(`Reconnected to convoy ${convoy.code}!`);
    };

    attemptRejoin();
  }, [convoyId, subscribeToConvoy, startGpsTracking, startPositionSync]);

  return {
    convoyCode,
    convoyId,
    drivers,
    gpsActive,
    destination,
    isLeader,
    connectionStatus,
    sessionId: sessionIdRef.current,
    handleCreate,
    handleJoin,
    handleLeave,
    handleSetDestination,
    handleClearDestination,
  };
};
