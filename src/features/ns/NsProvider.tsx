import { createContext, useContext, type ReactNode } from "react";
import type { NS } from "@ns";

const NsContext = createContext<NS | null>(null);

type Props = {
  ns: NS;
  children: ReactNode;
}

export function NsProvider({ ns, children }: Props) {
  console.log('[TODO-REMOVE nsProvider rendered]');
  return <NsContext.Provider value={ns}>{children}</NsContext.Provider>;
}

export function useNs(): NS {
  const ns = useContext(NsContext);
  if (!ns) throw new Error("useNs must be used inside <NsProvider>");
  return ns;
}
