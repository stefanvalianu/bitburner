import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

const EUROZONE_FREE_PASSWORDS = [
  "Austria",
  "Belgium",
  "Bulgaria",
  "Croatia",
  "Republic of Cyprus",
  "Czech Republic",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Ireland",
  "Italy",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Malta",
  "Netherlands",
  "Poland",
  "Portugal",
  "Romania",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
] as const;

export class EurozoneFreeCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const options = EUROZONE_FREE_PASSWORDS.filter(p => p.length === this.info.targetPasswordLength);

    for (const option of options) {
      const result = await this.authenticate(option);
      if (result === null) return { result: "transient" };
      if (result.success) {
        return {
          result: "ok",
          password: option
        }
      }
    }
    

    this.printCoreInfo();
    return { result: "impossible" };
  }
}
