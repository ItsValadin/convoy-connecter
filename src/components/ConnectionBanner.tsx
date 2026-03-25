import { WifiOff } from "lucide-react";

interface ConnectionBannerProps {
  visible: boolean;
}

const ConnectionBanner = ({ visible }: ConnectionBannerProps) => {
  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg animate-in slide-in-from-top fade-in duration-300">
      <WifiOff className="h-4 w-4" />
      <span>Connection lost — reconnecting...</span>
    </div>
  );
};

export default ConnectionBanner;
