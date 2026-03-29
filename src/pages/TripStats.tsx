import { useEffect, useState } from "react";
import { Gauge, TrendingUp, TrendingDown, Activity, Crown, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import BottomTabBar from "@/components/BottomTabBar";

interface StatRow {
  sessionId: string;
  driverName: string;
  driverColor: string;
  topSpeed: number;
  avgSpeed: number;
  fastestAcceleration: number;
  hardestBrake: number;
}

interface TripRecord {
  convoyId: string;
  convoyCode: string;
  timestamp: string;
}

const TRIPS_STORAGE_KEY = "convoy-trip-history";

const MS_TO_MPH = 2.237;
const formatSpeed = (ms: number) => `${Math.round(ms * MS_TO_MPH)} mph`;
const formatAccel = (ms2: number) => `${ms2.toFixed(1)} m/s²`;

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

    // Check for active convoy
    const raw = localStorage.getItem("convoy-session");
    if (raw) {
      const session = JSON.parse(raw);
      setActiveConvoyId(session.convoyId);
      // Auto-select active convoy
      setSelectedTrip({ convoyId: session.convoyId, convoyCode: session.convoyCode, timestamp: new Date().toISOString() });
    } else if (history.length > 0) {
      // Select most recent trip
      setSelectedTrip(history[0]);
    }
  }, []);

  // Fetch stats when selected trip changes
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
        })));
      }
    };

    fetchStats();

    // Subscribe to realtime only for active convoy
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

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

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
              {selectedTrip
                ? `Convoy ${selectedTrip.convoyCode} • ${stats.length} driver${stats.length !== 1 ? "s" : ""}`
                : "No trips yet"}
            </p>
          </div>
        </div>
      </div>

      {/* Trip selector - horizontal scroll */}
      {trips.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <p className="font-display text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
            <History className="w-3 h-3" /> Trip History
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {/* Active convoy chip */}
            {activeConvoyId && (
              <button
                onClick={() => {
                  const raw = localStorage.getItem("convoy-session");
                  if (raw) {
                    const s = JSON.parse(raw);
                    setSelectedTrip({ convoyId: s.convoyId, convoyCode: s.convoyCode, timestamp: new Date().toISOString() });
                  }
                }}
                className={`shrink-0 px-3 py-1.5 rounded-lg border font-display text-xs transition-colors ${
                  selectedTrip?.convoyId === activeConvoyId
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-secondary/40 border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse mr-1.5" />
                Live
              </button>
            )}
            {trips.map((trip) => (
              <button
                key={trip.convoyId + trip.timestamp}
                onClick={() => setSelectedTrip(trip)}
                className={`shrink-0 px-3 py-1.5 rounded-lg border font-display text-xs transition-colors ${
                  selectedTrip?.convoyId === trip.convoyId && selectedTrip?.convoyId !== activeConvoyId
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-secondary/40 border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                {trip.convoyCode} • {formatDate(trip.timestamp)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {stats.length === 0 ? (
          <div className="text-center py-16">
            <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="font-display text-muted-foreground">
              {selectedTrip ? "No stats yet — start driving!" : "Join or create a convoy to track stats"}
            </p>
          </div>
        ) : (
          stats.map((driver) => (
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
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-px bg-border">
                <div className="bg-card p-4 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-primary" />
                    <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                      Top Speed
                    </span>
                    {driver.topSpeed === bestTopSpeed && driver.topSpeed > 0 && (
                      <Crown className="w-3 h-3 text-convoy-amber" />
                    )}
                  </div>
                  <span className="font-display text-2xl font-bold text-foreground">
                    {formatSpeed(driver.topSpeed)}
                  </span>
                </div>

                <div className="bg-card p-4 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-accent" />
                    <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                      Avg Speed
                    </span>
                  </div>
                  <span className="font-display text-2xl font-bold text-foreground">
                    {formatSpeed(driver.avgSpeed)}
                  </span>
                </div>

                <div className="bg-card p-4 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-primary" />
                    <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                      Best Accel
                    </span>
                    {driver.fastestAcceleration === bestAccel && driver.fastestAcceleration > 0 && (
                      <Crown className="w-3 h-3 text-convoy-amber" />
                    )}
                  </div>
                  <span className="font-display text-2xl font-bold text-foreground">
                    {formatAccel(driver.fastestAcceleration)}
                  </span>
                </div>

                <div className="bg-card p-4 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                    <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                      Hard Brake
                    </span>
                    {driver.hardestBrake === bestBrake && driver.hardestBrake > 0 && (
                      <Crown className="w-3 h-3 text-convoy-amber" />
                    )}
                  </div>
                  <span className="font-display text-2xl font-bold text-foreground">
                    {formatAccel(driver.hardestBrake)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <BottomTabBar />
    </div>
  );
};

export default TripStats;
