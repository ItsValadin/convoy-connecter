import { useState, useEffect, useCallback, useRef } from "react";
import ConvoyMap from "@/components/ConvoyMap";
import ConvoyPanel from "@/components/ConvoyPanel";
import { toast } from "sonner";

interface Driver {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  isLeader: boolean;
  speed?: number | null;   // m/s from GPS
  heading?: number | null;  // degrees from GPS
}

const DRIVER_COLORS = ["#22c55e", "#06b6d4", "#f59e0b", "#ef4444", "#a855f7", "#ec4899"];

const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const simulateDrivers = (center: [number, number], count: number, tick: number): { lat: number; lng: number }[] => {
  return Array.from({ length: count }, (_, i) => {
    const angle = tick * 0.02 + (i * Math.PI * 2) / count;
    const radius = 0.008 + Math.sin(tick * 0.01 + i) * 0.003;
    return {
      lat: center[0] + Math.sin(angle) * radius,
      lng: center[1] + Math.cos(angle) * radius,
    };
  });
};

const DEMO_NAMES = ["Alex", "Jordan", "Sam", "Riley"];
const DEFAULT_CENTER: [number, number] = [34.0522, -118.2437];

const Index = () => {
  const [convoyCode, setConvoyCode] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [tick, setTick] = useState(0);
  const [gpsActive, setGpsActive] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const hasSetInitialCenter = useRef(false);

  // Request GPS and watch position
  const startGpsTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed, heading } = position.coords;

        // Set map center to user's location on first fix
        if (!hasSetInitialCenter.current) {
          setCenter([latitude, longitude]);
          hasSetInitialCenter.current = true;
          toast.success("GPS locked — tracking your position");
        }

        setGpsActive(true);

        // Update the "self" driver position with speed/heading
        setDrivers((prev) =>
          prev.map((d) =>
            d.id === "self" ? { ...d, lat: latitude, lng: longitude, speed, heading } : d
          )
        );
      },
      (error) => {
        console.error("GPS error:", error);
        setGpsActive(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            toast.error("Location permission denied. Enable it in browser settings.");
            break;
          case error.POSITION_UNAVAILABLE:
            toast.error("Location unavailable. Check your GPS.");
            break;
          case error.TIMEOUT:
            toast.error("Location request timed out.");
            break;
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );
  }, []);

  // Stop GPS on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Try to get initial position for map center (before convoy join)
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!hasSetInitialCenter.current) {
            setCenter([pos.coords.latitude, pos.coords.longitude]);
            hasSetInitialCenter.current = true;
          }
        },
        () => {} // silently fail, keep default center
      );
    }
  }, []);

  const handleCreate = useCallback((name: string) => {
    const code = generateCode();
    setConvoyCode(code);

    const selfDriver: Driver = {
      id: "self",
      name,
      lat: center[0],
      lng: center[1],
      color: DRIVER_COLORS[0],
      isLeader: true,
    };

    const simulated = DEMO_NAMES.slice(0, 3).map((dName, i) => ({
      id: `sim-${i}`,
      name: dName,
      lat: center[0] + (Math.random() - 0.5) * 0.01,
      lng: center[1] + (Math.random() - 0.5) * 0.01,
      color: DRIVER_COLORS[i + 1],
      isLeader: false,
    }));

    setDrivers([selfDriver, ...simulated]);
    startGpsTracking();
  }, [center, startGpsTracking]);

  const handleJoin = useCallback((code: string, name: string) => {
    setConvoyCode(code);

    const leader: Driver = {
      id: "leader",
      name: "Leader",
      lat: center[0],
      lng: center[1],
      color: DRIVER_COLORS[0],
      isLeader: true,
    };

    const selfDriver: Driver = {
      id: "self",
      name,
      lat: center[0] + 0.005,
      lng: center[1] + 0.003,
      color: DRIVER_COLORS[1],
      isLeader: false,
    };

    const simulated = DEMO_NAMES.slice(0, 2).map((dName, i) => ({
      id: `sim-${i}`,
      name: dName,
      lat: center[0] + (Math.random() - 0.5) * 0.01,
      lng: center[1] + (Math.random() - 0.5) * 0.01,
      color: DRIVER_COLORS[i + 2],
      isLeader: false,
    }));

    setDrivers([leader, selfDriver, ...simulated]);
    startGpsTracking();
  }, [center, startGpsTracking]);

  // Simulate other drivers' movement
  useEffect(() => {
    if (!convoyCode || drivers.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(interval);
  }, [convoyCode, drivers.length]);

  useEffect(() => {
    if (tick === 0 || drivers.length === 0) return;

    const nonSelfDrivers = drivers.filter((d) => d.id !== "self");
    const simPositions = simulateDrivers(center, nonSelfDrivers.length, tick);

    setDrivers((prev) => {
      let simIdx = 0;
      return prev.map((driver) => {
        if (driver.id === "self") return driver; // GPS updates this
        const sim = simPositions[simIdx++];
        if (!sim) return driver;
        return { ...driver, lat: sim.lat, lng: sim.lng };
      });
    });
  }, [tick, center]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      <ConvoyMap drivers={drivers} center={center} />
      <ConvoyPanel
        drivers={drivers}
        convoyCode={convoyCode}
        onCreateConvoy={handleCreate}
        onJoinConvoy={handleJoin}
      />

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
