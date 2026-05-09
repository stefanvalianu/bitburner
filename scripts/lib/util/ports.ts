// NOTE: remember to clear the ports on dashboard starts, to be safe across script re-starts

import { NS } from "@ns";

// used for the logger hook
export const LOG_PORT = 1;

// The overall state controlled by the dashboard controller
// is published here. It contains pretty much everything
export const DASHBOARD_STATE_PORT = 2;

// Tasks emit TaskEvents here (FIFO). The manager drains the port on every
// tick and applies events to its in-memory snapshot.
export const TASK_EVENTS_PORT = 3;

// Ran on main dashboard start-up to avoid dirty state
export function clearPorts(ns: NS) {
  ns.clearPort(LOG_PORT);
  ns.clearPort(DASHBOARD_STATE_PORT);
  ns.clearPort(TASK_EVENTS_PORT);
}
