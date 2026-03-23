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
}

interface ConvoyMapProps {
  drivers: Driver[];
  center: [number, number];
}

const createDriverIcon = (color: string, isLeader: boolean) => {
  const size = isLeader ? 18 : 14;
  const ring = isLeader ? `<circle cx="20" cy="20" r="18" fill="none" stroke="${color}" stroke-width="2" opacity="0.4"><animate attributeName="r" from="14" to="22" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite"/></circle>` : "";
  
  const svg = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    ${ring}
    <circle cx="20" cy="20" r="${size / 2 + 4}" fill="${color}" opacity="0.2"/>
    <circle cx="20" cy="20" r="${size / 2}" fill="${color}"/>
    ${isLeader ? '<polygon points="20,8 24,16 16,16" fill="white" opacity="0.9"/>' : ""}
  </svg>`;
  
  return L.divIcon({
    html: svg,
    className: "convoy-marker",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

const ConvoyMap = ({ drivers, center }: ConvoyMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

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
        existing.setIcon(createDriverIcon(driver.color, driver.isLeader));
      } else {
        const marker = L.marker([driver.lat, driver.lng], {
          icon: createDriverIcon(driver.color, driver.isLeader),
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
