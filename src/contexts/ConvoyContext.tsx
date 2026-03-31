import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useConvoy } from "@/hooks/useConvoy";

const DEFAULT_CENTER: [number, number] = [34.0522, -118.2437]; // LA fallback

const getSavedCenter = (): [number, number] | null => {
  try {
    const raw = localStorage.getItem("convoy-last-center");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 2) return parsed as [number, number];
  } catch {}
  return null;
};

type ConvoyContextType = ReturnType<typeof useConvoy> & {
  center: [number, number];
  setCenter: (c: [number, number]) => void;
};

const ConvoyContext = createContext<ConvoyContextType | null>(null);

export const ConvoyProvider = ({ children }: { children: ReactNode }) => {
  const [center, setCenterState] = useState<[number, number]>(getSavedCenter() || DEFAULT_CENTER);
  const convoy = useConvoy(center);

  const setCenter = (c: [number, number]) => {
    setCenterState(c);
    localStorage.setItem("convoy-last-center", JSON.stringify(c));
  };

  return (
    <ConvoyContext.Provider value={{ ...convoy, center, setCenter }}>
      {children}
    </ConvoyContext.Provider>
  );
};

export const useConvoyContext = () => {
  const ctx = useContext(ConvoyContext);
  if (!ctx) throw new Error("useConvoyContext must be used within ConvoyProvider");
  return ctx;
};
