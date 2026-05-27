import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class OctantVoxelCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat !== "numeric") {
      return { result: "failed" };
    }

    const parts = this.info.targetPasswordData.split(",");
    if (parts.length !== 2) {
      return { result: "failed" };
    }

    const base = Number(parts[0].trim());
    const encodedValue = parts[1].trim();

    const password = this.convertToBase10String(encodedValue, base);

    // Important: "0" is a valid password, so do not use `if (password)`
    if (password !== undefined) {
      const result = await this.authenticate(password);
      if (result === "transient") return { result: "transient" };

      if (result === "ok") {
        return { result: "ok", password };
      }
    }

    return { result: "failed" };
  }

  private convertToBase10String(value: string, base: number): string | undefined {
    if (!Number.isFinite(base) || base < 2 || base > 36) {
      return undefined;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    let sign = 1;
    let start = 0;

    if (trimmed[0] === "-") {
      sign = -1;
      start = 1;
    } else if (trimmed[0] === "+") {
      start = 1;
    }

    if (start >= trimmed.length) {
      return undefined;
    }

    const unsignedValue = trimmed.slice(start);
    const split = unsignedValue.split(".");

    if (split.length > 2) {
      return undefined;
    }

    const integerPart = split[0] ?? "";
    const fractionalPart = split[1] ?? "";

    if (integerPart.length === 0 && fractionalPart.length === 0) {
      return undefined;
    }

    let result = 0;

    for (let i = 0; i < integerPart.length; i++) {
      const digit = this.getDigitValue(integerPart[i]);

      if (digit === undefined || digit >= base) {
        return undefined;
      }

      result = result * base + digit;
    }

    let placeValue = 1 / base;

    for (let i = 0; i < fractionalPart.length; i++) {
      const digit = this.getDigitValue(fractionalPart[i]);

      if (digit === undefined || digit >= base) {
        return undefined;
      }

      result += digit * placeValue;
      placeValue /= base;
    }

    result *= sign;

    if (!Number.isFinite(result)) {
      return undefined;
    }

    return this.formatPasswordNumber(result);
  }

  private formatPasswordNumber(value: number): string {
    if (Object.is(value, -0)) {
      return "0";
    }

    const rounded = Math.round(value);
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 16;

    if (Math.abs(value - rounded) <= tolerance) {
      return rounded.toString();
    }

    return value.toString();
  }

  private getDigitValue(char: string): number | undefined {
    const code = char.toUpperCase().charCodeAt(0);

    // 0-9
    if (code >= 48 && code <= 57) {
      return code - 48;
    }

    // A-Z
    if (code >= 65 && code <= 90) {
      return code - 65 + 10;
    }

    return undefined;
  }
}
