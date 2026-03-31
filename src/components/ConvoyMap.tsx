import React, { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface AnimationState {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  startTime: number;
  duration: number;
  rafId: number | null;
}

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

  // Heading arrow (triangle pointing up, rotated by heading)
  const headingArrow = hasHeading ? `<g transform="rotate(${rotation}, 30, 30)"><polygon points="30,4 36,16 24,16" fill="${color}" opacity="0.85"/></g>` : "";

  // Speed label
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

const LERP_DURATION = 1000; // 1 second interpolation

const TILE_URLS: Record<MapTheme, string> = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
};

const ConvoyMap = React.memo(({ drivers, center, destination, routeCoordinates, hazards = [], isLeader, mapTheme = "dark", bearing = null, onMapReady, onMapClick, onHazardClick }: ConvoyMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const animationsRef = useRef<Map<string, AnimationState>>(new Map());
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
      className: mapTheme === "dark" ? "map-tiles-lighter" : "",
    }).addTo(mapRef.current);

    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
    
    mapRef.current.on("contextmenu", (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    onMapReady?.(mapRef.current);

    return () => {
      animationsRef.current.forEach((anim) => {
        if (anim.rafId) cancelAnimationFrame(anim.rafId);
      });
      animationsRef.current.clear();
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
      className: mapTheme === "dark" ? "map-tiles-lighter" : "",
    }).addTo(mapRef.current);
  }, [mapTheme]);

  const animateMarker = useCallback((id: string, marker: L.Marker, toLat: number, toLng: number) => {
    const existing = animationsRef.current.get(id);
    if (existing?.rafId) cancelAnimationFrame(existing.rafId);

    const currentPos = marker.getLatLng();
    const state: AnimationState = {
      fromLat: currentPos.lat,
      fromLng: currentPos.lng,
      toLat,
      toLng,
      startTime: performance.now(),
      duration: LERP_DURATION,
      rafId: null,
    };

    const step = (now: number) => {
      const t = Math.min((now - state.startTime) / state.duration, 1);
      // Ease-out cubic for natural deceleration
      const eased = 1 - Math.pow(1 - t, 3);
      const lat = state.fromLat + (state.toLat - state.fromLat) * eased;
      const lng = state.fromLng + (state.toLng - state.fromLng) * eased;
      marker.setLatLng([lat, lng]);

      if (t < 1) {
        state.rafId = requestAnimationFrame(step);
      } else {
        animationsRef.current.delete(id);
      }
    };

    state.rafId = requestAnimationFrame(step);
    animationsRef.current.set(id, state);
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    // Update or create markers
    drivers.forEach((driver) => {
      const existing = markersRef.current.get(driver.id);
      if (existing) {
        // Animate position smoothly instead of jumping
        animateMarker(driver.id, existing, driver.lat, driver.lng);
        existing.setIcon(createDriverIcon(driver.color, driver.isLeader, driver.speed, driver.heading));
        existing.setTooltipContent(driver.name);
      } else {
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
      }
    });

    // Remove markers for drivers no longer in the list
    const currentIds = new Set(drivers.map((d) => d.id));
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        const anim = animationsRef.current.get(id);
        if (anim?.rafId) cancelAnimationFrame(anim.rafId);
        animationsRef.current.delete(id);
        mapRef.current!.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    // Draw route line between drivers
    if (polylineRef.current) {
      mapRef.current.removeLayer(polylineRef.current);
    }
    if (drivers.length > 1) {
      const latlngs = drivers.map((d) => [d.lat, d.lng] as [number, number]);
      polylineRef.current = L.polyline(latlngs, {
        color: "#22c55e",
        weight: 2,
        opacity: 0.4,
        dashArray: "8 8",
      }).addTo(mapRef.current);
    }
  }, [drivers, animateMarker]);

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

    // Remove markers no longer present
    hazardMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        mapRef.current!.removeLayer(marker);
        hazardMarkersRef.current.delete(id);
      }
    });

    // Add new markers
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

  // Apply bearing rotation to map container
  // Scale up by √2 (~1.42) so the rotated rectangle always covers the viewport
  useEffect(() => {
    if (!containerRef.current) return;
    const rotation = typeof bearing === "number" ? -bearing : 0;
    const scale = rotation !== 0 ? 1.42 : 1;
    containerRef.current.style.transform = `rotate(${rotation}deg) scale(${scale})`;
    containerRef.current.style.transition = "transform 0.5s ease-out";
  }, [bearing]);

  // Counter-rotate markers so they stay upright
  useEffect(() => {
    if (!mapRef.current) return;
    const counterRotation = typeof bearing === "number" ? bearing : 0;
    // Counter-rotate all marker icons
    const markerEls = document.querySelectorAll<HTMLElement>(".convoy-marker");
    markerEls.forEach((el) => {
      el.style.transform = `rotate(${counterRotation}deg)`;
    });
    // Counter-rotate tooltips
    const tooltipEls = document.querySelectorAll<HTMLElement>(".leaflet-tooltip");
    tooltipEls.forEach((el) => {
      el.style.transform = `rotate(${counterRotation}deg)`;
    });
    // Counter-rotate zoom controls
    const controlEls = document.querySelectorAll<HTMLElement>(".leaflet-control-zoom");
    controlEls.forEach((el) => {
      el.style.transform = `rotate(${counterRotation}deg)`;
    });
  }, [bearing, drivers, hazards, destination]);

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
