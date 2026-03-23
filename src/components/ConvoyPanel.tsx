import { useState } from "react";
import { Users, Copy, Plus, LogIn, Navigation, Crown, Circle } from "lucide-react";
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

interface ConvoyPanelProps {
  drivers: Driver[];
  convoyCode: string | null;
  onCreateConvoy: (name: string) => void;
  onJoinConvoy: (code: string, name: string) => void;
}

const ConvoyPanel = ({ drivers, convoyCode, onCreateConvoy, onJoinConvoy }: ConvoyPanelProps) => {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"idle" | "create" | "join">("idle");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (convoyCode) {
      navigator.clipboard.writeText(convoyCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isInConvoy = convoyCode !== null;

  return (
    <div className="absolute top-4 left-4 z-10 w-80">
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
              {drivers.map((driver) => (
                <div
                  key={driver.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-secondary/40 border border-border/50"
                >
                  <div
                    className="w-3 h-3 rounded-full pulse-marker"
                    style={{ backgroundColor: driver.color }}
                  />
                  <span className="font-display text-sm text-foreground flex-1">{driver.name}</span>
                  {driver.isLeader ? (
                    <Crown className="w-3.5 h-3.5 text-convoy-amber" />
                  ) : (
                    <Circle className="w-2.5 h-2.5 text-muted-foreground" />
                  )}
                </div>
              ))}
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
  );
};

export default ConvoyPanel;
