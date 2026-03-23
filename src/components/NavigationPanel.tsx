import { useState } from "react";
import { ChevronUp, ChevronDown, Navigation, Clock, Route } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  location: [number, number]; // [lat, lng] of maneuver
}

export interface RouteInfo {
  distance: number; // meters
  duration: number; // seconds
  steps: RouteStep[];
}

interface NavigationPanelProps {
  route: RouteInfo | null;
  loading?: boolean;
}

const formatDistance = (meters: number) => {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
};

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
};

const NavigationPanel = ({ route, loading }: NavigationPanelProps) => {
  const [expanded, setExpanded] = useState(false);

  if (!route && !loading) return null;

  return (
    <div className="absolute bottom-20 left-4 z-10 w-72 max-h-[50vh] flex flex-col">
      {/* Summary bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 bg-card/95 backdrop-blur-xl border border-border rounded-t-xl px-4 py-3 w-full text-left hover:bg-secondary/50 transition-colors"
      >
        <Navigation className="w-5 h-5 text-primary shrink-0" />
        {loading ? (
          <span className="font-display text-xs text-muted-foreground animate-pulse">Calculating route…</span>
        ) : route ? (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 font-display text-sm font-semibold text-foreground">
                <Route className="w-3.5 h-3.5 text-primary" />
                {formatDistance(route.distance)}
              </span>
              <span className="flex items-center gap-1 font-display text-sm text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                {formatDuration(route.duration)}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground font-display">
              {route.steps.length} steps • tap to {expanded ? "hide" : "show"}
            </span>
          </div>
        ) : null}
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Steps list */}
      {expanded && route && (
        <div className="bg-card/95 backdrop-blur-xl border border-t-0 border-border rounded-b-xl overflow-y-auto max-h-[35vh] scrollbar-thin">
          {route.steps.map((step, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0"
            >
              <span className="font-display text-[10px] font-bold text-primary bg-primary/10 rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-display text-xs text-foreground leading-snug">{step.instruction}</p>
                <p className="font-display text-[10px] text-muted-foreground mt-0.5">
                  {formatDistance(step.distance)} • {formatDuration(step.duration)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NavigationPanel;
