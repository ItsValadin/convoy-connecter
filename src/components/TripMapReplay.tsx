import { useEffect, useState, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import { supabase } from "@/integrations/supabase/client";
import { Play, Pause, RotateCcw } from "lucide-react";
import "leaflet/dist/leaflet.css";

interface RoutePoint {
  lat: number;
  lng: number;
  speed: number | null;
  recorded_at: string;
}

interface DriverRoute {
  sessionId: string;
  driverName: string;
  driverColor: string;
  points: RoutePoint[];
}

interface TripMapReplayProps {
  convoyId: string;
  drivers: { sessionId: string; driverName: string; driverColor: string }[];
}

const FitBounds = ({ routes }: { routes: DriverRoute[] }) => {
  const map = useMap();
  useEffect(() => {
    const allPoints = routes.flatMap((r) => r.points.map((p) => [p.lat, p.lng] as [number, number]));
    if (allPoints.length > 1) {
      const bounds = allPoints.reduce(
        (b, p) => [
          [Math.min(b[0][0], p[0]), Math.min(b[0][1], p[1])],
          [Math.max(b[1][0], p[0]), Math.max(b[1][1], p[1])],
        ],
        [[90, 180], [-90, -180]] as [[number, number], [number, number]]
      );
      map.fitBounds(bounds, { padding: [30, 30] });
    } else if (allPoints.length === 1) {
      map.setView(allPoints[0], 14);
    }
  }, [routes, map]);
  return null;
};

const TripMapReplay = ({ convoyId, drivers }: TripMapReplayProps) => {
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(1); // 0-1, starts at end (full route shown)
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const durationRef = useRef(15); // replay duration in seconds

  useEffect(() => {
    const fetchRoutes = async () => {
      const { data } = await supabase
        .from("convoy_route_points")
        .select("*")
        .eq("convoy_id", convoyId)
        .order("recorded_at", { ascending: true });

      if (!data || data.length === 0) return;

      const bySession = new Map<string, RoutePoint[]>();
      for (const p of data) {
        const existing = bySession.get(p.session_id) || [];
        existing.push({ lat: p.lat, lng: p.lng, speed: p.speed, recorded_at: p.recorded_at });
        bySession.set(p.session_id, existing);
      }

      const driverRoutes: DriverRoute[] = [];
      for (const d of drivers) {
        const pts = bySession.get(d.sessionId);
        if (pts && pts.length > 0) {
          driverRoutes.push({
            sessionId: d.sessionId,
            driverName: d.driverName,
            driverColor: d.driverColor,
            points: pts,
          });
        }
      }
      setRoutes(driverRoutes);
    };

    fetchRoutes();
  }, [convoyId, drivers]);

  const animate = () => {
    const elapsed = (performance.now() - startTimeRef.current) / 1000;
    const p = Math.min(elapsed / durationRef.current, 1);
    setProgress(p);
    if (p < 1) {
      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      setPlaying(false);
    }
  };

  const handlePlay = () => {
    if (playing) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setPlaying(false);
      return;
    }
    setPlaying(true);
    setProgress(0);
    startTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(animate);
  };

  const handleReset = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setPlaying(false);
    setProgress(1);
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  if (routes.length === 0) return null;

  const getVisiblePoints = (points: RoutePoint[]) => {
    const count = Math.max(1, Math.floor(points.length * progress));
    return points.slice(0, count);
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
          Route Replay
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="w-7 h-7 rounded-md bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handlePlay}
            className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center text-primary hover:bg-primary/30 transition-colors"
          >
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <div className="h-48 relative">
        <MapContainer
          center={[0, 0]}
          zoom={13}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
          style={{ background: "hsl(var(--background))" }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <FitBounds routes={routes} />
          {routes.map((route) => {
            const visible = getVisiblePoints(route.points);
            const coords = visible.map((p) => [p.lat, p.lng] as [number, number]);
            const lastPoint = visible[visible.length - 1];
            return (
              <div key={route.sessionId}>
                {coords.length > 1 && (
                  <Polyline
                    positions={coords}
                    pathOptions={{ color: route.driverColor, weight: 3, opacity: 0.8 }}
                  />
                )}
                {lastPoint && (
                  <CircleMarker
                    center={[lastPoint.lat, lastPoint.lng]}
                    radius={5}
                    pathOptions={{
                      color: route.driverColor,
                      fillColor: route.driverColor,
                      fillOpacity: 1,
                      weight: 2,
                    }}
                  />
                )}
              </div>
            );
          })}
        </MapContainer>
      </div>
      {/* Progress bar */}
      <div className="h-1 bg-secondary">
        <div
          className="h-full bg-primary transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
};

export default TripMapReplay;
