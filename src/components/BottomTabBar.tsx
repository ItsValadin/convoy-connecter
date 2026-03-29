import { useLocation, useNavigate } from "react-router-dom";
import { Navigation, BarChart3 } from "lucide-react";

const BottomTabBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isStats = location.pathname === "/stats";
  const isHome = location.pathname === "/";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="bg-card/95 backdrop-blur-xl border-t border-border flex items-stretch pb-[env(safe-area-inset-bottom,0px)]">
        <button
          onClick={() => navigate("/")}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
            isHome
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Navigation className="w-5 h-5" />
          <span className="font-display text-[10px] uppercase tracking-widest">Map</span>
        </button>
        <button
          onClick={() => navigate("/stats")}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
            isStats
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="font-display text-[10px] uppercase tracking-widest">Stats</span>
        </button>
      </div>
    </div>
  );
};

export default BottomTabBar;
