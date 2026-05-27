import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class MathMlCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const password = this.evaluatePassword(this.info.targetPasswordData);
    if (password === undefined) {
      return { result: "impossible" };
    }

    const result = await this.authenticate(password);
    if (result === "transient") return { result: "transient" };
    if (result === "ok") {
      return { result: "ok", password };
    }

    return { result: "impossible" };
  }

  private evaluatePassword(data: string): string | undefined {
    const result = this.parseSimpleArithmeticExpression(data);

    if (Number.isNaN(result)) {
      return undefined;
    }

    return result.toString();
  }

  private cleanArithmeticExpression(expression: string): string {
    return expression
      .replaceAll("\u04B3", "*") // ҳ
      .replaceAll("\u00F7", "/") // ÷
      .replaceAll("\u2795", "+") // ➕
      .replaceAll("\u2796", "-") // ➖
      .replaceAll("ns.exit(),", "")
      .split(",")[0];
  }

  private parseSimpleArithmeticExpression(expression: string): number {
    const tokens = this.cleanArithmeticExpression(expression).split("");

    let currentDepth = 0;
    const depth = tokens.map(token => {
      if (token === "(") {
        currentDepth += 1;
      } else if (token === ")") {
        currentDepth -= 1;
        return currentDepth + 1;
      }

      return currentDepth;
    });

    const depth1Start = depth.indexOf(1);
    const firstZeroAfterDepth1Start = depth.indexOf(0, depth1Start);
    const depth1End = firstZeroAfterDepth1Start === -1
      ? depth.length - 1
      : firstZeroAfterDepth1Start - 1;

    if (depth1Start !== -1) {
      const subExpression = tokens.slice(depth1Start + 1, depth1End).join("");
      const result = this.parseSimpleArithmeticExpression(subExpression);

      tokens.splice(depth1Start, depth1End - depth1Start + 1, result.toString());
      return this.parseSimpleArithmeticExpression(tokens.join(""));
    }

    let remainingExpression = tokens.join("");

    const multiplicationDivisionRegex = /(-?\d*\.?\d+) *([*/]) *(-?\d*\.?\d+)/;
    let match = remainingExpression.match(multiplicationDivisionRegex);

    while (match) {
      const [fullMatch, left, operator, right] = match;
      const result = operator === "*"
        ? parseFloat(left) * parseFloat(right)
        : parseFloat(left) / parseFloat(right);

      const resultString = Math.abs(result) < 0.000001
        ? result.toFixed(20)
        : result.toString();

      remainingExpression = remainingExpression.replace(fullMatch, resultString);
      match = remainingExpression.match(multiplicationDivisionRegex);
    }

    const additionSubtractionRegex = /(-?\d*\.?\d+) *([+-]) *(-?\d*\.?\d+)/;
    match = remainingExpression.match(additionSubtractionRegex);

    while (match) {
      const [fullMatch, left, operator, right] = match;
      const result = operator === "+"
        ? parseFloat(left) + parseFloat(right)
        : parseFloat(left) - parseFloat(right);

      remainingExpression = remainingExpression.replace(fullMatch, result.toString());
      match = remainingExpression.match(additionSubtractionRegex);
    }

    const [, leftover] = remainingExpression.match(/(-?\d*\.?\d+)/) ?? [];
    return parseFloat(leftover);
  }
}
