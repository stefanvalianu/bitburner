import { NS } from "@ns";
import { Codebreaker, CodebreakerResult, PasswordAttemptLog } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class KingOfTheHillCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat !== "numeric") {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const solver = new KingOfTheHillSolver(this.info.targetPasswordLength);
    
    let passwordNum = solver.nextGuess();
    if (passwordNum === null) return { result: "impossible" };
    let password = passwordNum.toString();
    let result = await this.authenticate(password);

    let maxTries = 1_000_000;
    while (maxTries-- > 0) {
      if (result === null) return { result: "transient" };
      if (result.success) {
        return { result: "ok", password: password! };
      } else {
        const info = await this.ns.dnet.heartbleed(this.info.targetIp);

        if (info.success && info.logs.length > 0) {
          let logResult: PasswordAttemptLog | undefined;
          
          try {
            logResult = JSON.parse(info.logs[0]) as PasswordAttemptLog;
          } catch {}

          if (logResult && logResult.passwordAttempted && logResult.data) {
            const feedback = Number(logResult.data);
            solver.giveFeedback(Number(logResult.passwordAttempted), feedback);

            passwordNum = solver.nextGuess();
            if (passwordNum === null) return { result: "impossible" };
            password = passwordNum.toString();
            result = await this.authenticate(password!);
          }
          // we probably read some other crappy log, keep trying (stay in the loop)
        } 
        else {
          // some other hydra instance is competing with us for logs, let them get it
          return { result: "transient" };
        }
      }
    }

    if (maxTries === 0) {
      this.ns.tprint(`Ran out of tries solving kingOfTheHill`);
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }
}

type KingOfTheHillPhase = "coarse" | "probe" | "final" | "zoom" | "done";

type ScoredGuess = {
  guess: number;
  score: number;
};

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

    // Guarantees one coarse sample lands close enough to the real peak
    // to beat the lower side-hills.
    this.coarseStep = Math.max(1, Math.floor(this.width / 2));

    this.setQueue(this.buildCoarseGuesses());
  }

  nextGuess(): string | null {
    for (;;) {
      const guess = this.dequeueGuess();
      if (guess !== null) {
        return guess.toString();
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

        this.zoomStep = Math.max(1, Math.floor(this.zoomStep / 10));
        this.setQueue(this.buildZoomGuesses());
        continue;
      }

      return null;
    }
  }

  giveFeedback(guess: number, score: number): void {
    if (!Number.isInteger(guess) || !this.isInRange(guess)) {
      throw new Error(`Invalid KingOfTheHill guess: ${guess}`);
    }

    if (!Number.isFinite(score)) {
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
    if (!best) {
      return [];
    }

    const delta = Math.max(1, Math.floor(this.width / 32));

    return [
      best.guess - delta,
      best.guess + delta,
      best.guess - 2 * delta,
      best.guess + 2 * delta,
      best.guess - 4 * delta,
      best.guess + 4 * delta,
    ];
  }

  private buildFinalCandidates(): number[] {
    const candidates: number[] = [];
    const samples = this.topSamples(8);

    const addAround = (center: number, radius: number): void => {
      const rounded = Math.round(center);

      candidates.push(rounded);

      for (let offset = 1; offset <= radius; offset++) {
        candidates.push(rounded - offset);
        candidates.push(rounded + offset);
      }
    };

    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const estimate = this.estimateCenterFromPair(samples[i], samples[j]);
        if (estimate !== null) {
          addAround(estimate, 3);
        }
      }
    }

    const best = samples[0];
    if (best) {
      for (const estimate of this.estimateCentersFromSingleSample(best)) {
        addAround(estimate, 6);
      }

      addAround(best.guess, 20);
    }

    return this.uniqueInRange(candidates);
  }

  private buildZoomGuesses(): number[] {
    const best = this.bestSample();
    if (!best) {
      return [];
    }

    const guesses: number[] = [best.guess];

    for (let offset = this.zoomStep; offset <= this.zoomStep * 10; offset += this.zoomStep) {
      guesses.push(best.guess - offset);
      guesses.push(best.guess + offset);
    }

    return this.uniqueInRange(guesses);
  }

  private estimateCenterFromPair(a: ScoredGuess, b: ScoredGuess): number | null {
    if (a.guess === b.guess || a.score <= 0 || b.score <= 0) {
      return null;
    }

    // From:
    // score = 10000 * exp(-((x - password)^2 / width^2))
    //
    // Rearranged using two samples to solve for password.
    const x1 = a.guess;
    const x2 = b.guess;
    const widthSquared = this.width * this.width;
    const denominator = 2 * (x2 - x1);

    if (denominator === 0) {
      return null;
    }

    const estimate = (x2 * x2 - x1 * x1 - widthSquared * Math.log(a.score / b.score)) / denominator;

    if (!Number.isFinite(estimate)) {
      return null;
    }

    return estimate;
  }

  private estimateCentersFromSingleSample(sample: ScoredGuess): number[] {
    if (sample.score <= 0) {
      return [sample.guess];
    }

    const ratio = Math.min(1, sample.score / 10_000);
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

    if (!left || !right) {
      return 0;
    }

    if (left.score > right.score) {
      return -1;
    }

    if (right.score > left.score) {
      return 1;
    }

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

  private topSamples(count: number): ScoredGuess[] {
    return this.samples()
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
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
