import { useEffect, useState } from "react";
import { Gauge, TrendingUp, TrendingDown, Activity, Crown, History, BarChart3, Route, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import BottomTabBar from "@/components/BottomTabBar";
import TripMapReplay from "@/components/TripMapReplay";
import AdInterstitial from "@/components/AdInterstitial";
import { useAdGate } from "@/hooks/useAdGate";

interface StatRow {
  sessionId: string;
  driverName: string;
  driverColor: string;
  topSpeed: number;
  avgSpeed: number;
  fastestAcceleration: number;
  hardestBrake: number;
  distanceKm: number;
  durationSeconds: number;
}

interface TripRecord {
  convoyId: string;
  convoyCode: string;
  timestamp: string;
}

const TRIPS_STORAGE_KEY = "convoy-trip-history";

const MS_TO_KMH = 3.6;
const formatSpeed = (ms: number) => `${Math.round(ms * MS_TO_KMH)} km/h`;
const formatAccel = (ms2: number) => `${ms2.toFixed(1)} m/s²`;
const formatDistance = (km: number) => km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

const loadTripHistory = (): TripRecord[] => {
  try {
    const raw = localStorage.getItem(TRIPS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const TripStats = () => {
  const [stats, setStats] = useState<StatRow[]>([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null);
  const [activeConvoyId, setActiveConvoyId] = useState<string | null>(null);

  useEffect(() => {
    const history = loadTripHistory();
    setTrips(history);

    const raw = localStorage.getItem("convoy-session");
    if (raw) {
      const session = JSON.parse(raw);
      setActiveConvoyId(session.convoyId);
      setSelectedTrip({ convoyId: session.convoyId, convoyCode: session.convoyCode, timestamp: new Date().toISOString() });
    }
  }, []);

  useEffect(() => {
    if (!selectedTrip) {
      setStats([]);
      return;
    }

    const fetchStats = async () => {
      const { data } = await supabase
        .from("convoy_trip_stats")
        .select("*")
        .eq("convoy_id", selectedTrip.convoyId);

      if (data) {
        setStats(data.map((s) => ({
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
    };

    fetchStats();

    if (selectedTrip.convoyId === activeConvoyId) {
      const channel = supabase
        .channel(`trip-stats-page-${selectedTrip.convoyId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "convoy_trip_stats", filter: `convoy_id=eq.${selectedTrip.convoyId}` },
          () => fetchStats()
        )
        .subscribe();

      return () => { channel.unsubscribe(); };
    }
  }, [selectedTrip, activeConvoyId]);

  const bestTopSpeed = stats.length > 0 ? Math.max(...stats.map(s => s.topSpeed)) : 0;
  const bestAccel = stats.length > 0 ? Math.max(...stats.map(s => s.fastestAcceleration)) : 0;
  const bestBrake = stats.length > 0 ? Math.max(...stats.map(s => s.hardestBrake)) : 0;
  const bestDistance = stats.length > 0 ? Math.max(...stats.map(s => s.distanceKm)) : 0;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const hasTripSelected = selectedTrip !== null;

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border safe-top">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center glow-primary">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold tracking-tight glow-text">
              TRIP STATS
            </h1>
            <p className="text-xs text-muted-foreground">
              {selectedTrip && stats.length > 0
                ? `Convoy ${selectedTrip.convoyCode} • ${stats.length} driver${stats.length !== 1 ? "s" : ""}`
                : `${trips.length} past trip${trips.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {hasTripSelected && (
            <button
              onClick={() => setSelectedTrip(null)}
              className="px-3 py-1.5 rounded-lg border border-border bg-secondary/40 font-display text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              All Trips
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Active convoy card */}
        {activeConvoyId && (!selectedTrip || selectedTrip.convoyId !== activeConvoyId) && (
          <button
            onClick={() => {
              const raw = localStorage.getItem("convoy-session");
              if (raw) {
                const s = JSON.parse(raw);
                setSelectedTrip({ convoyId: s.convoyId, convoyCode: s.convoyCode, timestamp: new Date().toISOString() });
              }
            }}
            className="w-full text-left bg-card border border-primary/30 rounded-xl p-4 flex items-center gap-3 hover:border-primary/50 transition-colors"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-bold text-foreground">Live Convoy</p>
              <p className="text-xs text-muted-foreground">Tap to view real-time stats</p>
            </div>
            <BarChart3 className="w-4 h-4 text-primary shrink-0" />
          </button>
        )}

        {/* Trip list view */}
        {!hasTripSelected && (
          <>
            {trips.length > 0 ? (
              <>
                <p className="font-display text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <History className="w-3 h-3" /> Past Trips
                </p>
                <div className="space-y-2">
                  {trips.map((trip) => (
                    <button
                      key={trip.convoyId + trip.timestamp}
                      onClick={() => setSelectedTrip(trip)}
                      className="w-full text-left bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-primary/30 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                        <Activity className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-sm font-bold text-foreground">
                          Convoy {trip.convoyCode}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(trip.timestamp)}
                        </p>
                      </div>
                      <span className="text-muted-foreground text-xs">→</span>
                    </button>
                  ))}
                </div>
              </>
            ) : !activeConvoyId ? (
              <div className="text-center py-16">
                <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="font-display text-muted-foreground">
                  Join or create a convoy to track stats
                </p>
              </div>
            ) : null}
          </>
        )}

        {/* Stats detail view */}
        {hasTripSelected && stats.length > 0 && (
          <>
            {/* Map replay */}
            {selectedTrip && (
              <TripMapReplay
                convoyId={selectedTrip.convoyId}
                drivers={stats.map((s) => ({
                  sessionId: s.sessionId,
                  driverName: s.driverName,
                  driverColor: s.driverColor,
                }))}
              />
            )}

            {stats.map((driver) => (
              <div
                key={driver.sessionId}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Driver header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full pulse-marker shrink-0"
                    style={{ backgroundColor: driver.driverColor }}
                  />
                  <span className="font-display text-sm font-bold text-foreground flex-1">
                    {driver.driverName}
                  </span>
                  {/* Summary badges */}
                  <span className="text-[10px] font-display text-muted-foreground">
                    {formatDistance(driver.distanceKm)} · {formatDuration(driver.durationSeconds)}
                  </span>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-px bg-border">
                  <div className="bg-card p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <Gauge className="w-3 h-3 text-primary" />
                      <span className="font-display text-[9px] uppercase tracking-widest text-muted-foreground">
                        Top Speed
                      </span>
                      {driver.topSpeed === bestTopSpeed && driver.topSpeed > 0 && (
                        <Crown className="w-2.5 h-2.5 text-convoy-amber" />
                      )}
                    </div>
                    <span className="font-display text-lg font-bold text-foreground">
                      {formatSpeed(driver.topSpeed)}
                    </span>
                  </div>

                  <div className="bg-card p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <Activity className="w-3 h-3 text-accent" />
                      <span className="font-display text-[9px] uppercase tracking-widest text-muted-foreground">
                        Avg Speed
                      </span>
                    </div>
                    <span className="font-display text-lg font-bold text-foreground">
                      {formatSpeed(driver.avgSpeed)}
                    </span>
                  </div>

                  <div className="bg-card p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <Route className="w-3 h-3 text-primary" />
                      <span className="font-display text-[9px] uppercase tracking-widest text-muted-foreground">
                        Distance
                      </span>
                      {driver.distanceKm === bestDistance && driver.distanceKm > 0 && (
                        <Crown className="w-2.5 h-2.5 text-convoy-amber" />
                      )}
                    </div>
                    <span className="font-display text-lg font-bold text-foreground">
                      {formatDistance(driver.distanceKm)}
                    </span>
                  </div>

                  <div className="bg-card p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-primary" />
                      <span className="font-display text-[9px] uppercase tracking-widest text-muted-foreground">
                        Accel
                      </span>
                      {driver.fastestAcceleration === bestAccel && driver.fastestAcceleration > 0 && (
                        <Crown className="w-2.5 h-2.5 text-convoy-amber" />
                      )}
                    </div>
                    <span className="font-display text-lg font-bold text-foreground">
                      {formatAccel(driver.fastestAcceleration)}
                    </span>
                  </div>

                  <div className="bg-card p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <TrendingDown className="w-3 h-3 text-destructive" />
                      <span className="font-display text-[9px] uppercase tracking-widest text-muted-foreground">
                        Brake
                      </span>
                      {driver.hardestBrake === bestBrake && driver.hardestBrake > 0 && (
                        <Crown className="w-2.5 h-2.5 text-convoy-amber" />
                      )}
                    </div>
                    <span className="font-display text-lg font-bold text-foreground">
                      {formatAccel(driver.hardestBrake)}
                    </span>
                  </div>

                  <div className="bg-card p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-accent" />
                      <span className="font-display text-[9px] uppercase tracking-widest text-muted-foreground">
                        Duration
                      </span>
                    </div>
                    <span className="font-display text-lg font-bold text-foreground">
                      {formatDuration(driver.durationSeconds)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Empty state for selected trip with no stats */}
        {hasTripSelected && stats.length === 0 && (
          <div className="text-center py-16">
            <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="font-display text-muted-foreground">
              {selectedTrip?.convoyId === activeConvoyId
                ? "No stats yet — start driving!"
                : "No stats recorded for this trip"}
            </p>
          </div>
        )}
      </div>

      <BottomTabBar />
    </div>
  );
};

export default TripStats;
