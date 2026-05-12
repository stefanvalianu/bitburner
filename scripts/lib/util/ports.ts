import { NS } from "@ns";

// used for the logger hook
export const LOG_PORT = 1;

// The overall state controlled by the dashboard controller
// is published here. It contains pretty much everything
export const DASHBOARD_STATE_PORT = 2;

// Tasks emit TaskEvents here (FIFO). The manager drains the port on every
// tick and applies events to its in-memory snapshot.
export const TASK_EVENTS_PORT = 3;

// Latest-snapshot side-channel for player data (like DASHBOARD_STATE_PORT —
// clear+write each iteration). Lets the PlayerStats panel poll fresh stats
// without waiting for the 5s dashboard tick.
export const PLAYER_STATE_PORT = 4;

// Used by one of the various hacking system tasks.
export const HACKING_SYSTEM_COMMUNICATION_PORT = 10;

export const SERVER_PURCHASE_COMMUNICATION_PORT = 11;

// Ran on main dashboard start-up to avoid dirty state
export function clearPorts(ns: NS) {
  // clear core system ports
  ns.clearPort(LOG_PORT);
  ns.clearPort(DASHBOARD_STATE_PORT);
  ns.clearPort(TASK_EVENTS_PORT);
  ns.clearPort(PLAYER_STATE_PORT);

  // clear the task-specific ports too
  ns.clearPort(HACKING_SYSTEM_COMMUNICATION_PORT);
}

// Use consume if you want to destroy the data after reading (consume)
export function getPortData<TData>(
  ns: NS,
  portNumber: number,
  consume?: boolean,
): TData | undefined {
  const raw = consume ? ns.readPort(portNumber) : ns.peek(portNumber);
  let data: TData | undefined = undefined;

  if (raw !== "NULL PORT DATA") {
    try {
      data = JSON.parse(raw as string) as TData;
    } catch {}
  }
  return data;
}

// Drains a port of all of its data, returning it
export function drainPortData<TData>(ns: NS, portNumber: number): TData[] | undefined {
  let response: TData[] = [];
  const portHandle = ns.getPortHandle(portNumber);

  while (!portHandle.empty()) {
    let raw = portHandle.read();
    try {
      const deserialized = JSON.parse(raw) as TData;
      if (deserialized) response.push(deserialized);
    } catch {}
  }

  return response.length > 0 ? response : undefined;
}
