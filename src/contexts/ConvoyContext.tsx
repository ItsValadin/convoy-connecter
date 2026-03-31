import { createContext, useContext, useState, type ReactNode } from "react";
import { useConvoy } from "@/hooks/useConvoy";

const DEFAULT_CENTER: [number, number] = [34.0522, -118.2437]; // LA

type ConvoyContextType = ReturnType<typeof useConvoy> & {
  center: [number, number];
  setCenter: (c: [number, number]) => void;
};

const ConvoyContext = createContext<ConvoyContextType | null>(null);

export const ConvoyProvider = ({ children }: { children: ReactNode }) => {
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const convoy = useConvoy(center);

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
