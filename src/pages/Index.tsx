import { useState, useEffect, useCallback, useRef } from "react";
import L from "leaflet";
import ConvoyMap from "@/components/ConvoyMap";
import ConvoyChat from "@/components/ConvoyChat";
import DestinationSearch from "@/components/DestinationSearch";
import ConvoyPanel from "@/components/ConvoyPanel";
import NavigationPanel, { type RouteInfo } from "@/components/NavigationPanel";
import { useNavigationAlerts, haversineDistance } from "@/hooks/useNavigationAlerts";
import { toast } from "sonner";
import { Crosshair, Volume2, VolumeX, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConvoy } from "@/hooks/useConvoy";
import { fetchRoute, type RouteGeometry } from "@/lib/routing";

const DEFAULT_CENTER: [number, number] = [34.0522, -118.2437]; // LA

const Index = () => {
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const hasSetInitialCenter = useRef(false);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][] | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

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

  // Fetch route when destination changes (debounced to avoid spamming OSRM)
  const lastRouteFetchRef = useRef(0);
  useEffect(() => {
    if (!destination) {
      setRouteInfo(null);
      setRouteCoordinates(null);
      return;
    }

    const self = drivers.find((d) => d.id === sessionId);
    if (!self) return;

    // Throttle: re-fetch at most every 15s for position changes, instant for new destination
    const now = Date.now();
    const timerId = setTimeout(() => {
      if (Date.now() - lastRouteFetchRef.current < 10000) return;
      lastRouteFetchRef.current = Date.now();
      setRouteLoading(true);
      fetchRoute(self.lat, self.lng, destination.lat, destination.lng).then((result) => {
        setRouteLoading(false);
        if (result) {
          setRouteInfo(result.info);
          setRouteCoordinates(result.coordinates);
        }
      });
    }, lastRouteFetchRef.current === 0 ? 0 : 10000);

    return () => clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, sessionId]);

  // Voice turn-by-turn alerts
  const self = drivers.find((d) => d.id === sessionId);
  const { muted, toggleMute, nextStep } = useNavigationAlerts(
    routeInfo?.steps,
    self?.lat ?? null,
    self?.lng ?? null,
    !!convoyCode && !!destination
  );

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      {/* Next turn banner */}
      {convoyCode && destination && nextStep && nextStep.instruction && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-lg">
          <div className="bg-primary text-primary-foreground rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
            <Navigation className="w-6 h-6 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-semibold leading-snug truncate">
                {nextStep.instruction}
              </p>
              <p className="font-display text-xs opacity-80">
                {nextStep.distanceM >= 1000
                  ? `${(nextStep.distanceM / 1000).toFixed(1)} km`
                  : `${Math.round(nextStep.distanceM)} m`}
                {" • "}Step {nextStep.stepIndex + 1} of {nextStep.totalSteps}
              </p>
            </div>
          </div>
        </div>
      )}
      <ConvoyMap
        drivers={drivers}
        center={center}
        destination={destination}
        routeCoordinates={routeCoordinates}
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

      {/* Destination search for leader */}
      {convoyCode && isLeader && (
        <DestinationSearch
          onSelectDestination={handleSetDestination}
          onClearDestination={handleClearDestination}
          hasDestination={!!destination}
        />
      )}

      {/* Navigation panel */}
      {convoyCode && destination && (
        <div className="absolute bottom-20 left-4 z-10 flex items-end gap-2">
          <NavigationPanel route={routeInfo} loading={routeLoading} />
          <Button
            size="icon"
            variant="outline"
            className="mb-0 bg-card/90 backdrop-blur-xl border-border hover:bg-primary/20 hover:border-primary/50"
            onClick={toggleMute}
            title={muted ? "Unmute voice alerts" : "Mute voice alerts"}
          >
            {muted ? <VolumeX className="w-4 h-4 text-muted-foreground" /> : <Volume2 className="w-4 h-4 text-primary" />}
          </Button>
        </div>
      )}
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
