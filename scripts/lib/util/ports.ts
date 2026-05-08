// NOTE: remember to clear the ports on dashboard starts, to be safe across script re-starts

// used for the logger hook
export const LOG_PORT = 1;

// The task manager publishes the authoritative TaskStateSnapshot here on
// every tick (clear-then-write, latest-value semantics). Tasks `peek` to
// read their own slot and the global view.
export const TASK_STATE_PORT = 2;

// Tasks emit TaskEvents here (FIFO). The manager drains the port on every
// tick and applies events to its in-memory snapshot.
export const TASK_EVENTS_PORT = 3;
