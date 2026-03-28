import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { KeepAwake } from "@capacitor-community/keep-awake";
import NoSleep from "nosleep.js";

export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const noSleepRef = useRef<NoSleep | null>(null);

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
      // Use NoSleep.js which plays a silent video to prevent sleep on iOS Safari
      const noSleep = new NoSleep();
      noSleepRef.current = noSleep;

      const enableOnInteraction = () => {
        noSleep.enable();
        document.removeEventListener("touchstart", enableOnInteraction);
        document.removeEventListener("click", enableOnInteraction);
      };

      // NoSleep requires a user gesture to start on iOS
      document.addEventListener("touchstart", enableOnInteraction, { once: true });
      document.addEventListener("click", enableOnInteraction, { once: true });

      // Re-enable after returning from background
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          noSleep.enable();
        }
      };
      document.addEventListener("visibilitychange", onVisibilityChange);

      return () => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        document.removeEventListener("touchstart", enableOnInteraction);
        document.removeEventListener("click", enableOnInteraction);
        noSleep.disable();
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
