import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type HazardType = "warning" | "accident" | "police" | "road_closed" | "debris";

export interface Hazard {
  id: string;
  convoyId: string;
  sessionId: string;
  reporterName: string;
  reporterColor: string;
  hazardType: HazardType;
  lat: number;
  lng: number;
  note: string | null;
  createdAt: string;
}

const HAZARD_LABELS: Record<HazardType, string> = {
  warning: "⚠️ Warning",
  accident: "🚗 Accident",
  police: "🚔 Police",
  road_closed: "🚧 Road Closed",
  debris: "🪨 Debris",
};

export const getHazardLabel = (type: HazardType) => HAZARD_LABELS[type] || "⚠️ Warning";

// Auto-expire hazards older than 30 minutes
const HAZARD_EXPIRY_MS = 30 * 60 * 1000;

export const useHazards = (convoyId: string | null) => {
  const [hazards, setHazards] = useState<Hazard[]>([]);

  const mapRow = (row: any): Hazard => ({
    id: row.id,
    convoyId: row.convoy_id,
    sessionId: row.session_id,
    reporterName: row.reporter_name,
    reporterColor: row.reporter_color,
    hazardType: row.hazard_type as HazardType,
    lat: row.lat,
    lng: row.lng,
    note: row.note,
    createdAt: row.created_at,
  });

  const fetchHazards = useCallback(async (cId: string) => {
    const cutoff = new Date(Date.now() - HAZARD_EXPIRY_MS).toISOString();
    const { data, error } = await supabase
      .from("convoy_hazards")
      .select("*")
      .eq("convoy_id", cId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching hazards:", error);
      return;
    }
    if (data) setHazards(data.map(mapRow));
  }, []);

  // Subscribe to real-time changes
  useEffect(() => {
    if (!convoyId) {
      setHazards([]);
      return;
    }

    fetchHazards(convoyId);

    const channel = supabase
      .channel(`hazards-${convoyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "convoy_hazards", filter: `convoy_id=eq.${convoyId}` },
        (payload) => {
          const h = mapRow(payload.new);
          setHazards((prev) => [h, ...prev]);
          toast.warning(`${h.reporterName} reported: ${getHazardLabel(h.hazardType)}`, { duration: 4000 });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "convoy_hazards", filter: `convoy_id=eq.${convoyId}` },
        (payload) => {
          setHazards((prev) => prev.filter((h) => h.id !== (payload.old as any).id));
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [convoyId, fetchHazards]);

  // Prune expired hazards from local state every 60s
  useEffect(() => {
    if (!hazards.length) return;
    const interval = setInterval(() => {
      const cutoff = Date.now() - HAZARD_EXPIRY_MS;
      setHazards((prev) => prev.filter((h) => new Date(h.createdAt).getTime() > cutoff));
    }, 60000);
    return () => clearInterval(interval);
  }, [hazards.length]);

  const addHazard = useCallback(
    async (lat: number, lng: number, type: HazardType, sessionId: string, name: string, color: string, note?: string) => {
      if (!convoyId) return;
      const { error } = await supabase.from("convoy_hazards").insert({
        convoy_id: convoyId,
        session_id: sessionId,
        reporter_name: name,
        reporter_color: color,
        hazard_type: type,
        lat,
        lng,
        note: note || null,
      });
      if (error) {
        console.error("Error adding hazard:", error);
        toast.error("Failed to report hazard");
      }
    },
    [convoyId]
  );

  const removeHazard = useCallback(
    async (hazardId: string) => {
      const { error } = await supabase.from("convoy_hazards").delete().eq("id", hazardId);
      if (error) console.error("Error removing hazard:", error);
    },
    []
  );

  return { hazards, addHazard, removeHazard };
};
