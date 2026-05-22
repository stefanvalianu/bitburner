import { NS } from "@ns";

// used for the logger hook
export const LOG_PORT = 1;

// A published ledger of task states and allocations.
export const TASK_STATE_PORT = 2;

/*
  Events meant to be consumed by the app's task manager.
  These are drained every tick and applied to support behaviors
  like freeing memory from tasks which have terminated, etc.
*/
export const TASK_EVENTS_PORT = 3;

// Port used to store UX preferences for tasks to consume
export const USER_PREFERENCES_PORT = 4;

// Port to wait on for the main app. Should never be written to.
export const KILLSWITCH_PORT = 5;

// Used by one of the various hacking system tasks.
export const HACKING_SYSTEM_REQUEST_PORT = 10;
export const HACKING_SYSTEM_STATE_PORT = 11;

export const INFILTRATOR_STATE_PORT = 14;
export const STOCK_TRADER_STATE_PORT = 15;

export const ACTIONATOR_REQUEST_PORT = 20;
export const ACTIONATOR_QUEUE_PORT = 21;

export const BACKDOORER_STATE_PORT = 22;

// Ports used by the info-miner task to post info snapshots for the main
// dashboard (and potentially others) to consume
export const SLEEVE_INFO_PORT = 32;
export const GANG_INFO_PORT = 33;

export const GANG_EQUIPMENT_PORT = 40;

//export const SERVER_PURCHASE_COMMUNICATION_PORT = 11;

// Ran on main dashboard start-up to avoid dirty state
export function clearPorts(ns: NS) {
  // clear core system ports
  ns.clearPort(LOG_PORT);
  ns.clearPort(TASK_STATE_PORT);
  ns.clearPort(TASK_EVENTS_PORT);
  ns.clearPort(USER_PREFERENCES_PORT);
  ns.clearPort(KILLSWITCH_PORT);

  ns.clearPort(INFILTRATOR_STATE_PORT);
  ns.clearPort(STOCK_TRADER_STATE_PORT);

  ns.clearPort(ACTIONATOR_REQUEST_PORT);
  ns.clearPort(ACTIONATOR_QUEUE_PORT);

  ns.clearPort(BACKDOORER_STATE_PORT);
  
  ns.clearPort(HACKING_SYSTEM_REQUEST_PORT);
  ns.clearPort(HACKING_SYSTEM_STATE_PORT);

  ns.clearPort(SLEEVE_INFO_PORT);
  ns.clearPort(GANG_INFO_PORT);

  ns.clearPort(GANG_EQUIPMENT_PORT);
}

// Use consume if you want to destroy the data after reading
export function getPortData<TData>(
  ns: NS,
  portNumber: number,
  consume?: boolean,
): TData | undefined {
  const raw = consume ? ns.readPort(portNumber) : ns.peek(portNumber);
  let data: TData | undefined = undefined;

  if (raw !== "NULL PORT DATA") {
    try {
      data = raw as TData;
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
      const data = raw as TData;
      if (data) response.push(data);
    } catch {}
  }

  return response.length > 0 ? response : undefined;
}
