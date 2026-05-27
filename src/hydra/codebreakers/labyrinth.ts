import { DarknetResult, NS } from "@ns";
import { HydraAuthInfo, HydraIpPortState } from "@repo/hydra/types";
import { ipv4ToUint32Fast } from "../helpers";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

type Direction = "north" | "east" | "south" | "west";

type LabLocationReport = {
  success: true;
  coords: [number, number];
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
};

type LabCell = {
  exits: Record<Direction, boolean>;
  backtrack?: Direction;
};

type MoveResult =
  | { result: "moved"; report: LabLocationReport }
  | { result: "solved"; password: string }
  | { result: "transient" };

const DIRECTIONS: readonly Direction[] = ["north", "east", "south", "west"];

const DELTA: Record<Direction, readonly [number, number]> = {
  north: [0, -2],
  east: [2, 0],
  south: [0, 2],
  west: [-2, 0],
};

const OPPOSITE: Record<Direction, Direction> = {
  north: "south",
  east: "west",
  south: "north",
  west: "east",
};

export class LabyrinthCodebreaker extends Codebreaker {
  private static readonly MAX_STEPS = 50_000;
  private static readonly MOVE_RETRIES = 3;

  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    let report = await this.readLabReport();
    if (report === null) {
      return { result: "transient" };
    }

    const cells = new Map<string, LabCell>();

    for (let step = 0; step < LabyrinthCodebreaker.MAX_STEPS; step++) {
      const cell = this.upsertCell(cells, report);
      const nextDirection = this.findUnvisitedExit(report, cells);

      if (nextDirection !== null) {
        const move = await this.move(nextDirection, report);

        if (move.result === "solved") {
          return { result: "ok", password: move.password };
        }

        if (move.result === "transient") {
          return { result: "transient" };
        }

        const nextCell = this.upsertCell(cells, move.report);
        nextCell.backtrack ??= OPPOSITE[nextDirection];

        report = move.report;
        continue;
      }

      if (cell.backtrack === undefined) {
        return { result: "impossible" };
      }

      const move = await this.move(cell.backtrack, report);

      if (move.result === "solved") {
        return { result: "ok", password: move.password };
      }

      if (move.result === "transient") {
        return { result: "transient" };
      }

      report = move.report;
    }

    return { result: "transient" };
  }

  private async move(direction: Direction, from: LabLocationReport): Promise<MoveResult> {
    const expected = this.neighbor(from.coords, direction);

    for (let i = 0; i < LabyrinthCodebreaker.MOVE_RETRIES; i++) {
      // Labyrinth submits the move direction as the "password" and needs the
      // raw DarknetResult so it can read the real password out of result.data
      // on success. The base authenticate() helper only returns a status string.
      const result = await this.ns.dnet.authenticate(this.info.targetIp, direction);

      if (result.success) {
        const password = this.getSolvedPassword(result, direction);
        this.markInfected(password);
        return { result: "solved", password };
      }

      if (result.code === 351 || result.code === 503) {
        return { result: "transient" };
      }

      const report = await this.readLabReport();
      if (report === null) {
        return { result: "transient" };
      }

      if (report.coords[0] === expected[0] && report.coords[1] === expected[1]) {
        return { result: "moved", report };
      }
    }

    return { result: "transient" };
  }

  private async readLabReport(): Promise<LabLocationReport | null> {
    const raw = await this.ns.dnet.labreport();

    if (!this.isLabLocationReport(raw)) {
      return null;
    }

    return {
      success: true,
      coords: [raw.coords[0], raw.coords[1]],
      north: raw.north,
      east: raw.east,
      south: raw.south,
      west: raw.west,
    };
  }

  private upsertCell(cells: Map<string, LabCell>, report: LabLocationReport): LabCell {
    const key = this.key(report.coords);
    const existing = cells.get(key);

    if (existing !== undefined) {
      existing.exits = this.exitsFrom(report);
      return existing;
    }

    const cell: LabCell = {
      exits: this.exitsFrom(report),
    };

    cells.set(key, cell);
    return cell;
  }

  private findUnvisitedExit(report: LabLocationReport, cells: Map<string, LabCell>): Direction | null {
    const exits = this.exitsFrom(report);

    for (const direction of DIRECTIONS) {
      if (!exits[direction]) continue;

      const neighbor = this.neighbor(report.coords, direction);
      if (!cells.has(this.key(neighbor))) {
        return direction;
      }
    }

    return null;
  }

  private exitsFrom(report: LabLocationReport): Record<Direction, boolean> {
    return {
      north: report.north,
      east: report.east,
      south: report.south,
      west: report.west,
    };
  }

  private neighbor(coords: readonly [number, number], direction: Direction): [number, number] {
    const [dx, dy] = DELTA[direction];
    return [coords[0] + dx, coords[1] + dy];
  }

  private key(coords: readonly [number, number]): string {
    return `${coords[0]},${coords[1]}`;
  }

  private getSolvedPassword(result: DarknetResult & { data?: unknown }, fallback: string): string {
    if (typeof result.data === "string" && result.data.length > 0) {
      return result.data;
    }

    return fallback;
  }

  private markInfected(password: string): void {
    const port = ipv4ToUint32Fast(this.info.targetIp);

    this.ns.clearPort(port);
    this.ns.writePort(port, {
      ip: this.info.targetIp,
      state: "infected",
      password,
    } satisfies HydraIpPortState);
  }

  private isLabLocationReport(value: unknown): value is LabLocationReport {
    if (value === null || typeof value !== "object") {
      return false;
    }

    const report = value as Record<string, unknown>;

    return (
      report.success === true &&
      Array.isArray(report.coords) &&
      report.coords.length >= 2 &&
      Number.isInteger(report.coords[0]) &&
      Number.isInteger(report.coords[1]) &&
      typeof report.north === "boolean" &&
      typeof report.east === "boolean" &&
      typeof report.south === "boolean" &&
      typeof report.west === "boolean"
    );
  }
}
