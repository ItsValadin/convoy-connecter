

# Plan: Add Distance Display and Sort by Distance

## What Changes

1. **Store ranked results with distance** — Change the results state from `NominatimResult[]` to include a computed `distanceKm` field, so each result carries its distance from the user.

2. **Sort by distance** — When user location is available, sort results by distance (closest first) instead of the current text+intent+distance scoring. When no location, keep current ranking.

3. **Display distance** — Show a formatted distance badge next to each result (e.g., "2.3 km" or "145 km"). Also show distance for recent destinations.

## Technical Details

**File:** `src/components/DestinationSearch.tsx`

- Add a `RankedResult` interface: `{ ...NominatimResult, distanceKm: number | null }`
- Change `results` state to `RankedResult[]`
- In the ranking logic, compute `distanceKm` using the existing `haversineKm` function and attach it to each result
- Sort primarily by distance when user location is available
- Format distance as: `< 1km` → meters (e.g., "850 m"), `< 100km` → one decimal (e.g., "12.3 km"), `≥ 100km` → rounded (e.g., "145 km")
- Render distance as a small muted label on the right side of each result row
- For recent destinations, compute distance on render using `userLat`/`userLng`

