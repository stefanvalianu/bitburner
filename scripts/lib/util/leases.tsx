import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useGameState } from "./gameState";
import { useLogger } from "./log";
import { useNs } from "./ns";
import { freeRamForHost, pickServer, type Lease } from "./leasePolicy";
import { drainInbound, writeLeaseResponse } from "./leaseProtocol";

const DEFAULT_POLL_MS = 2000;

export interface LeasesApi {
  leases: Lease[];
  freeRamOf: (hostname: string) => number;
}

const LeasesContext = createContext<LeasesApi | null>(null);

// Owns the in-memory lease ledger and services SERVER_MANAGEMENT_PORT.
// Sits inside GameStateProvider because it consults the latest server
// snapshot when scoring requests.
export function LeaseProvider({
  pollMs = DEFAULT_POLL_MS,
  children,
}: {
  pollMs?: number;
  children: ReactNode;
}) {
  const ns = useNs();
  const log = useLogger("leases");
  const { servers } = useGameState();
  const [leases, setLeases] = useState<Lease[]>([]);

  // Refs hold the latest snapshot of leases / servers so the polling effect
  // doesn't have to list them as dependencies (which would tear down and
  // re-install the interval on every gameState tick — every 10s — and risk
  // dropping inbound messages).
  const leasesRef = useRef<Lease[]>(leases);
  leasesRef.current = leases;
  const serversRef = useRef(servers);
  serversRef.current = servers;

  useEffect(() => {
    const id = setInterval(() => {
      // Reap leases whose owning script has died without releasing.
      let next = leasesRef.current.filter((l) => {
        if (ns.isRunning(l.pid)) return true;
        log.info(`reaped ${l.hostname} (pid ${l.pid} dead)`);
        return false;
      });

      const inbound = drainInbound(ns);
      for (const msg of inbound) {
        if (msg.type === "release") {
          const before = next.length;
          next = next.filter((l) => l.id !== msg.leaseId);
          if (next.length < before) log.info(`released ${msg.leaseId}`);
          continue;
        }
        const accountedNext = next;
        const freeRamOf = (h: string) => freeRamForHost(serversRef.current, accountedNext, h);
        const server = pickServer(serversRef.current, {
          purpose: msg.purpose,
          ramNeeded: msg.ramNeeded,
          freeRamOf,
        });
        if (!server) {
          writeLeaseResponse(ns, msg.replyPort, {
            type: "response",
            id: msg.id,
            granted: false,
            reason: "no eligible server",
          });
          log.warn(`denied ${msg.purpose} (pid=${msg.pid}): no eligible server`);
          continue;
        }
        const lease: Lease = {
          id: msg.id,
          hostname: server.hostname,
          purpose: msg.purpose,
          ramReserved: msg.ramNeeded ?? 0,
          pid: msg.pid,
          grantedAt: Date.now(),
        };
        next = [...next, lease];
        writeLeaseResponse(ns, msg.replyPort, {
          type: "response",
          id: msg.id,
          granted: true,
          leaseId: lease.id,
          hostname: lease.hostname,
          ramReserved: lease.ramReserved,
        });
        log.info(`granted ${lease.hostname} → ${msg.purpose} (pid=${msg.pid})`);
      }

      if (next !== leasesRef.current) {
        leasesRef.current = next;
        setLeases(next);
      }
    }, pollMs);
    return () => clearInterval(id);
  }, [ns, log, pollMs]);

  const api = useMemo<LeasesApi>(
    () => ({
      leases,
      freeRamOf: (h) => freeRamForHost(servers, leases, h),
    }),
    [leases, servers],
  );

  return <LeasesContext.Provider value={api}>{children}</LeasesContext.Provider>;
}

export function useLeases(): LeasesApi {
  const v = useContext(LeasesContext);
  if (!v) throw new Error("useLeases must be used inside <LeaseProvider>");
  return v;
}
