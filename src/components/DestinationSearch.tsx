import { useState, useRef, useCallback, useEffect } from "react";
import { Search, MapPin, X, Loader2, Clock, Navigation2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

const RECENT_KEY = "convoy-recent-destinations";
const MAX_RECENT = 8;

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

  // Build subtitle from address or fallback to display_name parts
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

const DestinationSearch = ({
  onSelectDestination,
  onClearDestination,
  hasDestination,
  hasBanner,
  userLat,
  userLng,
}: DestinationSearchProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [recents, setRecents] = useState<RecentDestination[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) setRecents(loadRecent());
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const normalizeQuery = (input: string) =>
    input
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\bnear me\b/g, "")
      .trim();

  const buildSearchVariants = (raw: string) => {
    const normalized = normalizeQuery(raw);
    const variants = new Set<string>([normalized]);

    const replacements: Array<[RegExp, string]> = [
      [/\bstn\b/g, "station"],
      [/\bstaiton\b/g, "station"],
      [/\brestarant\b/g, "restaurant"],
      [/\bpetrrol\b/g, "petrol"],
      [/\bpetorl\b/g, "petrol"],
    ];

    let corrected = normalized;
    for (const [pattern, replacement] of replacements) {
      corrected = corrected.replace(pattern, replacement);
    }
    variants.add(corrected.trim());

    if (/\b(petrol|gas|fuel)\b/.test(corrected)) {
      variants.add("petrol station");
      variants.add("gas station");
      variants.add("fuel station");
    }

    if (/\b(ev|electric|charger|charging)\b/.test(corrected)) {
      variants.add("ev charging station");
      variants.add("electric vehicle charger");
    }

    if (/\b(coffee|cafe|caf[eé])\b/.test(corrected)) {
      variants.add("coffee shop");
      variants.add("cafe");
    }

    return [...variants].filter(Boolean).slice(0, 4);
  };

  const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  const textRelevanceScore = (q: string, r: NominatimResult) => {
    const haystack = `${r.display_name} ${r.type || ""} ${r.class || ""}`.toLowerCase();
    const tokens = q.split(" ").filter((t) => t.length > 1);
    let score = 0;

    for (const token of tokens) {
      if (haystack.startsWith(token)) score += 4;
      else if (haystack.includes(` ${token}`)) score += 3;
      else if (haystack.includes(token)) score += 1;
    }

    return score;
  };

  const intentBoost = (q: string, r: NominatimResult) => {
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
  };

  const searchPlaces = useCallback(
    async (q: string) => {
      if (q.length < 1) {
        setResults([]);
        return;
      }

      const queryNormalized = normalizeQuery(q);
      if (!queryNormalized) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const hasLocation = userLat != null && userLng != null;
        const variants = buildSearchVariants(queryNormalized);
        const baseQuery = variants[0];
        const altQueries = variants.slice(1, 3);

        const fetchPhoton = async (
          searchQuery: string,
          limit: number
        ): Promise<NominatimResult[]> => {
          const params = new URLSearchParams({
            q: searchQuery,
            limit: String(limit),
          });

          if (hasLocation) {
            params.set("lat", String(userLat!));
            params.set("lon", String(userLng!));
          }

          try {
            const res = await fetch(`https://photon.komoot.de/api/?${params}`);
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
          } catch {
            return [];
          }
        };

        const fetchNominatim = async (
          searchQuery: string,
          opts: { strictNearby: boolean; limit: number }
        ): Promise<NominatimResult[]> => {
          const params = new URLSearchParams({
            format: "json",
            q: searchQuery,
            limit: String(opts.limit),
            addressdetails: "1",
            dedupe: "1",
          });

          if (hasLocation) {
            const delta = opts.strictNearby ? 0.2 : 1.5;
            params.set("viewbox", `${userLng! - delta},${userLat! + delta},${userLng! + delta},${userLat! - delta}`);
            params.set("bounded", opts.strictNearby ? "1" : "0");
          }

          const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
            headers: { "Accept-Language": "en" },
          });

          if (!res.ok) return [];
          return (await res.json()) as NominatimResult[];
        };

        const responseGroups = await Promise.all([
          fetchPhoton(baseQuery, 10),
          fetchNominatim(baseQuery, { strictNearby: true, limit: 6 }),
          fetchNominatim(baseQuery, { strictNearby: false, limit: 6 }),
          ...altQueries.map((variant) =>
            fetchPhoton(variant, 6)
          ),
        ]);

        const merged = responseGroups.flat();
        const seen = new Set<string>();
        const unique = merged.filter((r) => {
          const key = `${parseFloat(r.lat).toFixed(4)},${parseFloat(r.lon).toFixed(4)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const ranked = unique
          .map((r) => {
            const textScore = textRelevanceScore(queryNormalized, r);
            const boost = intentBoost(queryNormalized, r);
            const distanceScore = hasLocation
              ? Math.max(
                  0,
                  24 -
                    haversineKm(
                      userLat!,
                      userLng!,
                      parseFloat(r.lat),
                      parseFloat(r.lon)
                    )
                )
              : 0;

            return { r, score: textScore * 10 + boost + distanceScore };
          })
          .sort((a, b) => b.score - a.score)
          .map((entry) => entry.r);

        setResults(ranked.slice(0, 6));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [userLat, userLng]
  );

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPlaces(value), 250);
  };

  const handleSelectResult = (r: NominatimResult) => {
    const { label, subtitle } = formatResult(r);
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    onSelectDestination(lat, lng, label);
    setQuery(label);
    setResults([]);
    setIsOpen(false);
    saveRecent({ lat, lng, label, subtitle, timestamp: Date.now() });
  };

  const handleSelectRecent = (recent: RecentDestination) => {
    onSelectDestination(recent.lat, recent.lng, recent.label);
    setQuery(recent.label);
    setResults([]);
    setIsOpen(false);
    saveRecent({ ...recent, timestamp: Date.now() });
  };

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

  const showRecents = query.length < 1 && recents.length > 0;

  return (
    <div
      className={`absolute right-2 sm:right-4 z-20 w-[min(20rem,calc(100vw-1rem))] ${hasBanner ? "top-[calc(4.5rem+env(safe-area-inset-top,0px))] sm:top-4" : "top-[calc(1rem+env(safe-area-inset-top,0px))] sm:top-4"}`}
    >
      <div className="bg-card/95 backdrop-blur-xl border border-border rounded-xl overflow-hidden">
        <div className="p-3 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-destructive flex-shrink-0" />
          <Input
            placeholder="Search for a destination..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground text-sm h-8"
            autoFocus
          />
          <button
            onClick={() => {
              setIsOpen(false);
              setResults([]);
            }}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="px-3 pb-3 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Searching...</span>
          </div>
        )}

        {/* Recent destinations */}
        {showRecents && (
          <div className="border-t border-border">
            <div className="px-3 py-1.5 flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-display text-muted-foreground uppercase tracking-wider">Recent</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {recents.map((r, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectRecent(r)}
                  className="w-full text-left px-3 py-2 hover:bg-primary/10 transition-colors flex items-start gap-2 border-b border-border/50 last:border-b-0"
                >
                  <Navigation2 className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs text-foreground leading-tight line-clamp-1 block">{r.label}</span>
                    {r.subtitle && (
                      <span className="text-[10px] text-muted-foreground leading-tight line-clamp-1 block">{r.subtitle}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search results */}
        {results.length > 0 && (
          <div className="border-t border-border max-h-48 overflow-y-auto">
            {results.map((r, i) => {
              const { label, subtitle, type } = formatResult(r);
              return (
                <button
                  key={i}
                  onClick={() => handleSelectResult(r)}
                  className="w-full text-left px-3 py-2.5 hover:bg-primary/10 transition-colors flex items-start gap-2 border-b border-border/50 last:border-b-0"
                >
                  <MapPin className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-foreground leading-tight line-clamp-1">{label}</span>
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
                </button>
              );
            })}
          </div>
        )}

        {query.length >= 1 && !loading && results.length === 0 && (
          <div className="px-3 pb-3">
            <span className="text-xs text-muted-foreground">No results found</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DestinationSearch;
