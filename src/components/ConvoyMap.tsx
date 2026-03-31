import React, { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { SmoothMovementEngine, type SmoothedState } from "@/lib/smoothMovement";

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

interface HazardPin {
  id: string;
  lat: number;
  lng: number;
  hazardType: string;
  reporterName: string;
  reporterColor: string;
  note: string | null;
  createdAt: string;
}

type MapTheme = "dark" | "light";

interface ConvoyMapProps {
  drivers: Driver[];
  center: [number, number];
  destination?: Destination | null;
  routeCoordinates?: [number, number][] | null;
  hazards?: HazardPin[];
  isLeader?: boolean;
  mapTheme?: MapTheme;
  onMapReady?: (map: L.Map) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onHazardClick?: (hazardId: string) => void;
}

const createDriverIcon = (color: string, isLeader: boolean, speed?: number | null, heading?: number | null) => {
  const size = isLeader ? 18 : 14;
  const hasHeading = typeof heading === "number" && heading >= 0;
  const hasSpeed = typeof speed === "number" && speed >= 0;
  const speedKmh = hasSpeed ? Math.round(speed! * 3.6) : null;
  const rotation = hasHeading ? heading! : 0;

  const ring = isLeader ? `<circle cx="30" cy="30" r="18" fill="none" stroke="${color}" stroke-width="2" opacity="0.4"><animate attributeName="r" from="14" to="22" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite"/></circle>` : "";

  const headingArrow = hasHeading ? `<g transform="rotate(${rotation}, 30, 30)"><polygon points="30,4 36,16 24,16" fill="${color}" opacity="0.85"/></g>` : "";

  const speedLabel = speedKmh !== null ? `<text x="30" y="52" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="${color}">${speedKmh} km/h</text>` : "";

  const svg = `<svg width="60" height="58" viewBox="0 0 60 58" xmlns="http://www.w3.org/2000/svg">
    ${ring}
    ${headingArrow}
    <circle cx="30" cy="30" r="${size / 2 + 4}" fill="${color}" opacity="0.2"/>
    <circle cx="30" cy="30" r="${size / 2}" fill="${color}"/>
    ${isLeader && !hasHeading ? '<polygon points="30,18 34,26 26,26" fill="white" opacity="0.9"/>' : ""}
    ${speedLabel}
  </svg>`;

  return L.divIcon({
    html: svg,
    className: "convoy-marker",
    iconSize: [60, 58],
    iconAnchor: [30, 30],
  });
};

const createDestinationIcon = () => {
  const svg = `<svg width="40" height="50" viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 0 C9 0 0 9 0 20 C0 35 20 50 20 50 C20 50 40 35 40 20 C40 9 31 0 20 0Z" fill="#ef4444" opacity="0.9"/>
    <circle cx="20" cy="18" r="7" fill="white" opacity="0.9"/>
    <circle cx="20" cy="18" r="7" fill="none" stroke="#ef4444" stroke-width="2" opacity="0.5">
      <animate attributeName="r" from="7" to="12" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite"/>
    </circle>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "convoy-marker",
    iconSize: [40, 50],
    iconAnchor: [20, 50],
  });
};

const HAZARD_ICONS: Record<string, string> = {
  warning: "⚠️",
  accident: "🚗",
  police: "🚔",
  road_closed: "🚧",
  debris: "🪨",
};

const createHazardIcon = (hazardType: string) => {
  const emoji = HAZARD_ICONS[hazardType] || "⚠️";
  const svg = `<div style="
    width: 36px; height: 36px;
    background: hsl(0 0% 10% / 0.9);
    border: 2px solid hsl(45 100% 60%);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; line-height: 1;
    box-shadow: 0 0 12px hsl(45 100% 50% / 0.4);
    animation: hazard-pulse 2s ease-in-out infinite;
  ">${emoji}</div>`;
  return L.divIcon({
    html: svg,
    className: "convoy-marker",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

const TILE_URLS: Record<MapTheme, string> = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
};

// Throttle icon updates to avoid excessive DOM churn
const ICON_UPDATE_INTERVAL_MS = 300;

const ConvoyMap = React.memo(({ drivers, center, destination, routeCoordinates, hazards = [], isLeader, mapTheme = "dark", onMapReady, onMapClick, onHazardClick }: ConvoyMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const hazardMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const onHazardClickRef = useRef(onHazardClick);
  onHazardClickRef.current = onHazardClick;
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // Track driver metadata for icon updates
  const driverMetaRef = useRef<Map<string, { color: string; isLeader: boolean; name: string }>>(new Map());
  const lastIconUpdateRef = useRef<Map<string, number>>(new Map());

  // Smooth movement engine
  const engineRef = useRef<SmoothMovementEngine | null>(null);

  // Initialize engine with marker update callback
  useEffect(() => {
    const engine = new SmoothMovementEngine((id: string, state: SmoothedState) => {
      const marker = markersRef.current.get(id);
      if (!marker) return;

      // Update position smoothly
      marker.setLatLng([state.lat, state.lng]);

      // Throttle icon updates (SVG recreation is expensive)
      const now = performance.now();
      const lastUpdate = lastIconUpdateRef.current.get(id) || 0;
      if (now - lastUpdate > ICON_UPDATE_INTERVAL_MS) {
        const meta = driverMetaRef.current.get(id);
        if (meta) {
          marker.setIcon(createDriverIcon(meta.color, meta.isLeader, state.speed, state.heading));
        }
        lastIconUpdateRef.current.set(id, now);
      }
    });
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      center,
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    tileLayerRef.current = L.tileLayer(TILE_URLS[mapTheme], {
      maxZoom: 19,
      className: mapTheme === "dark" ? "map-tiles-lighter" : "map-tiles-darker",
    }).addTo(mapRef.current);

    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);

    mapRef.current.on("contextmenu", (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    onMapReady?.(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Swap tile layer when theme changes
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    tileLayerRef.current.remove();
    tileLayerRef.current = L.tileLayer(TILE_URLS[mapTheme], {
      maxZoom: 19,
      className: mapTheme === "dark" ? "map-tiles-lighter" : "map-tiles-darker",
    }).addTo(mapRef.current);
  }, [mapTheme]);

  // Feed driver updates to smooth engine & manage markers
  useEffect(() => {
    if (!mapRef.current || !engineRef.current) return;
    const engine = engineRef.current;

    drivers.forEach((driver) => {
      // Store metadata for icon creation
      driverMetaRef.current.set(driver.id, {
        color: driver.color,
        isLeader: driver.isLeader,
        name: driver.name,
      });

      // Feed raw GPS to smooth engine
      engine.updateDriver(driver.id, driver.lat, driver.lng, driver.heading, driver.speed);

      // Create marker if new
      if (!markersRef.current.has(driver.id)) {
        const marker = L.marker([driver.lat, driver.lng], {
          icon: createDriverIcon(driver.color, driver.isLeader, driver.speed, driver.heading),
        })
          .bindTooltip(driver.name, {
            permanent: true,
            direction: "top",
            className: "convoy-tooltip",
            offset: [0, -16],
          })
          .addTo(mapRef.current!);
        markersRef.current.set(driver.id, marker);
      } else {
        // Update tooltip if name changed
        markersRef.current.get(driver.id)!.setTooltipContent(driver.name);
      }
    });

    // Remove markers for drivers no longer in the list
    const currentIds = new Set(drivers.map((d) => d.id));
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        engine.removeDriver(id);
        driverMetaRef.current.delete(id);
        lastIconUpdateRef.current.delete(id);
        mapRef.current!.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    // Draw route line between drivers (use smoothed positions)
    if (polylineRef.current) {
      mapRef.current.removeLayer(polylineRef.current);
    }
    if (drivers.length > 1) {
      const latlngs = drivers.map((d) => {
        const smoothed = engine.getState(d.id);
        return smoothed
          ? [smoothed.lat, smoothed.lng] as [number, number]
          : [d.lat, d.lng] as [number, number];
      });
      polylineRef.current = L.polyline(latlngs, {
        color: "#22c55e",
        weight: 2,
        opacity: 0.4,
        dashArray: "8 8",
      }).addTo(mapRef.current);
    }
  }, [drivers]);

  // Destination marker
  useEffect(() => {
    if (!mapRef.current) return;
    if (destinationMarkerRef.current) {
      mapRef.current.removeLayer(destinationMarkerRef.current);
      destinationMarkerRef.current = null;
    }
    if (destination) {
      destinationMarkerRef.current = L.marker([destination.lat, destination.lng], {
        icon: createDestinationIcon(),
      })
        .bindTooltip(destination.label || "Destination", {
          permanent: true,
          direction: "top",
          className: "convoy-destination-tooltip",
          offset: [0, -50],
        })
        .addTo(mapRef.current);
    }
  }, [destination]);

  // Route polyline
  useEffect(() => {
    if (!mapRef.current) return;
    if (routePolylineRef.current) {
      mapRef.current.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }
    if (routeCoordinates && routeCoordinates.length > 1) {
      routePolylineRef.current = L.polyline(routeCoordinates, {
        color: "#22c55e",
        weight: 4,
        opacity: 0.7,
        smoothFactor: 1,
      }).addTo(mapRef.current);
    }
  }, [routeCoordinates]);

  // Hazard markers
  useEffect(() => {
    if (!mapRef.current) return;
    const currentIds = new Set(hazards.map((h) => h.id));
    hazardMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        mapRef.current!.removeLayer(marker);
        hazardMarkersRef.current.delete(id);
      }
    });
    hazards.forEach((hazard) => {
      if (!hazardMarkersRef.current.has(hazard.id)) {
        const age = Date.now() - new Date(hazard.createdAt).getTime();
        const agoMin = Math.floor(age / 60000);
        const agoLabel = agoMin < 1 ? "just now" : `${agoMin}m ago`;
        const marker = L.marker([hazard.lat, hazard.lng], {
          icon: createHazardIcon(hazard.hazardType),
        })
          .bindTooltip(`${hazard.reporterName} • ${agoLabel}${hazard.note ? `: ${hazard.note}` : ""}`, {
            direction: "top",
            className: "convoy-hazard-tooltip",
            offset: [0, -20],
          })
          .on("click", () => onHazardClickRef.current?.(hazard.id))
          .addTo(mapRef.current!);
        hazardMarkersRef.current.set(hazard.id, marker);
      }
    });
  }, [hazards]);

  return (
    <>
      <style>{`
        .convoy-marker { background: none !important; border: none !important; pointer-events: auto !important; }
        @keyframes hazard-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        .convoy-tooltip {
          background: hsl(220 18% 14% / 0.95) !important;
          color: hsl(152 80% 50%) !important;
          border: 1px solid hsl(152 80% 50% / 0.3) !important;
          border-radius: 6px !important;
          font-family: 'JetBrains Mono', monospace !important;
          font-size: 12px !important;
          padding: 4px 8px !important;
          box-shadow: 0 0 10px hsl(152 80% 50% / 0.15) !important;
        }
        .convoy-tooltip::before { border-top-color: hsl(152 80% 50% / 0.3) !important; }
        .convoy-destination-tooltip {
          background: hsl(0 80% 50% / 0.9) !important;
          color: white !important;
          border: 1px solid hsl(0 80% 60% / 0.5) !important;
          border-radius: 6px !important;
          font-family: 'JetBrains Mono', monospace !important;
          font-size: 11px !important;
          font-weight: bold !important;
          padding: 4px 8px !important;
          box-shadow: 0 0 15px hsl(0 80% 50% / 0.3) !important;
        }
        .convoy-destination-tooltip::before { border-top-color: hsl(0 80% 60% / 0.5) !important; }
        .convoy-hazard-tooltip {
          background: hsl(45 100% 20% / 0.95) !important;
          color: hsl(45 100% 80%) !important;
          border: 1px solid hsl(45 100% 50% / 0.5) !important;
          border-radius: 6px !important;
          font-family: 'JetBrains Mono', monospace !important;
          font-size: 11px !important;
          padding: 4px 8px !important;
          box-shadow: 0 0 10px hsl(45 100% 50% / 0.2) !important;
        }
        .convoy-hazard-tooltip::before { border-top-color: hsl(45 100% 50% / 0.5) !important; }
        .leaflet-control-zoom a {
          background: hsl(220 18% 14% / 0.9) !important;
          color: hsl(152 80% 50%) !important;
          border-color: hsl(220 15% 22%) !important;
        }
      `}</style>
      <div ref={containerRef} className="absolute inset-0 z-0" style={{ transformOrigin: "center center" }} />
    </>
  );
});

ConvoyMap.displayName = "ConvoyMap";

export default ConvoyMap;
