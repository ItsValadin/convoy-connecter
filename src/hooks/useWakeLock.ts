import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { KeepAwake } from "@capacitor-community/keep-awake";

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

    // Web fallback: use Wake Lock API
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
