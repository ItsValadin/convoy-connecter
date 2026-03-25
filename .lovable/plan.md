

# Plan: Off-Route Detection with Recalculating Banner

## What It Does
Detects when the driver deviates more than ~100m from the planned route polyline, shows a "Recalculating..." banner, and automatically re-fetches a new route from the current position.

## Changes

### 1. Add off-route detection logic in `src/pages/Index.tsx`
- Add a new `useEffect` that runs when `self` position and `routeCoordinates` change
- Compute the minimum distance from the driver's current position to any segment of the route polyline (point-to-line-segment distance)
- If the minimum distance exceeds 100m, set an `offRoute` state to `true` and force an immediate route re-fetch (bypassing the 10s throttle by resetting `lastRouteFetchRef`)
- Reset `offRoute` to `false` once a new route is fetched
- Throttle off-route checks to avoid spam (e.g., only trigger recalculation once every 10s)

### 2. Show "Recalculating..." banner
- Add a simple fixed banner (similar to ConnectionBanner) that appears when `offRoute` is true
- Positioned below ConnectionBanner, shows a navigation icon + "Recalculating route..." text
- Amber/blue styling to distinguish from the connection banner
- Auto-dismisses when the new route arrives

### 3. Modify route fetch logic
- When off-route triggers a re-fetch, reset `lastRouteFetchRef.current = 0` so the existing route effect fires immediately
- The existing `useEffect` on `[destination, sessionId]` needs to also depend on an off-route trigger (a counter ref that increments to force re-run)

## Technical Details

**`src/pages/Index.tsx`**:
- Add `const [offRoute, setOffRoute] = useState(false)` and `const offRouteCounterRef = useRef(0)`
- New `useEffect`: iterate `routeCoordinates` segments, compute perpendicular distance from `[self.lat, self.lng]` to each segment, find minimum. If min > 100m and not already recalculating, bump `offRouteCounterRef` and set `offRoute = true`
- Add `offRouteCounterRef.current` as a dependency to the existing route-fetch effect so it triggers immediately
- In the route-fetch effect, when triggered by off-route, skip the throttle and set `offRoute = false` once result arrives
- Render a "Recalculating..." banner conditionally

**Distance calculation**: Use a point-to-line-segment function operating on lat/lng with Haversine-based cross-track distance for accuracy. A simpler approach: check distance to each coordinate in the polyline (not just segments) since OSRM returns dense coordinate arrays — if min distance to any polyline point > 100m, driver is off-route.

