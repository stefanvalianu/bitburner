// used for the logger hook
export const LOG_PORT = 1;

// task scripts report spawned child PIDs upstream so the server manager can
// kill the whole tree on rebalance.
export const TASK_REPORT_PORT = 3;

// scout-server publishes {target, available[]} here. Latest-value semantics
// (clear-then-write). Consumed by the gameState snapshot and the hack
// controller.
export const SCOUT_PORT = 4;
