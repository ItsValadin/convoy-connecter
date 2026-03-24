import { useState, useRef, useCallback } from "react";
import { Search, MapPin, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface DestinationSearchProps {
  onSelectDestination: (lat: number, lng: number, label: string) => void;
  onClearDestination: () => void;
  hasDestination: boolean;
  hasBanner?: boolean;
}

const DestinationSearch = ({ onSelectDestination, onClearDestination, hasDestination, hasBanner }: DestinationSearchProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchPlaces = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        format: "json",
        q,
        limit: "8",
        addressdetails: "1",
        dedupe: "1",
      });
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        { headers: { "Accept-Language": "en" } }
      );
      const data: SearchResult[] = await res.json();
      // Deduplicate by rounding coords to ~100m precision
      const seen = new Set<string>();
      const unique = data.filter((r) => {
        const key = `${parseFloat(r.lat).toFixed(3)},${parseFloat(r.lon).toFixed(3)}`;
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
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPlaces(value), 400);
  };

  const formatLabel = (name: string) => {
    const parts = name.split(",").map((s) => s.trim());
    if (parts.length <= 2) return name;
    return `${parts[0]}, ${parts[1]}`;
  };

  const handleSelect = (result: SearchResult) => {
    const label = formatLabel(result.display_name);
    onSelectDestination(parseFloat(result.lat), parseFloat(result.lon), label);
    setQuery(label);
    setResults([]);
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <div className={`absolute right-2 sm:right-4 z-10 flex gap-1.5 sm:gap-2 ${hasBanner ? "top-[4.5rem] sm:top-4" : "top-4"}`}>
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
            onClick={onClearDestination}
          >
            <X className="w-4 h-4 mr-1.5" /> Clear
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-2 sm:right-4 z-20 w-[min(20rem,calc(100vw-1rem))]">
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
            onClick={() => { setIsOpen(false); setResults([]); }}
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

        {results.length > 0 && (
          <div className="border-t border-border max-h-48 overflow-y-auto">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => handleSelect(r)}
                className="w-full text-left px-3 py-2.5 hover:bg-primary/10 transition-colors flex items-start gap-2 border-b border-border/50 last:border-b-0"
              >
                <MapPin className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                <span className="text-xs text-foreground leading-tight line-clamp-2">
                  {r.display_name}
                </span>
              </button>
            ))}
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
