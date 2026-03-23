import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

interface ConvoyMapProps {
  drivers: Driver[];
  center: [number, number];
  destination?: Destination | null;
  routeCoordinates?: [number, number][] | null;
  isLeader?: boolean;
  onMapReady?: (map: L.Map) => void;
  onMapClick?: (lat: number, lng: number) => void;
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

const ConvoyMap = ({ drivers, center, destination, isLeader, onMapReady, onMapClick }: ConvoyMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
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

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
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

  useEffect(() => {
    if (!mapRef.current) return;

    // Update or create markers
    drivers.forEach((driver) => {
      const existing = markersRef.current.get(driver.id);
      if (existing) {
        existing.setLatLng([driver.lat, driver.lng]);
        existing.setIcon(createDriverIcon(driver.color, driver.isLeader, driver.speed, driver.heading));
      } else {
        const marker = L.marker([driver.lat, driver.lng], {
          icon: createDriverIcon(driver.color, driver.isLeader, driver.speed, driver.heading),
        })
          .bindTooltip(driver.name, {
            permanent: false,
            direction: "top",
            className: "convoy-tooltip",
            offset: [0, -16],
          })
          .addTo(mapRef.current!);
        markersRef.current.set(driver.id, marker);
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

  return (
    <>
      <style>{`
        .convoy-marker { background: none !important; border: none !important; }
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
        .leaflet-control-zoom a {
          background: hsl(220 18% 14% / 0.9) !important;
          color: hsl(152 80% 50%) !important;
          border-color: hsl(220 15% 22%) !important;
        }
      `}</style>
      <div ref={containerRef} className="absolute inset-0 z-0" />
    </>
  );
};

export default ConvoyMap;
