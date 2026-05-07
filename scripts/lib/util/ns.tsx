import { createContext, useContext, type ReactNode } from "react";
import type { NS } from "@ns";

const NsContext = createContext<NS | null>(null);

export function NsProvider({ ns, children }: { ns: NS; children: ReactNode }) {
  return <NsContext.Provider value={ns}>{children}</NsContext.Provider>;
}

export function useNs(): NS {
  const ns = useContext(NsContext);
  if (!ns) throw new Error("useNs must be used inside <NsProvider>");
  return ns;
}
