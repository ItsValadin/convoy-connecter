import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gauge, TrendingUp, TrendingDown, Activity, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface StatRow {
  sessionId: string;
  driverName: string;
  driverColor: string;
  topSpeed: number;
  avgSpeed: number;
  fastestAcceleration: number;
  hardestBrake: number;
}

const MS_TO_MPH = 2.237;

const formatSpeed = (ms: number) => `${Math.round(ms * MS_TO_MPH)} mph`;
const formatAccel = (ms2: number) => `${ms2.toFixed(1)} m/s²`;

const TripStats = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<StatRow[]>([]);
  const [convoyCode, setConvoyCode] = useState<string | null>(null);

  useEffect(() => {
    // Read convoy info from session storage
    const raw = localStorage.getItem("convoy-session");
    if (!raw) {
      navigate("/");
      return;
    }
    const session = JSON.parse(raw);
    setConvoyCode(session.convoyCode);

    const fetchStats = async () => {
      const { data } = await supabase
        .from("convoy_trip_stats")
        .select("*")
        .eq("convoy_id", session.convoyId);

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

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`trip-stats-page-${session.convoyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "convoy_trip_stats", filter: `convoy_id=eq.${session.convoyId}` },
        () => fetchStats()
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [navigate]);

  // Find who has the best stat in each category
  const bestTopSpeed = stats.length > 0 ? Math.max(...stats.map(s => s.topSpeed)) : 0;
  const bestAccel = stats.length > 0 ? Math.max(...stats.map(s => s.fastestAcceleration)) : 0;
  const bestBrake = stats.length > 0 ? Math.max(...stats.map(s => s.hardestBrake)) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border safe-top">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => navigate("/")}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold tracking-tight glow-text">
              TRIP STATS
            </h1>
            <p className="text-xs text-muted-foreground">
              {convoyCode ? `Convoy ${convoyCode}` : "Loading..."} • {stats.length} driver{stats.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {stats.length === 0 ? (
          <div className="text-center py-16">
            <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="font-display text-muted-foreground">No stats yet — start driving!</p>
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
                {/* Top Speed */}
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

                {/* Avg Speed */}
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

                {/* Fastest Acceleration */}
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

                {/* Hardest Brake */}
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
    </div>
  );
};

export default TripStats;
