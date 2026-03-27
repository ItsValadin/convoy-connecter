import type { RouteInfo, RouteStep } from "@/components/NavigationPanel";

interface OSRMManeuver {
  instruction?: string;
  type: string;
  modifier?: string;
  location: [number, number];
}

interface OSRMStep {
  maneuver: OSRMManeuver;
  name: string;
  distance: number;
  duration: number;
}

const buildInstruction = (m: OSRMManeuver, name: string): string => {
  if (m.instruction) return m.instruction;
  const road = name && name !== "" ? ` onto ${name}` : "";
  switch (m.type) {
    case "depart": return `Head ${m.modifier || "north"}${road}`;
    case "arrive": return "You have arrived at your destination";
    case "turn": return `Turn ${m.modifier || ""}${road}`;
    case "new name": return `Continue${road}`;
    case "merge": return `Merge ${m.modifier || ""}${road}`;
    case "on ramp": return `Take the ramp${road}`;
    case "off ramp": return `Take the exit${road}`;
    case "fork": return `Keep ${m.modifier || "straight"}${road}`;
    case "end of road": return `Turn ${m.modifier || ""}${road}`;
    case "roundabout":
    case "rotary": return `Enter the roundabout, then exit${road}`;
    case "continue": return `Continue ${m.modifier || "straight"}${road}`;
    default: return `Continue${road}`;
  }
};

interface OSRMRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { steps: OSRMStep[] }[];
}

export interface RouteGeometry {
  info: RouteInfo;
  coordinates: [number, number][]; // [lat, lng] pairs
}

const fetchWithTimeout = (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
};

export const fetchRoute = async (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<RouteGeometry | null> => {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, 8000);
      if (res.status === 429 || res.status >= 500) {
        // Retryable — wait with exponential backoff
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.routes?.length) return null;

      const route: OSRMRoute = data.routes[0];
      const steps: RouteStep[] = route.legs
        .flatMap((leg) => leg.steps)
        .filter((s) => s.distance > 0)
        .map((s) => ({
          instruction: buildInstruction(s.maneuver, s.name),
          distance: s.distance,
          duration: s.duration,
          location: [s.maneuver.location[1], s.maneuver.location[0]] as [number, number],
        }));

      // OSRM returns [lng, lat], convert to [lat, lng]
      const coordinates: [number, number][] = route.geometry.coordinates.map(
        ([lng, lat]) => [lat, lng]
      );

      return {
        info: {
          distance: route.distance,
          duration: route.duration,
          steps,
        },
        coordinates,
      };
    } catch (e) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      console.error("Routing error after retries:", e);
      return null;
    }
  }
  return null;
};
