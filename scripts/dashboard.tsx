import { useEffect, useState } from "react";
import type { NS } from "@ns";

interface DashboardProps {
  ns: NS;
}

function Dashboard({ ns }: DashboardProps) {
  const [money, setMoney] = useState(ns.getServerMoneyAvailable("home"));
  const [hackLevel, setHackLevel] = useState(ns.getHackingLevel());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMoney(ns.getServerMoneyAvailable("home"));
      setHackLevel(ns.getHackingLevel());
      setTick((t) => t + 1);
    }, 500);
    return () => clearInterval(id);
  }, [ns]);

  const moneyStr = money.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div
      style={{
        fontFamily: "monospace",
        padding: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        minWidth: "260px",
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: "14px", color: "#0f0" }}>
        Home Dashboard
      </div>
      <div>
        Money: <span style={{ color: "#0f0" }}>${moneyStr}</span>
      </div>
      <div>
        Hacking level: <span style={{ color: "#0ff" }}>{hackLevel}</span>
      </div>
      <div style={{ opacity: 0.5, fontSize: "10px" }}>tick {tick}</div>
      <button
        onClick={() => ns.tprint(`[dashboard] money snapshot: $${moneyStr}`)}
        style={{
          marginTop: 4,
          padding: "4px 8px",
          background: "#222",
          color: "#0f0",
          border: "1px solid #0f0",
          cursor: "pointer",
          fontFamily: "monospace",
        }}
      >
        Print snapshot to terminal
      </button>
    </div>
  );
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.clearLog();
  ns.ui.openTail();
  ns.printRaw(<Dashboard ns={ns} />);
  while (true) await ns.asleep(60_000);
}
