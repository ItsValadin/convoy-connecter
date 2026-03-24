import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share, Check, ChevronRight, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Detect iOS
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 text-center">
        <img
          src="/pwa-192x192.png"
          alt="Convoy"
          width={96}
          height={96}
          className="mx-auto rounded-2xl shadow-lg"
        />

        <div>
          <h1 className="text-3xl font-bold tracking-tight">Install Convoy</h1>
          <p className="text-muted-foreground mt-2">
            Add Convoy to your home screen for the best experience — instant access, full-screen mode, and offline map tiles.
          </p>
        </div>

        {isInstalled ? (
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-6 space-y-3">
            <Check className="w-10 h-10 text-primary mx-auto" />
            <p className="font-semibold text-primary">Convoy is installed!</p>
            <Button onClick={() => navigate("/")} className="w-full">
              Open App
            </Button>
          </div>
        ) : deferredPrompt ? (
          <Button onClick={handleInstall} size="lg" className="w-full gap-2">
            <Download className="w-5 h-5" />
            Install Convoy
          </Button>
        ) : isIOS ? (
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 text-left">
            <p className="font-semibold text-center">Install on iOS</p>
            <div className="space-y-3">
              <Step n={1} icon={<Share className="w-4 h-4" />} text='Tap the Share button in Safari' />
              <Step n={2} icon={<Smartphone className="w-4 h-4" />} text='"Add to Home Screen"' />
              <Step n={3} icon={<Check className="w-4 h-4" />} text='Tap "Add" to confirm' />
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 text-left">
            <p className="font-semibold text-center">Install on Android</p>
            <div className="space-y-3">
              <Step n={1} icon={<ChevronRight className="w-4 h-4" />} text="Open browser menu (⋮)" />
              <Step n={2} icon={<Download className="w-4 h-4" />} text='"Install app" or "Add to Home screen"' />
              <Step n={3} icon={<Check className="w-4 h-4" />} text="Tap Install to confirm" />
            </div>
          </div>
        )}

        <Button variant="ghost" onClick={() => navigate("/")} className="text-muted-foreground">
          Continue in browser
        </Button>
      </div>
    </div>
  );
};

const Step = ({ n, icon, text }: { n: number; icon: React.ReactNode; text: string }) => (
  <div className="flex items-center gap-3">
    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 text-primary text-sm font-bold shrink-0">
      {n}
    </span>
    <span className="text-muted-foreground">{icon}</span>
    <span className="text-sm">{text}</span>
  </div>
);

export default Install;
