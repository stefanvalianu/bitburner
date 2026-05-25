import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

export class MathMlCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat === "numeric") {
      const password = this.evaluatePassword(this.target.data);
      if (password === undefined) {
        this.printCoreInfo();
        return { result: "impossible" };
      }

      const result = await this.authenticate(password);
      if (result === null) return { result: "transient" };
      if (result.success) {
        return { result: "ok", password };
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private evaluatePassword(data: string): string | undefined {
    const expression = this.cleanArithmeticExpression(data);
    if (expression === undefined) {
      return undefined;
    }

    try {
      const result = new ArithmeticExpressionParser(expression).parse();

      if (!Number.isFinite(result)) {
        return undefined;
      }

      return result.toString();
    } catch {
      return undefined;
    }
  }

  private cleanArithmeticExpression(data: string): string | undefined {
    let expression = data
      // Source may inject this inside a parenthesized expression at high difficulty.
      // Remove before split(",") or we can accidentally truncate a valid expression.
      .replaceAll("ns.exit(),", "")
      .split(",")[0];

    // Source symbols:
    // \u04B3 = ҳ  -> *
    // \u00F7 = ÷  -> /
    // \u2795 = ➕ -> +
    // \u2796 = ➖ -> -
    expression = expression
      .replaceAll("\u04B3", "*")
      .replaceAll("\u00F7", "/")
      .replaceAll("\u2795", "+")
      .replaceAll("\u2796", "-")

      // Optional defensive normalization for common lookalikes.
      // These are not currently source-generated, but make copied/debug data safer.
      .replaceAll("\u00D7", "*") // ×
      .replaceAll("\u2715", "*") // ✕
      .replaceAll("\u2716", "*") // ✖
      .replaceAll("\u2215", "/") // ∕
      .replaceAll("\u2044", "/") // ⁄
      .replaceAll("\u2212", "-") // −
      .trim();

    if (expression.length === 0) {
      return undefined;
    }

    // Do not silently accept unknown Unicode/operator characters.
    if (/[^0-9+\-*/().\s]/.test(expression)) {
      return undefined;
    }

    return expression;
  }
}

class ArithmeticExpressionParser {
  private index = 0;

  constructor(private readonly expression: string) {}

  parse(): number {
    const result = this.parseExpression();
    this.skipWhitespace();

    if (this.index !== this.expression.length) {
      throw new Error(`Unexpected token '${this.expression[this.index]}' at index ${this.index}`);
    }

    return result;
  }

  private parseExpression(): number {
    let value = this.parseTerm();

    while (true) {
      this.skipWhitespace();

      if (this.consume("+")) {
        value += this.parseTerm();
      } else if (this.consume("-")) {
        value -= this.parseTerm();
      } else {
        return value;
      }
    }
  }

  private parseTerm(): number {
    let value = this.parseFactor();

    while (true) {
      this.skipWhitespace();

      if (this.consume("*")) {
        value *= this.parseFactor();
      } else if (this.consume("/")) {
        value /= this.parseFactor();
      } else {
        return value;
      }
    }
  }

  private parseFactor(): number {
    this.skipWhitespace();

    if (this.consume("+")) {
      return this.parseFactor();
    }

    if (this.consume("-")) {
      return -this.parseFactor();
    }

    if (this.consume("(")) {
      const value = this.parseExpression();
      this.skipWhitespace();

      if (!this.consume(")")) {
        throw new Error(`Expected ')' at index ${this.index}`);
      }

      return value;
    }

    return this.parseNumber();
  }

  private parseNumber(): number {
    this.skipWhitespace();

    const start = this.index;

    while (
      this.index < this.expression.length &&
      /[0-9.]/.test(this.expression[this.index])
    ) {
      this.index += 1;
    }

    if (start === this.index) {
      throw new Error(`Expected number at index ${this.index}`);
    }

    const raw = this.expression.slice(start, this.index);

    if (!/^\d+(?:\.\d+)?$|^\.\d+$/.test(raw)) {
      throw new Error(`Invalid number '${raw}'`);
    }

    return Number(raw);
  }

  private consume(token: string): boolean {
    if (this.expression[this.index] !== token) {
      return false;
    }

    this.index += 1;
    return true;
  }

  private skipWhitespace(): void {
    while (
      this.index < this.expression.length &&
      /\s/.test(this.expression[this.index])
    ) {
      this.index += 1;
    }
  }
}
