import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

type KingOfTheHillAttemptLog = {
  passwordAttempted: string;
  data: string;
};

type KingOfTheHillPhase = "coarse" | "probe" | "final" | "zoom" | "done";

type ScoredGuess = {
  guess: number;
  score: number;
};

export class KingOfTheHillCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat !== "numeric") {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const solver = new KingOfTheHillSolver(this.info.targetPasswordLength);

    for (let attempts = 0; attempts < solver.maxAttempts; attempts++) {
      const guess = solver.nextGuess();

      if (guess === null) {
        break;
      }

      const password = guess.toString();
      const result = await this.authenticate(password);

      if (result === null) return { result: "transient" };
      if (result.success) return { result: "ok", password };

      const score = await this.readScoreForPassword(password);

      if (score === undefined) {
        // Do not continue. Missing the current datapoint would corrupt the hill model.
        return { result: "transient" };
      }

      solver.giveFeedback(guess, score);
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private async readScoreForPassword(password: string): Promise<number | undefined> {
    const info = await this.ns.dnet.heartbleed(this.info.targetIp, {
      logsToCapture: 50,
      peek: true,
    });

    if (!info.success) {
      return undefined;
    }

    // Important: auth logs are newest-first. Ignore noise, but only trust the
    // first actual PasswordResponse. If it is not for our exact attempted
    // password, another auth attempt beat us or we are looking at stale data.
    for (const log of info.logs) {
      const parsed = this.parseAttemptLog(log);

      if (parsed === undefined) {
        continue;
      }

      if (parsed.passwordAttempted !== password) {
        return undefined;
      }

      const score = Number(parsed.data);
      return Number.isFinite(score) ? score : undefined;
    }

    return undefined;
  }

  private parseAttemptLog(log: string): KingOfTheHillAttemptLog | undefined {
    const parsed = this.tryParseJson(log);
    const candidates: unknown[] = [parsed];

    if (this.isRecord(parsed)) {
      const message = parsed.message;

      if (typeof message === "string") {
        candidates.push(this.tryParseJson(message));
      } else if (message !== undefined) {
        candidates.push(message);
      }
    }

    for (const candidate of candidates) {
      if (!this.isRecord(candidate)) continue;

      const passwordAttempted = candidate.passwordAttempted;
      const data = candidate.data;

      if (typeof passwordAttempted !== "string") continue;
      if (typeof data !== "string") continue;
      if (data.length === 0) continue;

      return { passwordAttempted, data };
    }

    return undefined;
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}

export class KingOfTheHillSolver {
  private readonly min: number;
  private readonly max: number;
  private readonly width: number;
  private readonly coarseStep: number;

  private readonly tried = new Set<number>();
  private readonly scores = new Map<number, number>();

  private phase: KingOfTheHillPhase = "coarse";
  private queue: number[] = [];
  private queueIndex = 0;
  private zoomStep = 0;

  constructor(length: number) {
    if (!Number.isInteger(length) || length < 1 || length > 10) {
      throw new Error(`KingOfTheHillSolver length must be an integer from 1 to 10. Received: ${length}`);
    }

    this.min = length === 1 ? 0 : 10 ** (length - 1);
    this.max = 10 ** length - 1;

    // Matches Bitburner's getKingOfTheHillAltitude width formula.
    this.width = 10 ** Math.max(length - 2, 0) + 1;

    // A half-width grid gives at least one sample close to the true peak.
    this.coarseStep = Math.max(1, Math.floor(this.width / 2));

    this.setQueue(this.buildCoarseGuesses());
  }

  public get maxAttempts(): number {
    return 2_000;
  }

  public nextGuess(): number | null {
    for (;;) {
      const guess = this.dequeueGuess();

      if (guess !== null) {
        return guess;
      }

      if (this.phase === "coarse") {
        this.phase = "probe";
        this.setQueue(this.buildProbeGuesses());
        continue;
      }

      if (this.phase === "probe") {
        this.phase = "final";
        this.setQueue(this.buildFinalCandidates());
        continue;
      }

      if (this.phase === "final") {
        this.phase = "zoom";
        this.zoomStep = Math.max(1, Math.floor(this.width / 20));
        this.setQueue(this.buildZoomGuesses());
        continue;
      }

      if (this.phase === "zoom") {
        if (this.zoomStep <= 1) {
          this.phase = "done";
          continue;
        }

        this.zoomStep = Math.max(1, Math.floor(this.zoomStep / 5));
        this.setQueue(this.buildZoomGuesses());
        continue;
      }

      return null;
    }
  }

  public giveFeedback(guess: number, score: number): void {
    if (!Number.isInteger(guess) || !this.isInRange(guess)) {
      throw new Error(`Invalid KingOfTheHill guess: ${guess}`);
    }

    if (!Number.isFinite(score) || score < 0) {
      throw new Error(`Invalid KingOfTheHill score for guess ${guess}: ${score}`);
    }

    this.tried.add(guess);
    this.scores.set(guess, score);
  }

  private buildCoarseGuesses(): number[] {
    const guesses: number[] = [];

    for (let guess = this.min; guess <= this.max; guess += this.coarseStep) {
      guesses.push(guess);
    }

    if (guesses.length === 0 || guesses[guesses.length - 1] !== this.max) {
      guesses.push(this.max);
    }

    return guesses;
  }

  private buildProbeGuesses(): number[] {
    const best = this.bestSample();
    if (!best) return [];

    const delta = Math.max(1, Math.floor(this.width / 32));

    return this.uniqueInRange([
      best.guess - delta,
      best.guess + delta,
      best.guess - 2 * delta,
      best.guess + 2 * delta,
      best.guess - 4 * delta,
      best.guess + 4 * delta,
      best.guess - 8 * delta,
      best.guess + 8 * delta,
    ]);
  }

  private buildFinalCandidates(): number[] {
    const candidates: number[] = [];
    const best = this.bestSample();

    if (!best) {
      return [];
    }

    const localSamples = this.samples()
      .filter(sample =>
        sample.score > 0 &&
        Math.abs(sample.guess - best.guess) <= this.width * 2,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const addAround = (center: number, radius: number): void => {
      const rounded = Math.round(center);

      candidates.push(rounded);

      for (let offset = 1; offset <= radius; offset++) {
        candidates.push(rounded - offset);
        candidates.push(rounded + offset);
      }
    };

    for (const sample of localSamples) {
      for (const estimate of this.estimateCentersFromSingleSample(sample)) {
        addAround(estimate, 8);
      }
    }

    for (let i = 0; i < localSamples.length; i++) {
      for (let j = i + 1; j < localSamples.length; j++) {
        const estimate = this.estimateCenterFromPair(localSamples[i], localSamples[j]);

        if (estimate !== null) {
          addAround(estimate, 8);
        }
      }
    }

    addAround(best.guess, 25);

    return this.uniqueInRange(candidates);
  }

  private buildZoomGuesses(): number[] {
    const best = this.bestSample();
    if (!best) return [];

    const guesses: number[] = [];

    for (let offset = 0; offset <= this.zoomStep * 10; offset += this.zoomStep) {
      guesses.push(best.guess - offset);
      guesses.push(best.guess + offset);
    }

    return this.uniqueInRange(guesses);
  }

  private estimateCenterFromPair(a: ScoredGuess, b: ScoredGuess): number | null {
    if (a.guess === b.guess || a.score <= 0 || b.score <= 0) {
      return null;
    }

    // Main-hill model:
    // score = 10000 * exp(-((x - password)^2 / width^2))
    const x1 = a.guess;
    const x2 = b.guess;
    const denominator = 2 * (x2 - x1);

    if (denominator === 0) {
      return null;
    }

    const widthSquared = this.width * this.width;
    const estimate = (x2 * x2 - x1 * x1 - widthSquared * Math.log(a.score / b.score)) / denominator;

    return Number.isFinite(estimate) ? estimate : null;
  }

  private estimateCentersFromSingleSample(sample: ScoredGuess): number[] {
    if (sample.score <= 0) {
      return [sample.guess];
    }

    const ratio = Math.max(0, Math.min(1, sample.score / 10_000));
    const distance = this.width * Math.sqrt(-Math.log(ratio));

    if (!Number.isFinite(distance)) {
      return [sample.guess];
    }

    const direction = this.estimateDirection(sample.guess);

    if (direction < 0) {
      return [sample.guess - distance, sample.guess + distance];
    }

    if (direction > 0) {
      return [sample.guess + distance, sample.guess - distance];
    }

    return [sample.guess - distance, sample.guess + distance];
  }

  private estimateDirection(center: number): -1 | 0 | 1 {
    let left: ScoredGuess | null = null;
    let right: ScoredGuess | null = null;

    for (const sample of this.samples()) {
      if (sample.guess < center && (!left || sample.guess > left.guess)) {
        left = sample;
      }

      if (sample.guess > center && (!right || sample.guess < right.guess)) {
        right = sample;
      }
    }

    if (!left || !right) return 0;
    if (left.score > right.score) return -1;
    if (right.score > left.score) return 1;

    return 0;
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
    const samples: ScoredGuess[] = [];

    for (const [guess, score] of this.scores) {
      samples.push({ guess, score });
    }

    return samples;
  }

  private setQueue(guesses: number[]): void {
    this.queue = this.uniqueInRange(guesses);
    this.queueIndex = 0;
  }

  private dequeueGuess(): number | null {
    while (this.queueIndex < this.queue.length) {
      const guess = this.queue[this.queueIndex++];

      if (!this.isInRange(guess) || this.tried.has(guess)) {
        continue;
      }

      this.tried.add(guess);
      return guess;
    }

    return null;
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
