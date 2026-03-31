import { useState, useCallback } from "react";

const AD_SHOWN_KEY = "convoy-ad-shown";

export const useAdGate = () => {
  const [showingAd, setShowingAd] = useState(false);
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  const hasSeenAd = () => sessionStorage.getItem(AD_SHOWN_KEY) === "true";

  const gateAction = useCallback((callback: () => void) => {
    if (hasSeenAd()) {
      callback();
      return;
    }
    setPendingCallback(() => callback);
    setShowingAd(true);
  }, []);

  const onAdComplete = useCallback(() => {
    sessionStorage.setItem(AD_SHOWN_KEY, "true");
    setShowingAd(false);
    pendingCallback?.();
    setPendingCallback(null);
  }, [pendingCallback]);

  const onAdSkip = useCallback(() => {
    sessionStorage.setItem(AD_SHOWN_KEY, "true");
    setShowingAd(false);
    pendingCallback?.();
    setPendingCallback(null);
  }, [pendingCallback]);

  return { showingAd, gateAction, onAdComplete, onAdSkip };
};
