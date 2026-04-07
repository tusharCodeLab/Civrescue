import * as React from "react";
import { useCivRescueData } from "@/hooks/use-civrescue";

type CivRescueContextValue = ReturnType<typeof useCivRescueData>;

const CivRescueContext = React.createContext<CivRescueContextValue | null>(null);

export function CivRescueProvider({ children }: { children: React.ReactNode }) {
  const value = useCivRescueData();
  return <CivRescueContext.Provider value={value}>{children}</CivRescueContext.Provider>;
}

export function useCivRescue() {
  const context = React.useContext(CivRescueContext);

  // Fallback keeps app operational even if a transient HMR/provider boundary mismatch occurs.
  // React Query will still share cached results by query key, so data remains consistent.
  const fallback = useCivRescueData();

  return context ?? fallback;
}
