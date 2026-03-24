import { useEffect, useState, useRef } from "react";
import L from "leaflet";

interface Driver {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  isLeader: boolean;
}

interface OffscreenIndicatorsProps {
  drivers: Driver[];
  map: L.Map | null;
  sessionId?: string;
  onArrowClick?: (driverId: string, lat: number, lng: number) => void;
}

interface Arrow {
  id: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
  x: number;
  y: number;
  angle: number;
  isLeader: boolean;
}

const MARGIN = 40; // pixels from edge
const ARROW_SIZE = 28;

const OffscreenIndicators = ({ drivers, map, sessionId, onArrowClick }: OffscreenIndicatorsProps) => {
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!map) return;

    const update = () => {
      const bounds = map.getBounds();
      const size = map.getSize();

      const centerX = size.x / 2;
      const centerY = size.y / 2;

      const result: Arrow[] = [];

      drivers.forEach((driver) => {
        // Skip self
        if (driver.id === sessionId) return;

        const latlng = L.latLng(driver.lat, driver.lng);
        if (bounds.contains(latlng)) return; // on-screen

        const point = map.latLngToContainerPoint(latlng);
        const dx = point.x - centerX;
        const dy = point.y - centerY;
        const angle = Math.atan2(dy, dx);

        // Clamp to viewport edges with margin
        const maxX = size.x - MARGIN;
        const maxY = size.y - MARGIN;

        let x: number, y: number;

        // Find intersection with viewport rectangle
        const absCos = Math.abs(Math.cos(angle));
        const absSin = Math.abs(Math.sin(angle));

        if (absCos * (maxY - MARGIN) > absSin * (maxX - MARGIN)) {
          // Hits left or right edge
          const sign = Math.cos(angle) > 0 ? 1 : -1;
          x = sign > 0 ? maxX : MARGIN;
          y = centerY + (x - centerX) * Math.tan(angle);
        } else {
          // Hits top or bottom edge
          const sign = Math.sin(angle) > 0 ? 1 : -1;
          y = sign > 0 ? maxY : MARGIN;
          x = centerX + (y - centerY) / Math.tan(angle);
        }

        // Clamp
        x = Math.max(MARGIN, Math.min(maxX, x));
        y = Math.max(MARGIN, Math.min(maxY, y));

        result.push({
          id: driver.id,
          name: driver.name,
          color: driver.color,
          x,
          y,
          angle: (angle * 180) / Math.PI,
          isLeader: driver.isLeader,
        });
      });

      setArrows(result);
      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    // Also update on map move/zoom
    map.on("move", update);
    map.on("zoom", update);

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.off("move", update);
      map.off("zoom", update);
    };
  }, [map, drivers, sessionId]);

  if (arrows.length === 0) return null;

  return (
    <div className="absolute inset-0 z-[5] pointer-events-none overflow-hidden">
      {arrows.map((arrow) => (
        <div
          key={arrow.id}
          className="absolute pointer-events-auto cursor-pointer"
          style={{
            left: arrow.x,
            top: arrow.y,
            transform: "translate(-50%, -50%)",
          }}
          title={arrow.name}
        >
          {/* Arrow SVG */}
          <svg
            width={ARROW_SIZE}
            height={ARROW_SIZE}
            viewBox="0 0 24 24"
            style={{ transform: `rotate(${arrow.angle}deg)` }}
          >
            <polygon
              points="24,12 4,2 8,12 4,22"
              fill={arrow.color}
              opacity="0.9"
            />
            <polygon
              points="24,12 4,2 8,12 4,22"
              fill="none"
              stroke="white"
              strokeWidth="0.8"
              opacity="0.4"
            />
          </svg>
          {/* Name label */}
          <div
            className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-display text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{
              top: ARROW_SIZE + 2,
              backgroundColor: `${arrow.color}33`,
              color: arrow.color,
              border: `1px solid ${arrow.color}44`,
            }}
          >
            {arrow.name}
          </div>
        </div>
      ))}
    </div>
  );
};

export default OffscreenIndicators;
