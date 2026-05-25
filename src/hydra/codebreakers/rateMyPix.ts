import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult, PasswordAttemptLog } from "./codebreaker";

export class RateMyPixCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const solver = new RateMyPixAuthCracker(this.target.passwordFormat === "numeric" ? DIGITS : (this.target.passwordFormat === "alphabetic" ? LETTERS : ALPHANUMERIC));
    
    let password = solver.nextGuess();
    if (password === null) return { result: "impossible" };
    let result = await this.authenticate(password);

    let maxAttempts = 1 + this.target.passwordLength * 40;
    while (maxAttempts-- > 0) {
      if (result === null) return { result: "transient" };
      if (result.success) {
        return { result: "ok", password: password! };
      } else {
        const info = await this.ns.dnet.heartbleed(this.targetIp);

        if (info.success && info.logs.length > 0) {
          let logResult: PasswordAttemptLog | undefined;
          
          try {
            logResult = JSON.parse(info.logs[0]) as PasswordAttemptLog;
          } catch {}

          if (logResult && logResult.passwordAttempted && logResult.data) {
            solver.giveFeedback(logResult.passwordAttempted, logResult.data);

            password = solver.nextGuess();
            if (password === null) return { result: "impossible" };
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

    if (maxAttempts === 0) {
      this.ns.tprint(`Ran out of attempts solving factoriOs`);
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }
}

const DIGITS = "0123456789";
const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALPHANUMERIC = DIGITS + LETTERS;

type RateMyPixPhase =
  | "probe"
  | "baseline"
  | "position"
  | "final"
  | "done";

class RateMyPixAuthCracker {
  private readonly baseChar = "_";
  private readonly alphabet: string[];
  private readonly candidates: string[];

  private phase: RateMyPixPhase = "probe";

  private passwordLength = 0;
  private baselineGuess = "";
  private baselineScore = 0;

  private position = 0;
  private candidateIndex = 0;
  private knownPassword: string[] = [];

  constructor(alphabet = ALPHANUMERIC) {
    this.alphabet = [this.baseChar, ...new Set(alphabet)];

    if (!this.alphabet.includes(this.baseChar)) {
      throw new Error(`Alphabet must include '${this.baseChar}'.`);
    }

    this.candidates = this.alphabet.filter(c => c !== this.baseChar);
  }

  public nextGuess(): string | null {
    switch (this.phase) {
      case "probe":
        return this.baseChar;

      case "baseline":
        return this.baselineGuess;

      case "position":
        return this.createPositionGuess();

      case "final":
        return this.knownPassword.join("");

      case "done":
        return null;
    }
  }

  public giveFeedback(lastGuess: string, feedback: string): void {
    const { score, length } = this.parseFeedback(feedback);

    switch (this.phase) {
      case "probe": {
        this.passwordLength = length;
        this.baselineGuess = this.baseChar.repeat(length);
        this.knownPassword = Array<string>(length).fill("");

        if (lastGuess === this.baselineGuess) {
          this.baselineScore = score;
          this.phase = "position";
        } else {
          this.phase = "baseline";
        }

        return;
      }

      case "baseline": {
        this.baselineScore = score;
        this.phase = "position";
        return;
      }

      case "position": {
        this.applyPositionFeedback(score);
        return;
      }

      case "final": {
        if (score === length) {
          this.phase = "done";
          return;
        }

        throw new Error(
          `Final RateMyPix guess '${lastGuess}' was rejected with score ${score}/${length}.`,
        );
      }

      case "done": {
        throw new Error("RateMyPixAuthCracker is already done.");
      }
    }
  }

  private createPositionGuess(): string {
    if (this.position >= this.passwordLength) {
      this.phase = "final";
      return this.knownPassword.join("");
    }

    if (this.candidateIndex >= this.candidates.length) {
      throw new Error(
        `Exhausted alphabet while solving position ${this.position}.`,
      );
    }

    const candidate = this.candidates[this.candidateIndex];
    return replaceChar(this.baselineGuess, this.position, candidate);
  }

  private applyPositionFeedback(score: number): void {
    const candidate = this.candidates[this.candidateIndex];
    const delta = score - this.baselineScore;

    if (delta === 1) {
      this.knownPassword[this.position] = candidate;
      this.advancePosition();
      return;
    }

    if (delta === -1) {
      this.knownPassword[this.position] = this.baseChar;
      this.advancePosition();
      return;
    }

    if (delta === 0) {
      this.candidateIndex++;
      return;
    }

    throw new Error(`Unexpected RateMyPix score delta ${delta}.`);
  }

  private advancePosition(): void {
    this.position++;
    this.candidateIndex = 0;

    if (this.position >= this.passwordLength) {
      this.phase = "final";
    }
  }

  private parseFeedback(feedback: string): { score: number; length: number } {
    const cleaned = feedback
      // eslint-disable-next-line no-control-regex -- Intentionally stripping ANSI SGR escape sequences from Bitburner logs.
      .replace(/\u{001B}\[[0-9;]*m/gu, "")
      .trim();

    const match = cleaned.match(/^(.+)\/(\d+)$/);

    if (!match) {
      throw new Error(`Invalid RateMyPix feedback: '${feedback}'.`);
    }

    return {
      score: this.parseScore(match[1]),
      length: Number(match[2]),
    };
  }

  private parseScore(scoreText: string): number {
    const value = scoreText.trim();

    if (value === "0") {
      return 0;
    }

    // Source returns one emoji marker per exact character.
    // Strip variation selectors so emojis like 🌶️ count as one code point.
    return Array.from(value.replace(/\uFE0F/gu, "")).length;
  }
}

function replaceChar(input: string, index: number, char: string): string {
  return input.slice(0, index) + char + input.slice(index + 1);
}
