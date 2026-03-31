/**
 * Smooth GPS movement system for Leaflet markers.
 * Provides LERP-based position interpolation, heading smoothing,
 * GPS noise filtering, and forward-looking camera offset.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Haversine distance in meters between two lat/lng points */
export function distanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLng = (lng2 - lng1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Ease-out cubic: fast start, smooth deceleration */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Shortest-path angular interpolation (degrees) */
function lerpAngle(from: number, to: number, t: number): number {
  let diff = ((to - from + 540) % 360) - 180;
  return ((from + diff * t) % 360 + 360) % 360;
}

export interface SmoothedState {
  lat: number;
  lng: number;
  heading: number;
  speed: number;
}

export interface DriverAnimState {
  // Current interpolated position
  currentLat: number;
  currentLng: number;
  currentHeading: number;
  currentSpeed: number;

  // Animation source
  fromLat: number;
  fromLng: number;
  fromHeading: number;

  // Animation target
  toLat: number;
  toLng: number;
  toHeading: number;
  toSpeed: number;

  // Timing
  startTime: number;
  duration: number;
}

const NOISE_THRESHOLD_M = 3;    // Ignore GPS jitter below this
const ANIM_DURATION_MS = 1200;  // Interpolation window
const HEADING_SMOOTH = 0.35;    // Heading interpolation factor per frame

export class SmoothMovementEngine {
  private states = new Map<string, DriverAnimState>();
  private rafId: number | null = null;
  private onUpdate: (id: string, state: SmoothedState) => void;

  constructor(onUpdate: (id: string, state: SmoothedState) => void) {
    this.onUpdate = onUpdate;
  }

  /** Feed a new raw GPS position for a driver */
  updateDriver(
    id: string,
    lat: number,
    lng: number,
    heading: number | null | undefined,
    speed: number | null | undefined,
  ) {
    const existing = this.states.get(id);
    const safeHeading = typeof heading === "number" ? heading : existing?.currentHeading ?? 0;
    const safeSpeed = typeof speed === "number" ? speed : 0;

    if (!existing) {
      // First update — snap immediately
      const state: DriverAnimState = {
        currentLat: lat,
        currentLng: lng,
        currentHeading: safeHeading,
        currentSpeed: safeSpeed,
        fromLat: lat,
        fromLng: lng,
        fromHeading: safeHeading,
        toLat: lat,
        toLng: lng,
        toHeading: safeHeading,
        toSpeed: safeSpeed,
        startTime: performance.now(),
        duration: ANIM_DURATION_MS,
      };
      this.states.set(id, state);
      this.ensureLoop();
      return;
    }

    // Noise filter: ignore tiny movements
    const dist = distanceMeters(existing.currentLat, existing.currentLng, lat, lng);
    if (dist < NOISE_THRESHOLD_M && Math.abs(safeSpeed) < 0.5) {
      // Still update heading/speed targets for stationary smoothing
      existing.toHeading = safeHeading;
      existing.toSpeed = safeSpeed;
      return;
    }

    // Set up new interpolation segment from current interpolated position
    existing.fromLat = existing.currentLat;
    existing.fromLng = existing.currentLng;
    existing.fromHeading = existing.currentHeading;
    existing.toLat = lat;
    existing.toLng = lng;
    existing.toHeading = safeHeading;
    existing.toSpeed = safeSpeed;
    existing.startTime = performance.now();
    existing.duration = ANIM_DURATION_MS;

    this.ensureLoop();
  }

  /** Remove a driver from the engine */
  removeDriver(id: string) {
    this.states.delete(id);
    if (this.states.size === 0) this.stopLoop();
  }

  /** Get current smoothed state for a driver */
  getState(id: string): SmoothedState | null {
    const s = this.states.get(id);
    if (!s) return null;
    return {
      lat: s.currentLat,
      lng: s.currentLng,
      heading: s.currentHeading,
      speed: s.currentSpeed,
    };
  }

  /** Clean up */
  destroy() {
    this.stopLoop();
    this.states.clear();
  }

  private ensureLoop() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = (now: number) => {
    this.rafId = null;
    let anyActive = false;

    this.states.forEach((state, id) => {
      const elapsed = now - state.startTime;
      const t = Math.min(elapsed / state.duration, 1);
      const eased = easeOutCubic(t);

      // Interpolate position
      state.currentLat = state.fromLat + (state.toLat - state.fromLat) * eased;
      state.currentLng = state.fromLng + (state.toLng - state.fromLng) * eased;

      // Smooth heading with shortest-path interpolation
      state.currentHeading = lerpAngle(state.fromHeading, state.toHeading, Math.min(eased + HEADING_SMOOTH, 1));

      // Smooth speed
      state.currentSpeed = state.currentSpeed + (state.toSpeed - state.currentSpeed) * 0.15;

      this.onUpdate(id, {
        lat: state.currentLat,
        lng: state.currentLng,
        heading: state.currentHeading,
        speed: state.currentSpeed,
      });

      if (t < 1) anyActive = true;
    });

    if (anyActive || this.states.size > 0) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };
}

/**
 * Compute a forward-looking camera offset.
 * Returns a lat/lng that places the user slightly below center,
 * looking ahead in the direction of travel.
 */
export function forwardLookingCenter(
  lat: number,
  lng: number,
  heading: number,
  offsetMeters: number = 150,
): [number, number] {
  const headingRad = heading * DEG2RAD;
  const dLat = (offsetMeters / 111320) * Math.cos(headingRad);
  const dLng = (offsetMeters / (111320 * Math.cos(lat * DEG2RAD))) * Math.sin(headingRad);
  return [lat + dLat, lng + dLng];
}
