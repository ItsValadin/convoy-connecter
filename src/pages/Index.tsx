import { useState, useEffect, useCallback, useRef } from "react";
import L from "leaflet";
import ConvoyMap from "@/components/ConvoyMap";
import ConvoyChat from "@/components/ConvoyChat";
import DestinationSearch from "@/components/DestinationSearch";
import OffscreenIndicators from "@/components/OffscreenIndicators";
import ConvoyPanel from "@/components/ConvoyPanel";
import NavigationPanel, { type RouteInfo } from "@/components/NavigationPanel";
import { useNavigationAlerts, haversineDistance } from "@/hooks/useNavigationAlerts";
import { toast } from "sonner";
import { Crosshair, Volume2, VolumeX, Navigation, Clock, Gauge, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConvoy } from "@/hooks/useConvoy";
import { fetchRoute, type RouteGeometry } from "@/lib/routing";
import { useNavigate } from "react-router-dom";
import { useWakeLock } from "@/hooks/useWakeLock";

const DEFAULT_CENTER: [number, number] = [34.0522, -118.2437]; // LA

const Index = () => {
  const navigate = useNavigate();
  useWakeLock();
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;

  useEffect(() => {
    const dismissed = localStorage.getItem("convoy-install-dismissed");
    if (!isStandalone && !dismissed) {
      const timer = setTimeout(() => setShowInstallBanner(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [isStandalone]);
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

  const [followMode, setFollowMode] = useState(false);

  const handleCenterOnMe = useCallback(() => {
    const self = drivers.find((d) => d.id === sessionId);
    if (self && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([self.lat, self.lng], 19, { duration: 0.8 });
      setFollowMode((prev) => !prev);
    } else if (mapInstanceRef.current && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          mapInstanceRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 19, { duration: 0.8 });
        },
        () => toast.error("Unable to get your location")
      );
    } else {
      toast.error("No GPS position yet");
    }
  }, [drivers, sessionId]);

  // Follow mode: track user position continuously (north-up, no rotation)
  useEffect(() => {
    if (!followMode) return;
    const self = drivers.find((d) => d.id === sessionId);
    if (self && mapInstanceRef.current) {
      mapInstanceRef.current.setView([self.lat, self.lng], mapInstanceRef.current.getZoom(), { animate: true, duration: 0.3 });
    }
  }, [followMode, drivers, sessionId]);

  // Disable follow mode on user drag and reset rotation
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const onDrag = () => {
      setFollowMode(false);
      const container = map.getContainer();
      if (container) {
        container.style.transition = "transform 0.5s ease";
        container.style.transform = "rotate(0deg)";
      }
    };
    map.on("dragstart", onDrag);
    return () => { map.off("dragstart", onDrag); };
  }, [convoyCode]);

  // Try to get initial position for map center and fly to it
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!hasSetInitialCenter.current) {
            const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            setCenter(coords);
            hasSetInitialCenter.current = true;
            // Fly map to user's location once GPS resolves
            if (mapInstanceRef.current) {
              mapInstanceRef.current.flyTo(coords, 16, { duration: 1 });
            }
          }
        },
        () => {} // silently fail
      );
    }
  }, []);

  // Auto-pan to user when joining/creating a convoy
  const hasAutopannedToConvoy = useRef(false);
  useEffect(() => {
    if (!convoyCode) {
      hasAutopannedToConvoy.current = false;
      return;
    }
    const self = drivers.find((d) => d.id === sessionId);
    if (self && !hasAutopannedToConvoy.current && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([self.lat, self.lng], 17, { duration: 0.8 });
      hasAutopannedToConvoy.current = true;
    }
  }, [convoyCode, drivers, sessionId]);

  // Fetch route when destination changes (debounced to avoid spamming OSRM)
  const lastRouteFetchRef = useRef(0);
  useEffect(() => {
    if (!destination) {
      setRouteInfo(null);
      setRouteCoordinates(null);
      lastRouteFetchRef.current = 0;
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
          // Auto-fit map to show driver + destination on first route
          if (mapInstanceRef.current) {
            const bounds = L.latLngBounds(
              [self.lat, self.lng],
              [destination.lat, destination.lng]
            );
            mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, duration: 0.8 });
          }
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

  // Live ETA: scale route duration by remaining distance ratio
  const liveEta = (() => {
    if (!routeInfo || !self || !destination) return null;
    const currentDist = haversineDistance(self.lat, self.lng, destination.lat, destination.lng);
    const routeStartDist = routeInfo.distance; // total route distance in meters
    if (routeStartDist <= 0) return null;
    const ratio = Math.min(currentDist / routeStartDist, 1);
    const remainingSec = routeInfo.duration * ratio;
    const arrivalTime = new Date(Date.now() + remainingSec * 1000);
    return { remainingSec, arrivalTime };
  })();

  const formatEta = (seconds: number) => {
    if (seconds < 60) return "< 1 min";
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      {/* Next turn banner + ETA */}
      {convoyCode && destination && nextStep && nextStep.instruction && (
        <div className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] sm:top-4 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-lg">
          <div className="bg-primary text-primary-foreground rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3 shadow-lg">
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
            {liveEta && (
              <div className="text-right shrink-0">
                <p className="font-display text-sm font-bold">{formatEta(liveEta.remainingSec)}</p>
                <p className="font-display text-[10px] opacity-80 flex items-center gap-0.5 justify-end">
                  <Clock className="w-3 h-3" />
                  {formatTime(liveEta.arrivalTime)}
                </p>
              </div>
            )}
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
      {convoyCode && (
        <OffscreenIndicators
          drivers={drivers}
          map={mapInstanceRef.current}
          sessionId={sessionId}
          onArrowClick={(_id, lat, lng) => {
            mapInstanceRef.current?.flyTo([lat, lng], 16, { duration: 0.8 });
          }}
        />
      )}
      <ConvoyPanel
        drivers={drivers}
        convoyCode={convoyCode}
        destination={destination}
        onCreateConvoy={handleCreate}
        onJoinConvoy={handleJoin}
        onLeaveConvoy={handleLeave}
        onDriverClick={(driver) => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([driver.lat, driver.lng], 16, { duration: 0.8 });
          }
        }}
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
          hasBanner={!!destination && !!nextStep?.instruction}
          userLat={self?.lat ?? null}
          userLng={self?.lng ?? null}
        />
      )}

      {/* Navigation panel */}
      {convoyCode && destination && (
        <div className="absolute bottom-24 left-2 sm:left-4 z-10 flex items-end gap-2 sm:gap-3">
          <NavigationPanel route={routeInfo} loading={routeLoading} liveEtaSec={liveEta?.remainingSec} arrivalTime={liveEta?.arrivalTime} />
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
      {convoyCode && self && (
          <div className="absolute top-[calc(7rem+env(safe-area-inset-top,0px))] sm:top-20 right-2 sm:right-4 z-10 bg-card/90 backdrop-blur-xl border border-border rounded-xl px-3 py-2 flex items-center gap-2 shadow-lg">
            <Gauge className="w-5 h-5 text-primary" />
            <div className="text-right">
              <p className="font-display text-lg font-bold text-foreground leading-none">
                {typeof self.speed === "number" ? Math.round(self.speed * 3.6) : 0}
              </p>
              <p className="font-display text-[10px] text-muted-foreground leading-tight">km/h</p>
            </div>
          </div>
      )}
      <Button
        size="icon"
        variant="outline"
        className={`absolute bottom-28 right-2 sm:right-4 z-10 backdrop-blur-xl border-border ${followMode ? "bg-primary/20 border-primary/50" : "bg-card/90 hover:bg-primary/20 hover:border-primary/50"}`}
        onClick={handleCenterOnMe}
        title={followMode ? "Stop following" : "Center on me"}
      >
        <Crosshair className={`w-5 h-5 ${followMode ? "text-primary animate-pulse" : "text-primary"}`} />
      </Button>

      {/* Bottom status bar */}
      {convoyCode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-card/90 backdrop-blur-xl border border-border rounded-full px-3 sm:px-5 py-2 sm:py-2.5 flex items-center gap-2 sm:gap-4 max-w-[90vw]">
          <div className={`w-2 h-2 rounded-full ${gpsActive ? "bg-primary" : "bg-convoy-amber"} animate-pulse`} />
          <span className="font-display text-xs text-muted-foreground">
            {gpsActive ? "GPS LIVE" : "GPS PENDING"} • {drivers.length} vehicles tracked
          </span>
        </div>
      )}
      {/* Install PWA banner */}
      {showInstallBanner && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-500">
          <div className="bg-card/95 backdrop-blur-xl border border-primary/30 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
            <Download className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Install Convoy</p>
              <p className="text-xs text-muted-foreground">Add to home screen for the best experience</p>
            </div>
            <Button
              size="sm"
              className="shrink-0 h-8 text-xs"
              onClick={() => navigate("/install")}
            >
              Install
            </Button>
            <button
              onClick={() => {
                setShowInstallBanner(false);
                localStorage.setItem("convoy-install-dismissed", "true");
              }}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
