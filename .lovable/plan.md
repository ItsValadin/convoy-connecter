

## Plan: Optimize Map Performance

### Problem
The `ConvoyMap` component and its parent `Index` page have several sources of unnecessary re-renders and inefficient patterns that cause jank, especially with multiple drivers.

### Changes

#### 1. Memoize ConvoyMap with `React.memo`
Wrap `ConvoyMap` in `React.memo` to prevent re-renders from unrelated parent state changes (panel toggles, hazard picker, mute state, etc.).

#### 2. Stabilize callback props passed to ConvoyMap
In `Index.tsx`, the `onMapReady`, `onMapClick`, and `onHazardClick` handlers are currently inline arrow functions that create new references every render, defeating `React.memo`. Wrap them in `useCallback`.

#### 3. Stabilize the `hazards` prop
The `hazards.map(...)` in the JSX creates a new array reference every render. Move it to a `useMemo` so `ConvoyMap` only re-renders when hazard data actually changes.

#### 4. Batch driver state updates in `useConvoy`
The GPS `watchPosition` callback calls `setDrivers` on every position update (can be 1-4 Hz). The broadcast handler also calls `setDrivers` per-driver per-500ms. These are already functional updates which is good, but we can throttle the local GPS-driven `setDrivers` to ~250ms to reduce render frequency.

#### 5. Improve tile caching in the service worker
The current Workbox config only caches OpenStreetMap tiles (`tile.openstreetmap.org`), but the app uses CartoDB tiles (`basemaps.cartocdn.com`). Add a runtime caching rule for CartoDB so tiles are cached locally for 30 days, eliminating redundant network fetches and improving panning smoothness.

#### 6. Add `will-change: transform` to map container
Add a CSS hint so the browser promotes the map to its own compositor layer, improving scroll/pan performance.

### Files Modified
- `src/components/ConvoyMap.tsx` — wrap export in `React.memo`
- `src/pages/Index.tsx` — `useCallback` for map handlers, `useMemo` for hazards array
- `src/hooks/useConvoy.ts` — throttle local GPS `setDrivers` updates
- `vite.config.ts` — add CartoDB tile caching rule to Workbox config
- `src/index.css` — add `will-change` hint for map container

### Technical Details

**Tile caching rule** (vite.config.ts):
```js
{
  urlPattern: /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.*/i,
  handler: "CacheFirst",
  options: {
    cacheName: "carto-tiles",
    expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
    cacheableResponse: { statuses: [0, 200] },
  },
}
```

**GPS throttle** — track `lastSetDriversTime` and skip `setDrivers` if <250ms since last call, while always updating the ref for broadcast accuracy.

