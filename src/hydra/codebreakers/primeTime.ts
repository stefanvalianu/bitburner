import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class PrimeTimeCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat === "numeric") {
      const password = this.largestPrimeFactorPassword(this.info.targetPasswordData);
      if (password === undefined) {
        return { result: "impossible" };
      }

      const result = await this.authenticate(password);
      if (result === "transient") return { result: "transient" };
      if (result === "ok") {
        return { result: "ok", password };
      }
    }

    return { result: "impossible" };
  }

  private largestPrimeFactorPassword(data: string): string | undefined {
    const target = this.parsePositiveInteger(data);
    if (target === undefined || target < 2n) {
      return undefined;
    }

    // Source-aware fast path:
    // PrimeTime 2 target numbers are built from one of these large primes
    // multiplied by several small primes. Try the largest possible answers first.
    for (const prime of PrimeTimeCodebreaker.sourceLargePrimesDesc) {
      const p = BigInt(prime);
      if (target % p === 0n) {
        return p.toString();
      }
    }

    // Defensive fallback in case the source changes later.
    return this.largestPrimeFactor(target).toString();
  }

  private parsePositiveInteger(data: string): bigint | undefined {
    const value = data.trim();
    if (!/^\d+$/.test(value)) {
      return undefined;
    }

    return BigInt(value);
  }

  private largestPrimeFactor(value: bigint): bigint {
    let remaining = value;
    let largest = 1n;

    while (remaining % 2n === 0n) {
      largest = 2n;
      remaining /= 2n;
    }

    for (let factor = 3n; factor * factor <= remaining; factor += 2n) {
      while (remaining % factor === 0n) {
        largest = factor;
        remaining /= factor;
      }
    }

    if (remaining > 1n) {
      largest = remaining;
    }

    return largest;
  }

  private static readonly sourceLargePrimesDesc = [
    9859, 9749, 9739, 9601, 9551, 9467, 9343, 9199, 9103, 8963,
    8839, 8761, 8677, 8599, 8329, 8221, 8081, 8053, 7867, 7753,
    7691, 7573, 7559, 7549, 7103, 6841, 6719, 6661, 6547, 6469,
    6451, 6389, 6133, 6089, 6007, 5881, 5779, 5647, 5527, 5519,
    5441, 5419, 5417, 5393, 4957, 4951, 4943, 4877, 4789, 4729,
    4547, 4289, 4217, 3881, 3761, 3571, 3389, 3169, 2939, 2909,
    2837, 2819, 2801, 2753, 2741, 2693, 2539, 2503, 2371, 2207,
    2063, 1999, 1979, 1889, 1801, 1747, 1697, 1601, 1597, 1567,
    1471, 1409, 1069,
  ];
}