import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

type TripleModuloTrySolveResult =
  | { kind: "success"; password: string }
  | { kind: "modulo"; value: bigint }
  | { kind: "transient" }
  | { kind: "unknown" };

type Congruence = {
  remainder: bigint;
  modulus: bigint;
};

type BigMoodAttemptLog = {
  passwordAttempted: string;
  data: string;
};

export class BigMoodCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat !== "numeric" || this.info.targetPasswordLength <= 0) {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const range = this.passwordRange(this.info.targetPasswordLength);
    if (range === undefined) {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const { min, max } = range;

    // Pairwise-coprime factors whose product quickly exceeds any generated
    // BigMo%od numeric password range. Each probe is chosen above max, so:
    //
    //   password % probe === password
    //
    // and the feedback gives:
    //
    //   password % modulus
    //
    const moduli = [32n, 27n, 25n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n];

    let congruence: Congruence = {
      remainder: 0n,
      modulus: 1n,
    };

    for (const modulus of moduli) {
      const prober = this.firstProberAboveMaxWithModulo(max, modulus);
      const password = prober.toString();

      const trysolve = await this.tryPasswordAndReadModulo(password);

      if (trysolve.kind === "transient") {
        return { result: "transient" };
      }

      if (trysolve.kind === "unknown") {
        // Missing this datapoint means we cannot safely update CRT state.
        return { result: "transient" };
      }

      if (trysolve.kind === "success") {
        return { result: "ok", password: trysolve.password };
      }

      if (trysolve.value < 0n || trysolve.value >= modulus) {
        this.printCoreInfo();
        return { result: "impossible" };
      }

      const combined = this.combineCongruences(congruence, {
        remainder: trysolve.value,
        modulus,
      });

      if (combined === undefined) {
        this.printCoreInfo();
        return { result: "impossible" };
      }

      congruence = combined;

      const candidate = this.singleCandidateInRange(congruence, min, max);
      if (candidate !== undefined) {
        return await this.tryExactPassword(candidate.toString());
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private async tryExactPassword(password: string): Promise<CodebreakerResult> {
    const result = await this.authenticate(password);

    if (result === null) return { result: "transient" };
    if (result.success) return { result: "ok", password };

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private async tryPasswordAndReadModulo(password: string): Promise<TripleModuloTrySolveResult> {
    const result = await this.authenticate(password);

    if (result === null) {
      return { kind: "transient" };
    }

    if (result.success) {
      return { kind: "success", password };
    }

    const feedback = await this.readModuloForPassword(password);

    if (feedback === undefined) {
      return { kind: "unknown" };
    }

    return { kind: "modulo", value: feedback };
  }

  private async readModuloForPassword(password: string): Promise<bigint | undefined> {
    const info = await this.ns.dnet.heartbleed(this.info.targetIp, {
      logsToCapture: 50,
      peek: true,
    });

    if (!info.success) {
      return undefined;
    }

    // Auth logs are newest-first. Ignore non-auth noise, but only trust the
    // first real PasswordResponse. If it is not for the exact prober we just
    // attempted, another attempt raced us or we are seeing stale state.
    for (const log of info.logs) {
      const parsed = this.parseAttemptLog(log);

      if (parsed === undefined) {
        continue;
      }

      if (parsed.passwordAttempted !== password) {
        return undefined;
      }

      return this.parseInteger(parsed.data);
    }

    return undefined;
  }

  private parseAttemptLog(log: string): BigMoodAttemptLog | undefined {
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

  private passwordRange(length: number): { min: bigint; max: bigint } | undefined {
    if (!Number.isInteger(length) || length <= 0 || length > 15) {
      return undefined;
    }

    const digits = BigInt(length);

    return {
      min: length === 1 ? 0n : 10n ** (digits - 1n),
      max: 10n ** digits - 1n,
    };
  }

  private firstProberAboveMaxWithModulo(maxPassword: bigint, desiredModulo: bigint): bigint {
    if (desiredModulo < 1n || desiredModulo > 32n) {
      throw new Error(`Invalid BigMo%od modulo target: ${desiredModulo}`);
    }

    // Source uses (((input - 1) % 32) + 1), so modulo 32 requires input % 32 == 0.
    const desiredInputResidue = desiredModulo === 32n ? 0n : desiredModulo;
    const firstAboveMax = maxPassword + 1n;
    const delta = this.mod(desiredInputResidue - (firstAboveMax % 32n), 32n);

    return firstAboveMax + delta;
  }

  private combineCongruences(left: Congruence, right: Congruence): Congruence | undefined {
    const gcd = this.gcd(left.modulus, right.modulus);
    const delta = right.remainder - left.remainder;

    if (delta % gcd !== 0n) {
      return undefined;
    }

    const leftModulus = left.modulus / gcd;
    const rightModulus = right.modulus / gcd;
    const inverse = this.modInverse(leftModulus, rightModulus);

    if (inverse === undefined) {
      return undefined;
    }

    const scale = this.mod((delta / gcd) * inverse, rightModulus);
    const modulus = left.modulus * rightModulus;
    const remainder = this.mod(left.remainder + left.modulus * scale, modulus);

    return { remainder, modulus };
  }

  private singleCandidateInRange(congruence: Congruence, min: bigint, max: bigint): bigint | undefined {
    let candidate = congruence.remainder;

    if (candidate < min) {
      candidate += this.ceilDiv(min - candidate, congruence.modulus) * congruence.modulus;
    }

    if (candidate > max) {
      return undefined;
    }

    const nextCandidate = candidate + congruence.modulus;
    return nextCandidate > max ? candidate : undefined;
  }

  private parseInteger(value: string): bigint | undefined {
    const trimmed = value.trim();

    if (!/^-?\d+$/.test(trimmed)) {
      return undefined;
    }

    return BigInt(trimmed);
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

  private gcd(a: bigint, b: bigint): bigint {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;

    while (y !== 0n) {
      const next = x % y;
      x = y;
      y = next;
    }

    return x;
  }

  private modInverse(value: bigint, modulus: bigint): bigint | undefined {
    let oldR = value;
    let r = modulus;
    let oldS = 1n;
    let s = 0n;

    while (r !== 0n) {
      const quotient = oldR / r;

      const nextR = oldR - quotient * r;
      oldR = r;
      r = nextR;

      const nextS = oldS - quotient * s;
      oldS = s;
      s = nextS;
    }

    if (oldR !== 1n) {
      return undefined;
    }

    return this.mod(oldS, modulus);
  }

  private ceilDiv(numerator: bigint, denominator: bigint): bigint {
    return (numerator + denominator - 1n) / denominator;
  }

  private mod(value: bigint, modulus: bigint): bigint {
    const result = value % modulus;
    return result < 0n ? result + modulus : result;
  }
}
