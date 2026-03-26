import { useState, useEffect, useCallback, useRef } from "react";
import L from "leaflet";
import ConvoyMap from "@/components/ConvoyMap";
import ConvoyChat from "@/components/ConvoyChat";
import DestinationSearch from "@/components/DestinationSearch";
import OffscreenIndicators from "@/components/OffscreenIndicators";
import ConnectionBanner from "@/components/ConnectionBanner";
import ConvoyPanel from "@/components/ConvoyPanel";
import NavigationPanel, { type RouteInfo } from "@/components/NavigationPanel";
import { useNavigationAlerts, haversineDistance } from "@/hooks/useNavigationAlerts";
import { useHazards, type HazardType, getHazardLabel } from "@/hooks/useHazards";
import { toast } from "sonner";
import { Crosshair, Volume2, VolumeX, Navigation, Clock, Gauge, Download, X, Sun, Moon, RotateCw, AlertTriangle } from "lucide-react";
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
  const [mapTheme, setMapTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("convoy-map-theme") as "dark" | "light") || "dark";
  });
  const [routeLoading, setRouteLoading] = useState(false);
  const [offRoute, setOffRoute] = useState(false);
  const offRouteCounterRef = useRef(0);
  const lastOffRouteCheckRef = useRef(0);

  const {
    convoyCode,
    convoyId,
    drivers,
    gpsActive,
    destination,
    isLeader,
    connectionStatus,
    sessionId,
    handleCreate,
    handleJoin,
    handleLeave,
    handleSetDestination,
    handleClearDestination,
  } = useConvoy(center);

  const { hazards, addHazard, removeHazard } = useHazards(convoyId);
  const [showHazardPicker, setShowHazardPicker] = useState(false);

  const HAZARD_TYPES: { type: HazardType; emoji: string; label: string }[] = [
    { type: "warning", emoji: "⚠️", label: "Warning" },
    { type: "accident", emoji: "🚗", label: "Accident" },
    { type: "police", emoji: "🚔", label: "Police" },
    { type: "road_closed", emoji: "🚧", label: "Road Closed" },
    { type: "debris", emoji: "🪨", label: "Debris" },
  ];

  const handleDropHazard = useCallback((type: HazardType) => {
    const self = drivers.find((d) => d.id === sessionId);
    if (!self) return;
    addHazard(self.lat, self.lng, type, sessionId, self.name, self.color);
    setShowHazardPicker(false);
  }, [drivers, sessionId, addHazard]);

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

  // Disable follow mode on user drag
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const onDrag = () => setFollowMode(false);
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

  // Arrival detection: auto-clear destination when leader is within 50m
  const hasArrivedRef = useRef(false);
  useEffect(() => {
    if (!destination) {
      hasArrivedRef.current = false;
      return;
    }
    if (!isLeader || hasArrivedRef.current) return;
    const self = drivers.find((d) => d.id === sessionId);
    if (!self) return;
    const dist = haversineDistance(self.lat, self.lng, destination.lat, destination.lng);
    if (dist <= 50) {
      hasArrivedRef.current = true;
      handleClearDestination();
      toast.success("🎉 You've arrived! Destination reached.", { duration: 5000 });
    }
  }, [destination, isLeader, drivers, sessionId, handleClearDestination]);

  // Off-route detection: check if driver is >100m from nearest route polyline point
  const OFF_ROUTE_THRESHOLD_M = 100;
  const OFF_ROUTE_COOLDOWN_MS = 10000;
  useEffect(() => {
    if (!routeCoordinates?.length || !destination || !convoyCode) return;
    const selfDriver = drivers.find((d) => d.id === sessionId);
    if (!selfDriver) return;

    const now = Date.now();
    if (now - lastOffRouteCheckRef.current < OFF_ROUTE_COOLDOWN_MS) return;

    let minDist = Infinity;
    for (const [lat, lng] of routeCoordinates) {
      const dist = haversineDistance(selfDriver.lat, selfDriver.lng, lat, lng);
      if (dist < minDist) minDist = dist;
      if (dist < OFF_ROUTE_THRESHOLD_M) break; // early exit — on route
    }

    if (minDist > OFF_ROUTE_THRESHOLD_M) {
      lastOffRouteCheckRef.current = now;
      setOffRoute(true);
      lastRouteFetchRef.current = 0; // allow immediate re-fetch
      offRouteCounterRef.current += 1;
    }
  }, [drivers, sessionId, routeCoordinates, destination, convoyCode]);

  // Fetch route when destination changes or off-route triggers recalculation
  const lastRouteFetchRef = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const offRouteTrigger = offRouteCounterRef.current;
  useEffect(() => {
    if (!destination) {
      setRouteInfo(null);
      setRouteCoordinates(null);
      lastRouteFetchRef.current = 0;
      setOffRoute(false);
      return;
    }

    const self = drivers.find((d) => d.id === sessionId);
    if (!self) return;

    const isRecalc = offRoute;
    const timerId = setTimeout(() => {
      if (Date.now() - lastRouteFetchRef.current < 10000) return;
      lastRouteFetchRef.current = Date.now();
      setRouteLoading(true);
      fetchRoute(self.lat, self.lng, destination.lat, destination.lng).then((result) => {
        setRouteLoading(false);
        setOffRoute(false);
        if (result) {
          setRouteInfo(result.info);
          setRouteCoordinates(result.coordinates);
          if (!isRecalc && mapInstanceRef.current) {
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
  }, [destination, sessionId, offRouteTrigger]);

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
      <ConnectionBanner visible={connectionStatus === "disconnected" && !!convoyCode} />
      {/* Off-route recalculating banner */}
      {offRoute && convoyCode && destination && (
        <div className="fixed top-[calc(env(safe-area-inset-top,0px)+2.5rem)] left-0 right-0 z-50 bg-primary text-primary-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg animate-in slide-in-from-top fade-in duration-300">
          <RotateCw className="h-4 w-4 animate-spin" />
          <span>Off route — recalculating...</span>
        </div>
      )}
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
        hazards={hazards.map((h) => ({
          id: h.id,
          lat: h.lat,
          lng: h.lng,
          hazardType: h.hazardType,
          reporterName: h.reporterName,
          reporterColor: h.reporterColor,
          note: h.note,
          createdAt: h.createdAt,
        }))}
        isLeader={isLeader}
        mapTheme={mapTheme}
        onMapReady={(map) => { mapInstanceRef.current = map; }}
        onMapClick={isLeader ? handleSetDestination : undefined}
        onHazardClick={(id) => {
          const self = drivers.find((d) => d.id === sessionId);
          const hazard = hazards.find((h) => h.id === id);
          if (hazard && self && hazard.sessionId === sessionId) {
            removeHazard(id);
            toast("Hazard removed");
          }
        }}
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
      <div className="absolute bottom-28 right-2 sm:right-4 z-10 flex flex-col gap-2">
        <Button
          size="icon"
          variant="outline"
          className="bg-card/90 backdrop-blur-xl border-border hover:bg-primary/20 hover:border-primary/50"
          onClick={() => {
            const next = mapTheme === "dark" ? "light" : "dark";
            setMapTheme(next);
            localStorage.setItem("convoy-map-theme", next);
          }}
          title={mapTheme === "dark" ? "Switch to light map" : "Switch to dark map"}
        >
          {mapTheme === "dark" ? <Sun className="w-5 h-5 text-primary" /> : <Moon className="w-5 h-5 text-primary" />}
        </Button>
        <Button
          size="icon"
          variant="outline"
          className={`backdrop-blur-xl border-border ${followMode ? "bg-primary/20 border-primary/50" : "bg-card/90 hover:bg-primary/20 hover:border-primary/50"}`}
          onClick={handleCenterOnMe}
          title={followMode ? "Stop following" : "Center on me"}
        >
          <Crosshair className={`w-5 h-5 ${followMode ? "text-primary animate-pulse" : "text-primary"}`} />
        </Button>
      </div>

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
