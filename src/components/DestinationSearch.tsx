import { useState, useRef, useCallback, useEffect } from "react";
import { Search, MapPin, X, Loader2, Clock, Navigation2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PhotonFeature {
  geometry: { coordinates: [number, number] }; // [lon, lat]
  properties: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    osm_value?: string;
    osm_key?: string;
    type?: string;
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
  city: "City",
  town: "Town",
  village: "Village",
  hamlet: "Hamlet",
  suburb: "Suburb",
  neighbourhood: "Neighbourhood",
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
  atm: "ATM",
  cinema: "Cinema",
  theatre: "Theatre",
  park: "Park",
  stadium: "Stadium",
  airport: "Airport",
  bus_station: "Bus Station",
  train_station: "Train Station",
};

function formatPhotonResult(props: PhotonFeature["properties"]): { label: string; subtitle: string; type: string | null } {
  const name = props.name || props.street || "Unknown";
  const typeKey = props.osm_value || props.type || "";
  const type = TYPE_LABELS[typeKey] || null;

  const parts: string[] = [];
  if (props.street && props.street !== name) {
    parts.push(props.housenumber ? `${props.housenumber} ${props.street}` : props.street);
  }
  if (props.city) parts.push(props.city);
  if (props.state) parts.push(props.state);

  return { label: name, subtitle: parts.join(", "), type };
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
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [recents, setRecents] = useState<RecentDestination[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) setRecents(loadRecent());
  }, [isOpen]);

  const searchPlaces = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q,
          limit: "8",
        });
        if (userLat != null && userLng != null) {
          params.set("lat", String(userLat));
          params.set("lon", String(userLng));
        }
        const res = await fetch(`https://photon.komoot.de/api/?${params}`);
        const data = await res.json();
        const features: PhotonFeature[] = data.features || [];

        // Deduplicate by rounding coords
        const seen = new Set<string>();
        const unique = features.filter((f) => {
          const [lon, lat] = f.geometry.coordinates;
          const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        setResults(unique.slice(0, 6));
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
    debounceRef.current = setTimeout(() => searchPlaces(value), 300);
  };

  const handleSelect = (lat: number, lng: number, label: string, subtitle?: string) => {
    onSelectDestination(lat, lng, label);
    setQuery(label);
    setResults([]);
    setIsOpen(false);
    saveRecent({ lat, lng, label, subtitle, timestamp: Date.now() });
  };

  const handleSelectPhoton = (feature: PhotonFeature) => {
    const [lon, lat] = feature.geometry.coordinates;
    const { label, subtitle } = formatPhotonResult(feature.properties);
    handleSelect(lat, lon, label, subtitle);
  };

  const handleSelectRecent = (recent: RecentDestination) => {
    handleSelect(recent.lat, recent.lng, recent.label, recent.subtitle);
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
          onClick={() => setIsOpen(true)}
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

  const showRecents = query.length < 2 && recents.length > 0;

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
            {results.map((f, i) => {
              const { label, subtitle, type } = formatPhotonResult(f.properties);
              return (
                <button
                  key={i}
                  onClick={() => handleSelectPhoton(f)}
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

        {query.length >= 2 && !loading && results.length === 0 && (
          <div className="px-3 pb-3">
            <span className="text-xs text-muted-foreground">No results found</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DestinationSearch;
