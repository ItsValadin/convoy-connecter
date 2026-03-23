import type { RouteInfo, RouteStep } from "@/components/NavigationPanel";

interface OSRMStep {
  maneuver: { instruction: string; location: [number, number] };
  distance: number;
  duration: number;
}

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

export const fetchRoute = async (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<RouteGeometry | null> => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes?.length) return null;

    const route: OSRMRoute = data.routes[0];
    const steps: RouteStep[] = route.legs
      .flatMap((leg) => leg.steps)
      .filter((s) => s.distance > 0)
      .map((s) => ({
        instruction: s.maneuver.instruction,
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
    console.error("Routing error:", e);
    return null;
  }
};
