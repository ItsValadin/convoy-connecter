import { useState, useRef, useCallback, useEffect } from "react";
import { Search, MapPin, X, Loader2, Clock, Navigation2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/* ─── Types ─── */

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  address?: {
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    suburb?: string;
  };
}

interface RankedResult extends NominatimResult {
  distanceKm: number | null;
}

interface RecentDestination {
  lat: number;
  lng: number;
  label: string;
  subtitle?: string;
  timestamp: number;
}

interface DestinationSearchProps {
  onSelectDestination: (lat: number, lng: number, label: string) => void;
  onClearDestination: () => void;
  hasDestination: boolean;
  hasBanner?: boolean;
  userLat?: number | null;
  userLng?: number | null;
}

/* ─── Constants ─── */

const RECENT_KEY = "convoy-recent-destinations";
const MAX_RECENT = 8;
const DEBOUNCE_MS = 400;
const NOISE_THRESHOLD_M = 3;
const MAX_RESULTS = 6;

/* ─── Helpers ─── */

function formatDistance(km: number | null | undefined): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const TYPE_LABELS: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  fast_food: "Fast Food",
  fuel: "Gas Station",
  parking: "Parking",
  hospital: "Hospital",
  pharmacy: "Pharmacy",
  hotel: "Hotel",
  supermarket: "Supermarket",
  convenience: "Store",
  school: "School",
  university: "University",
  bar: "Bar",
  pub: "Pub",
  bank: "Bank",
  cinema: "Cinema",
  theatre: "Theatre",
  park: "Park",
  stadium: "Stadium",
  aerodrome: "Airport",
  bus_station: "Bus Station",
  station: "Station",
  city: "City",
  town: "Town",
  village: "Village",
  suburb: "Suburb",
  residential: "Area",
};

function formatResult(r: NominatimResult): { label: string; subtitle: string; type: string | null } {
  const parts = r.display_name.split(",").map((s) => s.trim());
  const label = parts[0] || "Unknown";
  const type = TYPE_LABELS[r.type || ""] || null;
  const addr = r.address;
  const subtitleParts: string[] = [];
  if (addr) {
    if (addr.road && addr.road !== label) subtitleParts.push(addr.road);
    const locality = addr.city || addr.town || addr.village || addr.suburb;
    if (locality) subtitleParts.push(locality);
    if (addr.state) subtitleParts.push(addr.state);
  } else if (parts.length > 1) {
    subtitleParts.push(...parts.slice(1, 3));
  }
  return { label, subtitle: subtitleParts.join(", "), type };
}

/* ─── Recent destinations ─── */

function loadRecent(): RecentDestination[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecent(dest: RecentDestination) {
  const existing = loadRecent().filter(
    (d) => Math.abs(d.lat - dest.lat) > 0.001 || Math.abs(d.lng - dest.lng) > 0.001
  );
  const updated = [dest, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
}

/* ─── Query normalization ─── */

function normalizeQuery(input: string) {
  return input
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bnear me\b/g, "")
    .trim();
}

const TYPO_FIXES: Array<[RegExp, string]> = [
  [/\bstn\b/g, "station"],
  [/\bstaiton\b/g, "station"],
  [/\brestarant\b/g, "restaurant"],
  [/\bpetrrol\b/g, "petrol"],
  [/\bpetorl\b/g, "petrol"],
];

function buildSearchVariants(raw: string) {
  const normalized = normalizeQuery(raw);
  const variants = new Set<string>([normalized]);

  let corrected = normalized;
  for (const [pattern, replacement] of TYPO_FIXES) {
    corrected = corrected.replace(pattern, replacement);
  }
  variants.add(corrected.trim());

  if (/\b(petrol|gas|fuel)\b/.test(corrected)) {
    variants.add("petrol station");
    variants.add("gas station");
  }
  if (/\b(ev|electric|charger|charging)\b/.test(corrected)) {
    variants.add("ev charging station");
  }
  if (/\b(coffee|cafe|caf[eé])\b/.test(corrected)) {
    variants.add("coffee shop");
    variants.add("cafe");
  }

  return [...variants].filter(Boolean).slice(0, 3);
}

/* ─── Scoring ─── */

function textRelevanceScore(q: string, r: NominatimResult) {
  const haystack = `${r.display_name} ${r.type || ""} ${r.class || ""}`.toLowerCase();
  const tokens = q.split(" ").filter((t) => t.length > 1);
  let score = 0;
  for (const token of tokens) {
    if (haystack.startsWith(token)) score += 4;
    else if (haystack.includes(` ${token}`)) score += 3;
    else if (haystack.includes(token)) score += 1;
  }
  return score;
}

function intentBoost(q: string, r: NominatimResult) {
  const t = (r.type || "").toLowerCase();
  const cls = (r.class || "").toLowerCase();
  const name = r.display_name.toLowerCase();

  if (/\b(petrol|gas|fuel)\b/.test(q)) {
    if (t === "fuel" || name.includes("fuel") || name.includes("gas station") || name.includes("petrol")) return 18;
    if (cls === "amenity") return 6;
  }
  if (/\b(coffee|cafe|caf[eé])\b/.test(q)) {
    if (t === "cafe" || name.includes("coffee")) return 14;
  }
  if (/\b(ev|electric|charger|charging)\b/.test(q)) {
    if (name.includes("charging") || name.includes("charger") || t.includes("charging")) return 16;
  }
  return 0;
}

/* ─── Search result cache ─── */

const searchCache = new Map<string, { results: RankedResult[]; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): RankedResult[] | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return entry.results;
}

function setCache(key: string, results: RankedResult[]) {
  // Evict oldest if cache grows large
  if (searchCache.size > 50) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
  searchCache.set(key, { results, ts: Date.now() });
}

/* ─── Fetchers ─── */

async function fetchPhoton(
  searchQuery: string,
  limit: number,
  userLat: number | null | undefined,
  userLng: number | null | undefined,
  signal: AbortSignal
): Promise<NominatimResult[]> {
  const params = new URLSearchParams({ q: searchQuery, limit: String(limit) });
  if (userLat != null && userLng != null) {
    params.set("lat", String(userLat));
    params.set("lon", String(userLng));
  }
  try {
    const res = await fetch(`https://photon.komoot.de/api/?${params}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).map((f: any) => {
      const props = f.properties || {};
      const [lon, lat] = f.geometry?.coordinates || [0, 0];
      return {
        display_name: [props.name, props.street, props.city || props.town || props.village, props.state, props.country].filter(Boolean).join(", "),
        lat: String(lat),
        lon: String(lon),
        type: props.osm_value || props.type || "",
        class: props.osm_key || "",
        address: {
          road: props.street,
          city: props.city,
          town: props.town,
          village: props.village,
          state: props.state,
          country: props.country,
          suburb: props.district,
        },
      } as NominatimResult;
    });
  } catch (e: any) {
    if (e.name === "AbortError") throw e;
    return [];
  }
}

async function fetchNominatim(
  searchQuery: string,
  opts: { strictNearby: boolean; limit: number },
  userLat: number | null | undefined,
  userLng: number | null | undefined,
  signal: AbortSignal
): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    format: "json",
    q: searchQuery,
    limit: String(opts.limit),
    addressdetails: "1",
    dedupe: "1",
  });
  const hasLocation = userLat != null && userLng != null;
  if (hasLocation) {
    const delta = opts.strictNearby ? 0.5 : 2.0;
    params.set("viewbox", `${userLng! - delta},${userLat! + delta},${userLng! + delta},${userLat! - delta}`);
    params.set("bounded", opts.strictNearby ? "1" : "0");
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "Accept-Language": "en" },
      signal,
    });
    if (!res.ok) return [];
    return (await res.json()) as NominatimResult[];
  } catch (e: any) {
    if (e.name === "AbortError") throw e;
    return [];
  }
}

/* ─── Rank & dedupe ─── */

function rankResults(
  merged: NominatimResult[],
  queryNormalized: string,
  userLat: number | null | undefined,
  userLng: number | null | undefined
): RankedResult[] {
  const hasLocation = userLat != null && userLng != null;
  const seen = new Set<string>();
  const unique = merged.filter((r) => {
    const key = `${parseFloat(r.lat).toFixed(4)},${parseFloat(r.lon).toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique
    .map((r) => {
      const distKm = hasLocation
        ? haversineKm(userLat!, userLng!, parseFloat(r.lat), parseFloat(r.lon))
        : null;
      const textScore = textRelevanceScore(queryNormalized, r);
      const boost = intentBoost(queryNormalized, r);
      const distanceScore = distKm != null ? Math.max(0, 24 - distKm) : 0;
      return {
        r: { ...r, distanceKm: distKm } as RankedResult,
        score: textScore * 10 + boost + distanceScore,
      };
    })
    .sort((a, b) => {
      if (hasLocation && a.r.distanceKm != null && b.r.distanceKm != null) {
        return a.r.distanceKm - b.r.distanceKm;
      }
      return b.score - a.score;
    })
    .slice(0, MAX_RESULTS)
    .map((entry) => entry.r);
}

/* ─── Component ─── */

const DestinationSearch = ({
  onSelectDestination,
  onClearDestination,
  hasDestination,
  hasBanner,
  userLat,
  userLng,
}: DestinationSearchProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RankedResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [recents, setRecents] = useState<RecentDestination[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchIdRef = useRef(0); // monotonic counter to prevent race conditions
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setRecents(loadRecent());
      // Focus input after a tick to ensure it's mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const searchPlaces = useCallback(
    async (q: string) => {
      const queryNormalized = normalizeQuery(q);
      if (!queryNormalized || queryNormalized.length < 2) {
        setResults([]);
        setError(null);
        return;
      }

      // Check cache first
      const cacheKey = `${queryNormalized}|${userLat?.toFixed(2)}|${userLng?.toFixed(2)}`;
      const cached = getCached(cacheKey);
      if (cached) {
        setResults(cached);
        setError(null);
        setSelectedIndex(0);
        return;
      }

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const thisSearchId = ++searchIdRef.current;

      setLoading(true);
      setError(null);

      try {
        const variants = buildSearchVariants(queryNormalized);
        const baseQuery = variants[0];
        const altQueries = variants.slice(1, 3);

        const responseGroups = await Promise.all([
          fetchPhoton(baseQuery, 8, userLat, userLng, controller.signal),
          fetchNominatim(baseQuery, { strictNearby: true, limit: 5 }, userLat, userLng, controller.signal),
          fetchNominatim(baseQuery, { strictNearby: false, limit: 5 }, userLat, userLng, controller.signal),
          ...altQueries.map((v) => fetchPhoton(v, 5, userLat, userLng, controller.signal)),
        ]);

        // Race condition guard: discard if a newer search was started
        if (thisSearchId !== searchIdRef.current) return;

        const ranked = rankResults(responseGroups.flat(), queryNormalized, userLat, userLng);
        setResults(ranked);
        setSelectedIndex(ranked.length > 0 ? 0 : -1);
        setError(ranked.length === 0 ? "No results found" : null);
        setCache(cacheKey, ranked);
      } catch (e: any) {
        if (e.name === "AbortError") return; // expected
        if (thisSearchId !== searchIdRef.current) return;
        setResults([]);
        setError("Search failed — try again");
      } finally {
        if (thisSearchId === searchIdRef.current) {
          setLoading(false);
        }
      }
    },
    [userLat, userLng]
  );

  const handleInputChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setError(null);
      abortRef.current?.abort();
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => searchPlaces(value), DEBOUNCE_MS);
  };

  const handleSelectResult = (r: NominatimResult) => {
    const { label, subtitle } = formatResult(r);
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    onSelectDestination(lat, lng, label);
    setQuery(label);
    setResults([]);
    setIsOpen(false);
    setError(null);
    saveRecent({ lat, lng, label, subtitle, timestamp: Date.now() });
  };

  const handleSelectRecent = (recent: RecentDestination) => {
    onSelectDestination(recent.lat, recent.lng, recent.label);
    setQuery(recent.label);
    setResults([]);
    setIsOpen(false);
    setError(null);
    saveRecent({ ...recent, timestamp: Date.now() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = results.length > 0 ? results : (query.length < 1 ? recents : []);
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      if (results.length > 0) {
        handleSelectResult(results[selectedIndex]);
      } else if (query.length < 1 && recents.length > 0) {
        handleSelectRecent(recents[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setResults([]);
    }
  };

  /* ─── Collapsed button ─── */

  if (!isOpen) {
    return (
      <div
        className={`absolute right-2 sm:right-4 z-10 flex gap-1.5 sm:gap-2 ${hasBanner ? "top-[calc(4.5rem+env(safe-area-inset-top,0px))] sm:top-4" : "top-[calc(1rem+env(safe-area-inset-top,0px))] sm:top-4"}`}
      >
        <Button
          size="sm"
          variant="outline"
          className="bg-card/90 backdrop-blur-xl border-border hover:bg-primary/20 hover:border-primary/50 font-display"
          onClick={() => { setQuery(""); setIsOpen(true); }}
        >
          <Search className="w-4 h-4 mr-1.5 text-primary" />
          {hasDestination ? "Change Destination" : "Set Destination"}
        </Button>
        {hasDestination && (
          <Button
            size="sm"
            variant="outline"
            className="bg-card/90 backdrop-blur-xl border-destructive/50 text-destructive hover:bg-destructive/10 font-display"
            onClick={() => {
              onClearDestination();
              setQuery("");
            }}
          >
            <X className="w-4 h-4 mr-1.5" /> Clear
          </Button>
        )}
      </div>
    );
  }

  /* ─── Expanded search panel ─── */

  const showRecents = query.length < 1 && recents.length > 0;

  return (
    <div
      className={`absolute right-2 sm:right-4 z-20 w-[min(20rem,calc(100vw-1rem))] ${hasBanner ? "top-[calc(4.5rem+env(safe-area-inset-top,0px))] sm:top-4" : "top-[calc(1rem+env(safe-area-inset-top,0px))] sm:top-4"}`}
    >
      <div className="bg-card/95 backdrop-blur-xl border border-border rounded-xl overflow-hidden shadow-lg">
        {/* Search input */}
        <div className="p-3 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-destructive flex-shrink-0" />
          <Input
            ref={inputRef}
            placeholder="Search for a destination..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground text-sm h-9 touch-manipulation"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
          ) : (
            <button
              onClick={() => {
                setIsOpen(false);
                setResults([]);
                setError(null);
                abortRef.current?.abort();
              }}
              className="text-muted-foreground hover:text-foreground flex-shrink-0 p-1 -m-1 touch-manipulation"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Recent destinations */}
        {showRecents && (
          <div className="border-t border-border">
            <div className="px-3 py-1.5 flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-display text-muted-foreground uppercase tracking-wider">Recent</span>
            </div>
            <div className="max-h-52 overflow-y-auto overscroll-contain">
              {recents.map((r, i) => {
                const dist = userLat != null && userLng != null
                  ? formatDistance(haversineKm(userLat, userLng, r.lat, r.lng))
                  : null;
                return (
                  <button
                    key={i}
                    onClick={() => handleSelectRecent(r)}
                    className={`w-full text-left px-3 py-2.5 transition-colors flex items-start gap-2 border-b border-border/50 last:border-b-0 touch-manipulation ${
                      selectedIndex === i ? "bg-primary/15" : "hover:bg-primary/10 active:bg-primary/15"
                    }`}
                  >
                    <Navigation2 className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs text-foreground leading-tight line-clamp-1 block">{r.label}</span>
                      {r.subtitle && (
                        <span className="text-[10px] text-muted-foreground leading-tight line-clamp-1 block">{r.subtitle}</span>
                      )}
                    </div>
                    {dist && (
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 shrink-0">{dist}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search results */}
        {results.length > 0 && (
          <div className="border-t border-border max-h-52 overflow-y-auto overscroll-contain">
            {results.map((r, i) => {
              const { label, subtitle, type } = formatResult(r);
              const isSelected = selectedIndex === i;
              return (
                <button
                  key={`${r.lat}-${r.lon}-${i}`}
                  onClick={() => handleSelectResult(r)}
                  className={`w-full text-left px-3 py-2.5 transition-colors flex items-start gap-2 border-b border-border/50 last:border-b-0 touch-manipulation ${
                    isSelected ? "bg-primary/15" : "hover:bg-primary/10 active:bg-primary/15"
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs leading-tight line-clamp-1 ${isSelected ? "text-primary font-medium" : "text-foreground"}`}>
                        {label}
                      </span>
                      {type && (
                        <span className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-display shrink-0">
                          {type}
                        </span>
                      )}
                    </div>
                    {subtitle && (
                      <span className="text-[10px] text-muted-foreground leading-tight line-clamp-1 block mt-0.5">
                        {subtitle}
                      </span>
                    )}
                  </div>
                  {formatDistance(r.distanceKm) && (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 shrink-0">
                      {formatDistance(r.distanceKm)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Error / no results */}
        {error && !loading && query.length >= 2 && (
          <div className="px-3 py-2.5 border-t border-border">
            <span className="text-xs text-muted-foreground">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DestinationSearch;
