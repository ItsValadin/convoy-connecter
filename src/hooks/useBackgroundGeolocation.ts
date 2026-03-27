import { useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Provides a unified GPS tracking interface.
 * - On native (iOS/Android): uses @transistorsoft/capacitor-background-geolocation
 *   for persistent background tracking even when the app is minimized.
 * - On web: falls back to the browser Geolocation API (watchPosition).
 */

export interface GeoPosition {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
}

interface UseBackgroundGeolocationOptions {
  onPosition: (pos: GeoPosition) => void;
  onError?: (error: string) => void;
}

export const useBackgroundGeolocation = () => {
  const watchIdRef = useRef<number | null>(null);
  const bgGeoSubscriptionsRef = useRef<any[]>([]);
  const isNative = Capacitor.isNativePlatform();
  const startedRef = useRef(false);

  const start = useCallback(async (options: UseBackgroundGeolocationOptions) => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (isNative) {
      try {
        const BackgroundGeolocation = (
          await import("@transistorsoft/capacitor-background-geolocation")
        ).default;

        // Wire up location listener
        const onLocation = BackgroundGeolocation.onLocation((location) => {
          options.onPosition({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            speed: location.coords.speed ?? null,
            heading: location.coords.heading ?? null,
          });
        });
        bgGeoSubscriptionsRef.current.push(onLocation);

        // Wire up error listener
        const onError = BackgroundGeolocation.onProviderChange((event) => {
          if (!event.enabled) {
            options.onError?.("Location services disabled");
          }
        });
        bgGeoSubscriptionsRef.current.push(onError);

        // Ready the plugin with config
        await BackgroundGeolocation.ready({
          // Location config
          desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
          distanceFilter: 5, // meters — emit location every 5m of movement
          stopOnTerminate: false, // continue tracking after app is terminated
          startOnBoot: true, // auto-start on device reboot
          // Activity recognition
          stopTimeout: 5, // minutes to wait before entering "still" state
          // Application config
          debug: false, // disable debug sounds/notifications
          logLevel: BackgroundGeolocation.LOG_LEVEL_WARNING,
          // Prevent the plugin from using its own HTTP sync — we handle it ourselves
          autoSync: false,
          // iOS-specific
          locationAuthorizationRequest: "Always", // request "Always" for background
          backgroundPermissionRationale: {
            title: "Allow Convoy to track your location in the background?",
            message:
              "Convoy needs background location access so your convoy members can see your position even when the app is minimized.",
            positiveAction: "Change to Always Allow",
            negativeAction: "Cancel",
          },
        });

        // Start tracking
        await BackgroundGeolocation.start();

        console.log("[BackgroundGeo] Native tracking started");
      } catch (err) {
        console.error("[BackgroundGeo] Failed to start native tracking:", err);
        // Fall back to browser geolocation
        startBrowserWatch(options);
      }
    } else {
      startBrowserWatch(options);
    }
  }, [isNative]);

  const startBrowserWatch = (options: UseBackgroundGeolocationOptions) => {
    if (!navigator.geolocation) {
      options.onError?.("Geolocation is not supported by your browser");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        options.onPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          speed: position.coords.speed,
          heading: position.coords.heading,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          options.onError?.("Location permission denied. Enable it in browser settings.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          options.onError?.("Location unavailable. Check your GPS.");
        } else if (error.code === error.TIMEOUT) {
          options.onError?.("Location request timed out.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  };

  const stop = useCallback(async () => {
    if (!startedRef.current) return;
    startedRef.current = false;

    if (isNative) {
      try {
        const BackgroundGeolocation = (
          await import("@transistorsoft/capacitor-background-geolocation")
        ).default;
        // Remove subscriptions
        bgGeoSubscriptionsRef.current.forEach((sub) => sub.remove());
        bgGeoSubscriptionsRef.current = [];
        await BackgroundGeolocation.stop();
        console.log("[BackgroundGeo] Native tracking stopped");
      } catch (err) {
        console.error("[BackgroundGeo] Failed to stop native tracking:", err);
      }
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, [isNative]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { start, stop, isNative };
};
