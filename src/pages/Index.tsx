import { useState, useEffect, useCallback } from "react";
import ConvoyMap from "@/components/ConvoyMap";
import ConvoyPanel from "@/components/ConvoyPanel";

interface Driver {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  isLeader: boolean;
}

const DRIVER_COLORS = ["#22c55e", "#06b6d4", "#f59e0b", "#ef4444", "#a855f7", "#ec4899"];

const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

// Simulate other drivers moving around a center point
const simulateDrivers = (center: [number, number], count: number, tick: number): Omit<Driver, "id" | "name" | "color" | "isLeader">[] => {
  return Array.from({ length: count }, (_, i) => {
    const angle = (tick * 0.02 + (i * Math.PI * 2) / count);
    const radius = 0.008 + Math.sin(tick * 0.01 + i) * 0.003;
    return {
      lat: center[0] + Math.sin(angle) * radius,
      lng: center[1] + Math.cos(angle) * radius,
    };
  });
};

const DEMO_NAMES = ["Alex", "Jordan", "Sam", "Riley"];

const Index = () => {
  const [convoyCode, setConvoyCode] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [center] = useState<[number, number]>([34.0522, -118.2437]); // LA
  const [tick, setTick] = useState(0);

  const handleCreate = useCallback((name: string) => {
    const code = generateCode();
    setConvoyCode(code);

    // Add self as leader + simulated drivers
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
  }, [center]);

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
  }, [center]);

  // Simulate movement
  useEffect(() => {
    if (!convoyCode || drivers.length === 0) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 100);

    return () => clearInterval(interval);
  }, [convoyCode, drivers.length]);

  useEffect(() => {
    if (tick === 0 || drivers.length === 0) return;

    const simPositions = simulateDrivers(center, drivers.length - 1, tick);

    setDrivers((prev) =>
      prev.map((driver, i) => {
        if (i === 0) return driver; // Leader stays or moves slowly
        const sim = simPositions[i - 1];
        if (!sim) return driver;
        return { ...driver, lat: sim.lat, lng: sim.lng };
      })
    );
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
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="font-display text-xs text-muted-foreground">
            LIVE • {drivers.length} vehicles tracked
          </span>
        </div>
      )}
    </div>
  );
};

export default Index;
