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

type UnknownRecord = Record<string, unknown>;

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
    let congruence: Congruence = { remainder: 0n, modulus: 1n };

    // Pairwise-coprime prime powers whose product is lcm(1..32).
    // For probers above max password, password % prober === password,
    // so feedback becomes password % modulus.
    const moduli = [32n, 27n, 25n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n];

    for (const modulus of moduli) {
      const prober = this.firstproberAboveWithModulo(max, modulus);
      const trysolve = await this.tryPasswordAndReadModulo(prober.toString());

      if (trysolve.kind === "transient") {
        return { result: "transient" };
      }

      if (trysolve.kind === "success") {
        return { result: "ok", password: trysolve.password };
      }

      if (trysolve.kind !== "modulo" || trysolve.value < 0n || trysolve.value >= modulus) {
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

    let candidates = this.candidatesInRange(congruence, min, max, 32);

    if (candidates.length > 1) {
      const prober = this.findDisambiguatingprober(candidates);

      if (prober !== undefined) {
        const trysolve = await this.tryPasswordAndReadModulo(prober.toString());

        if (trysolve.kind === "transient") {
          return { result: "transient" };
        }

        if (trysolve.kind === "success") {
          return { result: "ok", password: trysolve.password };
        }

        if (trysolve.kind === "modulo") {
          candidates = candidates.filter(candidate =>
            this.tripleModuloResult(candidate, prober) === trysolve.value
          );
        }
      }
    }

    for (const candidate of candidates) {
      const result = await this.tryExactPassword(candidate.toString());
      if (result.result === "ok" || result.result === "transient") {
        return result;
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private async tryExactPassword(password: string): Promise<CodebreakerResult> {
    const result = await this.authenticate(password);
    if (result === null) return { result: "transient" };
    if (result.success) return { result: "ok", password };

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

    // Some wrappers expose the password response directly. Use it if present.
    const direct = this.parseModuloFeedback(result, password, false);
    if (direct !== undefined) {
      return { kind: "modulo", value: direct };
    }

    const bleed = await this.ns.dnet.heartbleed(this.info.targetIp, {
      logsToCapture: 5,
    });

    if (!bleed.success) {
      return { kind: "unknown" };
    }

    // Bitburner stores newest logs first. Require the log to belong to the exact
    // password/prober just attempted, so stale auth logs cannot corrupt CRT state.
    for (let i = 0; i < bleed.logs.length; i++) {
      const feedback = this.parseModuloFeedback(bleed.logs[i], password, true);
      if (feedback !== undefined) {
        return { kind: "modulo", value: feedback };
      }
    }

    return { kind: "unknown" };
  }

  private parseModuloFeedback(
    value: unknown,
    attemptedPassword: string,
    requireAttemptMatch: boolean,
  ): bigint | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === "object") {
      const record = value as UnknownRecord;

      const fromRecord = this.parseModuloFeedbackRecord(record, attemptedPassword, requireAttemptMatch);
      if (fromRecord !== undefined) {
        return fromRecord;
      }

      const fromResponse = this.parseModuloFeedback(record.response, attemptedPassword, requireAttemptMatch);
      if (fromResponse !== undefined) {
        return fromResponse;
      }

      const fromMessage = this.parseModuloFeedback(record.message, attemptedPassword, requireAttemptMatch);
      if (fromMessage !== undefined) {
        return fromMessage;
      }

      const fromResult = this.parseModuloFeedback(record.result, attemptedPassword, requireAttemptMatch);
      if (fromResult !== undefined) {
        return fromResult;
      }
    }

    if (typeof value === "string") {
      return this.parseModuloFeedbackString(value, attemptedPassword, requireAttemptMatch);
    }

    return undefined;
  }

  private parseModuloFeedbackRecord(
    record: UnknownRecord,
    attemptedPassword: string,
    requireAttemptMatch: boolean,
  ): bigint | undefined {
    const passwordAttempted = this.stringValue(record.passwordAttempted);

    if (requireAttemptMatch && passwordAttempted !== attemptedPassword) {
      return undefined;
    }

    if (passwordAttempted !== undefined || !requireAttemptMatch) {
      const dataValue = this.parseInteger(record.data);
      if (dataValue !== undefined) {
        return dataValue;
      }

      const messageValue = this.stringValue(record.message);
      if (messageValue !== undefined) {
        return this.parseModuloMessage(messageValue, attemptedPassword, requireAttemptMatch);
      }
    }

    return undefined;
  }

  private parseModuloFeedbackString(
    value: string,
    attemptedPassword: string,
    requireAttemptMatch: boolean,
  ): bigint | undefined {
    const parsed = this.tryParseJson(value);
    if (parsed !== undefined) {
      const fromParsed = this.parseModuloFeedback(parsed, attemptedPassword, requireAttemptMatch);
      if (fromParsed !== undefined) {
        return fromParsed;
      }
    }

    const normalized = value.replaceAll('\\"', '"');

    if (requireAttemptMatch && !this.stringContainsAttempt(normalized, attemptedPassword)) {
      return undefined;
    }

    const dataMatch = normalized.match(/["']?data["']?\s*[:=]\s*["']?(-?\d+)["']?/i);
    if (dataMatch) {
      return BigInt(dataMatch[1]);
    }

    return this.parseModuloMessage(normalized, attemptedPassword, requireAttemptMatch);
  }

  private parseModuloMessage(
    value: string,
    attemptedPassword: string,
    requireAttemptMatch: boolean,
  ): bigint | undefined {
    const escapedAttempt = this.escapeRegex(attemptedPassword);

    const match = value.match(
      new RegExp(
        String.raw`\(\s*Password\s*%\s*${escapedAttempt}\s*\)\s*%\s*(?:32|\(\s*${escapedAttempt}\s*%\s*32\s*\))\s*=\s*(-?\d+)`,
        "i",
      ),
    );

    if (match) {
      return BigInt(match[1]);
    }

    if (!requireAttemptMatch) {
      const looseMatch = value.match(/["']?data["']?\s*[:=]\s*["']?(-?\d+)["']?/i);
      if (looseMatch) {
        return BigInt(looseMatch[1]);
      }
    }

    return undefined;
  }

  private stringContainsAttempt(value: string, attemptedPassword: string): boolean {
    const escapedAttempt = this.escapeRegex(attemptedPassword);

    return (
      new RegExp(String.raw`["']?passwordAttempted["']?\s*[:=]\s*["']${escapedAttempt}["']`, "i").test(value) ||
      new RegExp(String.raw`\(\s*Password\s*%\s*${escapedAttempt}\s*\)`, "i").test(value)
    );
  }

  private tryParseJson(value: string): unknown {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }

  private parseInteger(value: unknown): bigint | undefined {
    if (typeof value === "bigint") {
      return value;
    }

    if (typeof value === "number" && Number.isInteger(value)) {
      return BigInt(value);
    }

    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      return undefined;
    }

    return BigInt(trimmed);
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  private passwordRange(length: number): { min: bigint; max: bigint } | undefined {
    if (!Number.isInteger(length) || length <= 0 || length > 15) {
      return undefined;
    }

    const digits = BigInt(length);
    const min = length === 1 ? 0n : 10n ** (digits - 1n);
    const max = 10n ** digits - 1n;

    return { min, max };
  }

  private firstproberAboveWithModulo(maxPassword: bigint, desiredModulo: bigint): bigint {
    const desiredResidue = desiredModulo === 32n ? 0n : desiredModulo;
    const firstAboveMax = maxPassword + 1n;
    const delta = this.mod(desiredResidue - (firstAboveMax % 32n), 32n);

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
    const candidates = this.candidatesInRange(congruence, min, max, 2);
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  private candidatesInRange(congruence: Congruence, min: bigint, max: bigint, limit: number): bigint[] {
    const candidates: bigint[] = [];

    let candidate = congruence.remainder;
    if (candidate < min) {
      candidate += this.ceilDiv(min - candidate, congruence.modulus) * congruence.modulus;
    }

    while (candidate <= max && candidates.length < limit) {
      candidates.push(candidate);
      candidate += congruence.modulus;
    }

    return candidates;
  }

  private findDisambiguatingprober(candidates: bigint[]): bigint | undefined {
    const seen = new Set<string>();

    const tryprober = (prober: bigint): bigint | undefined => {
      if (prober <= 1n || candidates.includes(prober)) {
        return undefined;
      }

      const key = prober.toString();
      if (seen.has(key)) {
        return undefined;
      }

      seen.add(key);

      const results = new Set(
        candidates.map(candidate => this.tripleModuloResult(candidate, prober).toString())
      );

      return results.size === candidates.length ? prober : undefined;
    };

    for (let i = 0; i < candidates.length - 1; i++) {
      const midpoint = (candidates[i] + candidates[i + 1]) / 2n;

      for (let delta = -256; delta <= 256; delta++) {
        const prober = tryprober(midpoint + BigInt(delta));
        if (prober !== undefined) {
          return prober;
        }
      }
    }

    const spacing = candidates.length > 1 ? candidates[1] - candidates[0] : 0n;
    for (let multiple = 1n; multiple <= 10n; multiple++) {
      const base = spacing * multiple;

      for (let delta = -256; delta <= 256; delta++) {
        const prober = tryprober(base + BigInt(delta));
        if (prober !== undefined) {
          return prober;
        }
      }
    }

    const maxCandidate = candidates[candidates.length - 1];
    for (let divisor = 2n; divisor <= 512n; divisor++) {
      const base = maxCandidate / divisor;

      for (let delta = -32; delta <= 32; delta++) {
        const prober = tryprober(base + BigInt(delta));
        if (prober !== undefined) {
          return prober;
        }
      }
    }

    return undefined;
  }

  private tripleModuloResult(password: bigint, input: bigint): bigint {
    const modulus = ((input - 1n) % 32n) + 1n;
    return (password % input) % modulus;
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

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
