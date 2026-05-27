import { NS } from "@ns";
import { Codebreaker, CodebreakerResult, PasswordAttemptLog } from "./codebreaker";
import { HydraAuthInfo } from "../types";

type ScoredGuess = {
  guess: number;
  score: number;
};

type ProbeResult =
  | { result: "ok"; password: string }
  | { result: "failed" }
  | { result: "transient" }
  | { result: "score"; guess: number; score: number };

type KingOfTheHillPhase = "coarse" | "final" | "polish" | "done";

type CenterEstimate = {
  center: number;
  score: number;
};

type CenterCluster = {
  center: number;
  support: number;
  weight: number;
};

export class KingOfTheHillCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat !== "numeric") {
      return { result: "failed" };
    }

    const solver = new KingOfTheHillSolver(this.info.targetPasswordLength);

    for (;;) {
      const guesses = solver.nextBatch();

      if (guesses.length === 0) {
        break;
      }

      for (const guess of guesses) {
        const probeRes = await this.probeGuess(guess);

        if (probeRes.result === "ok") {
          return { result: "ok", password: probeRes.password };
        }

        if (probeRes.result === "failed" || probeRes.result === "transient") {
          return { result: probeRes.result };
        }

        solver.giveFeedback(probeRes.guess, probeRes.score);
      }
    }

    return { result: "failed" };
  }

  private async probeGuess(guess: number): Promise<ProbeResult> {
    const password = guess.toString();
    const result = await this.authenticate(password);

    if (result === "ok") {
      return { result: "ok", password };
    }

    if (result === "transient") {
      this.ns.print(`KingOfTheHill transient: authenticate returned transient for ${password}`);
      return { result: "transient" };
    }

    const score = await this.readScoreForPassword(password);

    if (score === undefined) {
      this.ns.print(`KingOfTheHill transient: could not read score for password ${password}`);
      return { result: "transient" };
    }

    return { result: "score", guess, score };
  }

  private async readScoreForPassword(password: string): Promise<number | undefined> {
    const info = await this.getAuthenticateResultLog(password);

    if (info.result === "transient") {
      this.ns.print(`KingOfTheHill heartbleed/log read failed for ${this.info.targetIp}`);
      return undefined;
    }

    if (info.result !== "ok" || !info.log) {
      this.ns.print(`KingOfTheHill could not match log for password ${password}`);
      return undefined;
    }

    const score = this.parseScore(info.log);

    if (score === undefined) {
      this.ns.print(
        `KingOfTheHill matched password ${password}, but log did not contain a numeric altitude score`,
      );

      return undefined;
    }

    return score;
  }

  private parseScore(log: PasswordAttemptLog): number | undefined {
    const data: unknown = log.data;

    if (typeof data === "number") {
      return Number.isFinite(data) ? data : undefined;
    }

    if (typeof data === "string") {
      const score = Number(data.trim());

      if (Number.isFinite(score)) {
        return score;
      }
    }

    if (log.message !== undefined) {
      return this.parseScoreFromMessage(log.message);
    }

    return undefined;
  }

  private parseScoreFromMessage(message: string): number | undefined {
    const prefix = "current altitude:";
    const start = message.toLowerCase().indexOf(prefix);

    if (start < 0) {
      return undefined;
    }

    const rest = message.slice(start + prefix.length).trim();
    const token = this.readLeadingNumberToken(rest);

    if (token === undefined) {
      return undefined;
    }

    const score = Number(token);

    return Number.isFinite(score) ? score : undefined;
  }

  private readLeadingNumberToken(value: string): string | undefined {
    let end = 0;

    while (end < value.length && this.isNumberCharacter(value[end])) {
      end++;
    }

    if (end === 0) {
      return undefined;
    }

    const token = value.slice(0, end);

    return this.hasDigit(token) ? token : undefined;
  }

  private hasDigit(value: string): boolean {
    for (const char of value) {
      if (char >= "0" && char <= "9") {
        return true;
      }
    }

    return false;
  }

  private isNumberCharacter(value: string): boolean {
    return (
      value === "-" ||
      value === "+" ||
      value === "." ||
      value === "e" ||
      value === "E" ||
      (value >= "0" && value <= "9")
    );
  }
}

export class KingOfTheHillSolver {
  private static readonly PeakHeight = 10_000;

  private readonly min: number;
  private readonly max: number;
  private readonly width: number;

  private readonly tried = new Set<number>();
  private readonly scores = new Map<number, number>();

  private phase: KingOfTheHillPhase = "coarse";

  constructor(length: number) {
    if (!Number.isInteger(length) || length < 1 || length > 10) {
      throw new Error(`KingOfTheHillSolver length must be an integer from 1 to 10. Received: ${length}`);
    }

    this.min = length === 1 ? 0 : 10 ** (length - 1);
    this.max = 10 ** length - 1;

    this.width = 10 ** Math.max(length - 2, 0) + 1;
  }

  public nextBatch(): number[] {
    if (this.phase === "coarse") {
      this.phase = "final";
      return this.takeUntried(this.buildCoarseGuesses());
    }

    if (this.phase === "final") {
      this.phase = "polish";
      return this.takeUntried(this.buildFinalCandidates());
    }

    if (this.phase === "polish") {
      this.phase = "done";
      return this.takeUntried(this.buildPolishCandidates());
    }

    return [];
  }

  public giveFeedback(guess: number, score: number): void {
    if (!Number.isInteger(guess) || !this.isInRange(guess)) {
      throw new Error(`Invalid KingOfTheHill guess: ${guess}`);
    }

    // Negative altitude is valid. Do not reject score < 0.
    if (!Number.isFinite(score)) {
      throw new Error(`Invalid KingOfTheHill score for guess ${guess}: ${score}`);
    }

    this.scores.set(guess, score);
  }

  private buildCoarseGuesses(): number[] {
    if (this.max - this.min <= 100) {
      const guesses: number[] = [];

      for (let guess = this.min; guess <= this.max; guess++) {
        guesses.push(guess);
      }

      return guesses;
    }

    const guesses: number[] = [this.min, this.max];

    const ratio = 1.055;
    let value = this.min;

    while (value <= this.max) {
      const guess = Math.round(value);
      guesses.push(guess);

      const next = value * ratio;
      value = Math.round(next) <= guess ? guess + 1 : next;
    }

    return this.uniqueInRange(guesses);
  }

  private buildFinalCandidates(): number[] {
    const estimates = this.estimateCenters();
    const clusters = this.clusterEstimates(estimates);
    const candidates: number[] = [];

    for (const cluster of clusters) {
      this.addAround(candidates, cluster.center, 2);
    }

    for (const sample of this.samples().sort((a, b) => b.score - a.score).slice(0, 8)) {
      this.addAround(candidates, sample.guess, 8);
    }

    return this.uniqueInRange(candidates);
  }

  private buildPolishCandidates(): number[] {
    const best = this.bestSample();

    if (!best) {
      return [];
    }

    const candidates: number[] = [];
    this.addAround(candidates, best.guess, 64);

    return this.uniqueInRange(candidates);
  }

  private estimateCenters(): CenterEstimate[] {
    const estimates: CenterEstimate[] = [];

    for (const sample of this.samples()) {
      if (sample.score <= 0 || sample.score >= KingOfTheHillSolver.PeakHeight) {
        continue;
      }

      const ratio = sample.score / KingOfTheHillSolver.PeakHeight;
      const distance = this.width * Math.sqrt(-Math.log(ratio));

      if (!Number.isFinite(distance)) {
        continue;
      }

      estimates.push({ center: sample.guess - distance, score: sample.score });
      estimates.push({ center: sample.guess + distance, score: sample.score });
    }

    return estimates
      .filter(estimate => this.isInRange(Math.round(estimate.center)))
      .sort((a, b) => b.score - a.score);
  }

  private clusterEstimates(estimates: CenterEstimate[]): CenterCluster[] {
    const binSize = this.width < 1_000 ? 1 : 16;
    const clusters = new Map<number, { weightedSum: number; weight: number; support: number }>();

    for (const estimate of estimates) {
      const key = Math.round(estimate.center / binSize);
      const weight = Math.max(1, Math.log1p(Math.max(0, estimate.score)));
      const existing = clusters.get(key) ?? { weightedSum: 0, weight: 0, support: 0 };

      existing.weightedSum += estimate.center * weight;
      existing.weight += weight;
      existing.support++;

      clusters.set(key, existing);
    }

    return [...clusters.values()]
      .map(cluster => ({
        center: cluster.weightedSum / cluster.weight,
        support: cluster.support,
        weight: cluster.weight,
      }))
      .sort((a, b) => {
        const supportDiff = b.support - a.support;
        return supportDiff !== 0 ? supportDiff : b.weight - a.weight;
      });
  }

  private bestSample(): ScoredGuess | null {
    let best: ScoredGuess | null = null;

    for (const sample of this.samples()) {
      if (!best || sample.score > best.score) {
        best = sample;
      }
    }

    return best;
  }

  private samples(): ScoredGuess[] {
    const result: ScoredGuess[] = [];

    for (const [guess, score] of this.scores) {
      result.push({ guess, score });
    }

    return result;
  }

  private addAround(candidates: number[], rawCenter: number, radius: number): void {
    const center = Math.round(rawCenter);

    candidates.push(center);

    for (let offset = 1; offset <= radius; offset++) {
      candidates.push(center - offset);
      candidates.push(center + offset);
    }
  }

  private takeUntried(guesses: number[]): number[] {
    const result: number[] = [];

    for (const guess of this.uniqueInRange(guesses)) {
      if (this.tried.has(guess)) {
        continue;
      }

      this.tried.add(guess);
      result.push(guess);
    }

    return result;
  }

  private uniqueInRange(guesses: number[]): number[] {
    const seen = new Set<number>();
    const result: number[] = [];

    for (const rawGuess of guesses) {
      const guess = Math.round(rawGuess);

      if (!this.isInRange(guess) || seen.has(guess)) {
        continue;
      }

      seen.add(guess);
      result.push(guess);
    }

    return result;
  }

  private isInRange(guess: number): boolean {
    return Number.isInteger(guess) && guess >= this.min && guess <= this.max;
  }
}
