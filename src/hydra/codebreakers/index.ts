import { NS } from "@ns";
import { ZeroLogonCodebreaker } from "./zeroLogon";
import { FreshInstallCodebreaker } from "./freshInstall";
import { DeskMemoCodebreaker } from "./deskMemo";
import { CloudBlareCodebreaker } from "./cloudBlare";
import { PhpCodebreaker } from "./php";
import { BellaCuoreCodebreaker } from "./bellaCuore";
import { OctantVoxelCodebreaker } from "./octantVoxel";
import { Codebreaker } from "./codebreaker";
import { UnknownCodebreaker } from "./unknown";
import { AccountsManagerCodebreaker } from "./accountsManager";
import { DeepGreenCodebreaker } from "./deepGreen";
import { LaikaCodebreaker } from "./laika";
import { NilCodebreaker } from "./nil";
import { OpenWebAccessPointCodebreaker } from "./openWebAccessPoint";
import { FactoriOsCodebreaker } from "./factoriOs";
import { RateMyPixCodebreaker } from "./rateMyPix";
import { EurozoneFreeCodebreaker } from "./eurozoneFree";
import { KingOfTheHillCodebreaker } from "./kingOfTheHill";
import { BinaryCodebreaker } from "./binary";
import { PrimeTimeCodebreaker } from "./primeTime";
import { OrdoXenosCodebreaker } from "./ordoXenos";
import { MathMlCodebreaker } from "./mathMl";
import { ProverFloCodebreaker } from "./proverFlo";
import { TopPassCodebreaker } from "./topPass";
import { TwoGCellularCodebreaker } from "./cellular";
import { BigMoodCodebreaker } from "./bigMood";
import { LabyrinthCodebreaker } from "./labyrinth";
import { HydraAuthInfo } from "../types";

// List of solvers
export function getCodebreaker(target: HydraAuthInfo, ns: NS): Codebreaker {
  switch (target.targetModel) {
    case "ZeroLogon": return new ZeroLogonCodebreaker(target, ns);
    case "FreshInstall_1.0": return new FreshInstallCodebreaker(target, ns);
    case "DeskMemo_3.1": return new DeskMemoCodebreaker(target, ns);
    case "CloudBlare(tm)": return new CloudBlareCodebreaker(target, ns);
    case "PHP 5.4": return new PhpCodebreaker(target, ns);
    case "BellaCuore": return new BellaCuoreCodebreaker(target, ns);
    case "OctantVoxel": return new OctantVoxelCodebreaker(target, ns);
    case "AccountsManager_4.2": return new AccountsManagerCodebreaker(target, ns);
    case "DeepGreen": return new DeepGreenCodebreaker(target, ns);
    case "Laika4": return new LaikaCodebreaker(target, ns);
    case "NIL": return new NilCodebreaker(target, ns);
    case "OpenWebAccessPoint": return new OpenWebAccessPointCodebreaker(target, ns);
    case "Factori-Os": return new FactoriOsCodebreaker(target, ns);
    case "RateMyPix.Auth": return new RateMyPixCodebreaker(target, ns);
    case "EuroZone Free": return new EurozoneFreeCodebreaker(target, ns);
    case "KingOfTheHill": return new KingOfTheHillCodebreaker(target, ns);
    case "110100100": return new BinaryCodebreaker(target, ns);
    case "PrimeTime 2": return new PrimeTimeCodebreaker(target, ns);
    case "OrdoXenos": return new OrdoXenosCodebreaker(target, ns);
    case "MathML": return new MathMlCodebreaker(target, ns);
    case "Pr0verFl0": return new ProverFloCodebreaker(target, ns);
    case "TopPass": return new TopPassCodebreaker(target, ns);
    case "2G_cellular": return new TwoGCellularCodebreaker(target, ns);
    case "BigMo%od": return new BigMoodCodebreaker(target, ns);
    case "(The Labyrinth)": return new LabyrinthCodebreaker(target, ns);
    default: return new UnknownCodebreaker(target, ns);
  }
}
