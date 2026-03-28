import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { KeepAwake } from "@capacitor-community/keep-awake";

type NoSleepInstance = { enable: () => void; disable: () => void };

export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const noSleepRef = useRef<NoSleepInstance | null>(null);

  useEffect(() => {
    // Native: use KeepAwake plugin (works reliably on iOS/Android)
    if (Capacitor.isNativePlatform()) {
      KeepAwake.keepAwake().catch(() => {});
      return () => {
        KeepAwake.allowSleep().catch(() => {});
      };
    }

    // Detect iOS web (Safari PWA) — Wake Lock API is unreliable on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIOS) {
      let cleanedUp = false;
      let onVisibilityChange: (() => void) | null = null;
      let enableOnInteraction: (() => void) | null = null;

      // Dynamically import to avoid HMR side-effect issues
      import("nosleep.js").then(({ default: NoSleep }) => {
        if (cleanedUp) return;
        const noSleep = new NoSleep();
        noSleepRef.current = noSleep;

        enableOnInteraction = () => {
          noSleep.enable();
          document.removeEventListener("touchstart", enableOnInteraction!);
          document.removeEventListener("click", enableOnInteraction!);
        };

        // NoSleep requires a user gesture to start on iOS
        document.addEventListener("touchstart", enableOnInteraction, { once: true });
        document.addEventListener("click", enableOnInteraction, { once: true });

        // Re-enable after returning from background
        onVisibilityChange = () => {
          if (document.visibilityState === "visible") {
            noSleep.enable();
          }
        };
        document.addEventListener("visibilitychange", onVisibilityChange);
      });

      return () => {
        cleanedUp = true;
        if (onVisibilityChange) document.removeEventListener("visibilitychange", onVisibilityChange);
        if (enableOnInteraction) {
          document.removeEventListener("touchstart", enableOnInteraction);
          document.removeEventListener("click", enableOnInteraction);
        }
        noSleepRef.current?.disable();
        noSleepRef.current = null;
      };
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
