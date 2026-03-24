

# Plan: Improve Destination Search

## What Changes

Three improvements to make search more useful and forgiving:

### 1. Bias results toward your location
Pass the user's current GPS coordinates to Nominatim using the `viewbox` and `bounded` parameters. This ensures search results prioritize nearby places instead of returning random locations across the world.

### 2. Fuzzy/typo-tolerant search
Switch from the basic `q` parameter to using Nominatim's `q` with `fuzzyMatch=1` (if available) or, more practically, use the **Photon geocoder** (`photon.komoot.de`) instead of Nominatim. Photon is free, based on OpenStreetMap data, supports typo tolerance natively, and is less sensitive to exact spelling/spacing. It also returns structured place types (city, street, POI) for better result display.

### 3. Recent destinations
Store the last 5-10 selected destinations in `localStorage`. When the search box opens with an empty query, show recent destinations so users can quickly re-select a previous place.

### 4. Better result display
Show the place type (city, restaurant, gas station, etc.) and a shortened address instead of the raw `display_name` blob, making it easier to tell results apart.

---

## Technical Details

**Files to modify:**
- `src/components/DestinationSearch.tsx` — switch to Photon API, add location biasing, recent destinations from localStorage, improve result formatting
- `src/pages/Index.tsx` — pass user's current position to DestinationSearch

**Photon API format:**
```
GET https://photon.komoot.de/api/?q=starbucks&lat=34.05&lon=-118.24&limit=6
```
Returns structured results with `name`, `city`, `state`, `country`, `osm_value` (place type), and coordinates — much better than Nominatim's flat `display_name`.

**No database changes needed** — recent destinations stored in localStorage.

