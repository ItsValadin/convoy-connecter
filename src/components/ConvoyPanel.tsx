import { useState } from "react";
import { Users, Copy, Plus, LogIn, Navigation, Crown, Circle, LogOut, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

interface Destination {
  lat: number;
  lng: number;
  label?: string | null;
}

interface ConvoyPanelProps {
  drivers: Driver[];
  convoyCode: string | null;
  destination?: Destination | null;
  onCreateConvoy: (name: string) => void;
  onJoinConvoy: (code: string, name: string) => void;
  onLeaveConvoy?: () => void;
}

const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDistance = (km: number): string => {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
};

const ConvoyPanel = ({ drivers, convoyCode, onCreateConvoy, onJoinConvoy, onLeaveConvoy }: ConvoyPanelProps) => {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"idle" | "create" | "join">("idle");
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleCopy = () => {
    if (convoyCode) {
      navigator.clipboard.writeText(convoyCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isInConvoy = convoyCode !== null;

  return (
    <div className="absolute top-4 left-4 z-10 flex items-start gap-2">
      {/* Panel */}
      <div className={`w-80 transition-all duration-300 ${collapsed ? "-translate-x-[calc(100%+1rem)] opacity-0 pointer-events-none" : "translate-x-0 opacity-100"}`}>
      {/* Header */}
      <div className="bg-card/95 backdrop-blur-xl border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center glow-primary">
              <Navigation className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-foreground glow-text tracking-tight">
                CONVOY
              </h1>
              <p className="text-xs text-muted-foreground">
                {isInConvoy ? `${drivers.length} drivers active` : "Live group navigation"}
              </p>
            </div>
          </div>
        </div>

        {/* Convoy Code */}
        {isInConvoy && (
          <div className="p-3 border-b border-border bg-secondary/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Convoy Code</p>
                <p className="font-display text-lg font-bold text-primary tracking-wider">{convoyCode}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
        )}

        {/* Driver list */}
        {isInConvoy && (
          <div className="p-3 max-h-64 overflow-y-auto">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Drivers
            </p>
            <div className="space-y-2">
              {drivers.map((driver) => {
                const leader = drivers.find((d) => d.isLeader);
                const dist = leader && !driver.isLeader
                  ? formatDistance(haversineDistance(driver.lat, driver.lng, leader.lat, leader.lng))
                  : null;
                return (
                  <div
                    key={driver.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-secondary/40 border border-border/50"
                  >
                    <div
                      className="w-3 h-3 rounded-full pulse-marker"
                      style={{ backgroundColor: driver.color }}
                    />
                    <span className="font-display text-sm text-foreground flex-1">{driver.name}</span>
                    {dist && (
                      <span className="font-display text-[10px] text-muted-foreground">{dist}</span>
                    )}
                    {driver.isLeader ? (
                      <Crown className="w-3.5 h-3.5 text-convoy-amber" />
                    ) : (
                      <Circle className="w-2.5 h-2.5 text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-3 pb-3">
              <Button
                variant="outline"
                className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 font-display"
                onClick={onLeaveConvoy}
              >
                <LogOut className="w-4 h-4 mr-2" /> Leave Convoy
              </Button>
            </div>
          </div>
        )}

        {/* Actions */}
        {!isInConvoy && (
          <div className="p-4 space-y-3">
            {mode === "idle" && (
              <div className="space-y-2">
                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-display"
                  onClick={() => setMode("create")}
                >
                  <Plus className="w-4 h-4 mr-2" /> Create Convoy
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-primary/30 text-primary hover:bg-primary/10 font-display"
                  onClick={() => setMode("join")}
                >
                  <LogIn className="w-4 h-4 mr-2" /> Join Convoy
                </Button>
              </div>
            )}

            {mode === "create" && (
              <div className="space-y-2">
                <Input
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-display"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-border text-muted-foreground"
                    onClick={() => setMode("idle")}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-display"
                    onClick={() => name && onCreateConvoy(name)}
                    disabled={!name}
                  >
                    Start Convoy
                  </Button>
                </div>
              </div>
            )}

            {mode === "join" && (
              <div className="space-y-2">
                <Input
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-display"
                />
                <Input
                  placeholder="Convoy code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-display tracking-widest text-center text-lg"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-border text-muted-foreground"
                    onClick={() => setMode("idle")}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-display"
                    onClick={() => name && joinCode && onJoinConvoy(joinCode, name)}
                    disabled={!name || joinCode.length < 4}
                  >
                    Join
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={`mt-2 flex-shrink-0 w-8 h-8 rounded-lg bg-card/95 backdrop-blur-xl border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-all duration-300 ${collapsed ? "absolute left-0 top-0 mt-0" : ""}`}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </div>
  );
};

export default ConvoyPanel;
