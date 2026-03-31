import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface AdInterstitialProps {
  onComplete: () => void;
  onSkip: () => void;
}

const COUNTDOWN_SECONDS = 5;

const AdInterstitial = ({ onComplete, onSkip }: AdInterstitialProps) => {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    // Auto-complete after countdown + 1s buffer
    const timeout = setTimeout(onComplete, (COUNTDOWN_SECONDS + 1) * 1000);
    return () => clearTimeout(timeout);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center safe-top safe-bottom">
      {/* Skip button */}
      <div className="absolute top-4 right-4 safe-top">
        {countdown <= 0 ? (
          <button
            onClick={onSkip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-sm font-display text-foreground hover:border-primary/40 transition-colors"
          >
            <X className="w-4 h-4" />
            Skip
          </button>
        ) : (
          <span className="px-3 py-1.5 rounded-lg border border-border bg-card text-sm font-display text-muted-foreground">
            Skip in {countdown}s
          </span>
        )}
      </div>

      {/* Ad container */}
      <div className="w-full max-w-md px-6">
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-4">
          {/* Placeholder — replace with real AdSense ad unit */}
          <div className="w-full aspect-[4/3] bg-secondary/40 rounded-xl flex items-center justify-center border border-border">
            <div className="text-center space-y-2">
              <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                Advertisement
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                AdSense ad unit will appear here
              </p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/50 font-display">
            Support Convoy by viewing this ad
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdInterstitial;
