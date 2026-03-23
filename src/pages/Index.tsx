import { useState, useEffect, useCallback, useRef } from "react";
import L from "leaflet";
import ConvoyMap from "@/components/ConvoyMap";
import ConvoyChat from "@/components/ConvoyChat";
import ConvoyPanel from "@/components/ConvoyPanel";
import { toast } from "sonner";
import { Crosshair, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConvoy } from "@/hooks/useConvoy";

const DEFAULT_CENTER: [number, number] = [34.0522, -118.2437];

const Index = () => {
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const hasSetInitialCenter = useRef(false);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const {
    convoyCode,
    convoyId,
    drivers,
    gpsActive,
    destination,
    isLeader,
    sessionId,
    handleCreate,
    handleJoin,
    handleLeave,
    handleSetDestination,
    handleClearDestination,
  } = useConvoy(center);

  const handleCenterOnMe = useCallback(() => {
    const self = drivers.find((d) => d.id === sessionId);
    if (self && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([self.lat, self.lng], 16, { duration: 0.8 });
    } else {
      toast.error("No GPS position yet");
    }
  }, [drivers, sessionId]);

  // Try to get initial position for map center
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!hasSetInitialCenter.current) {
            setCenter([pos.coords.latitude, pos.coords.longitude]);
            hasSetInitialCenter.current = true;
          }
        },
        () => {} // silently fail
      );
    }
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      <ConvoyMap
        drivers={drivers}
        center={center}
        destination={destination}
        isLeader={isLeader}
        onMapReady={(map) => { mapInstanceRef.current = map; }}
        onMapClick={isLeader ? handleSetDestination : undefined}
      />
      <ConvoyPanel
        drivers={drivers}
        convoyCode={convoyCode}
        onCreateConvoy={handleCreate}
        onJoinConvoy={handleJoin}
        onLeaveConvoy={handleLeave}
      />

      {/* Chat */}
      {convoyCode && convoyId && (() => {
        const self = drivers.find((d) => d.id === sessionId);
        return (
          <ConvoyChat
            convoyId={convoyId}
            sessionId={sessionId}
            senderName={self?.name ?? "Unknown"}
            senderColor={self?.color ?? "#22c55e"}
          />
        );
      })()}

      {/* Destination controls for leader */}
      {convoyCode && isLeader && destination && (
        <Button
          size="sm"
          variant="outline"
          className="absolute top-4 right-4 z-10 bg-card/90 backdrop-blur-xl border-destructive/50 text-destructive hover:bg-destructive/10 font-display"
          onClick={handleClearDestination}
          title="Clear destination"
        >
          <X className="w-4 h-4 mr-1.5" /> Clear Destination
        </Button>
      )}

      {/* Set destination hint for leader */}
      {convoyCode && isLeader && !destination && (
        <div className="absolute top-4 right-4 z-10 bg-card/90 backdrop-blur-xl border border-border rounded-lg px-3 py-2 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-destructive" />
          <span className="font-display text-[10px] text-muted-foreground">Right-click map to set destination</span>
        </div>
      )}

      {/* Center on me button */}
      {convoyCode && (
        <Button
          size="icon"
          variant="outline"
          className="absolute bottom-28 right-4 z-10 bg-card/90 backdrop-blur-xl border-border hover:bg-primary/20 hover:border-primary/50"
          onClick={handleCenterOnMe}
          title="Center on me"
        >
          <Crosshair className="w-5 h-5 text-primary" />
        </Button>
      )}

      {/* Bottom status bar */}
      {convoyCode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-card/90 backdrop-blur-xl border border-border rounded-full px-5 py-2.5 flex items-center gap-4">
          <div className={`w-2 h-2 rounded-full ${gpsActive ? "bg-primary" : "bg-convoy-amber"} animate-pulse`} />
          <span className="font-display text-xs text-muted-foreground">
            {gpsActive ? "GPS LIVE" : "GPS PENDING"} • {drivers.length} vehicles tracked
          </span>
        </div>
      )}
    </div>
  );
};

export default Index;
