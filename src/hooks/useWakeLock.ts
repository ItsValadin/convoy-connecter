import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { toast } from "sonner";

const IOS_AUTOLOCK_KEY = "convoy-ios-autolock-dismissed";

export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    // Native: use KeepAwake plugin (works reliably on iOS/Android)
    if (Capacitor.isNativePlatform()) {
      KeepAwake.keepAwake().catch(() => {});
      return () => {
        KeepAwake.allowSleep().catch(() => {});
      };
    }

    // Detect iOS web (Safari PWA) — show settings instructions
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIOS) {
      const dismissed = localStorage.getItem(IOS_AUTOLOCK_KEY);
      if (!dismissed) {
        toast.info("Keep your screen on", {
          description:
            "For the best experience, go to Settings → Display & Brightness → Auto-Lock and set it to \"Never\" while using this app.",
          duration: 15000,
          action: {
            label: "Got it",
            onClick: () => {
              localStorage.setItem(IOS_AUTOLOCK_KEY, "1");
            },
          },
        });
      }
      return;
    }

    // Other browsers: use Wake Lock API
    if (!("wakeLock" in navigator)) return;

    const request = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Wake lock request failed (e.g. low battery)
      }
    };

    request();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        request();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);
}
