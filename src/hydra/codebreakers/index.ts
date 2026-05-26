import { DarknetServerDetails, NS } from "@ns";
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

// List of solvers
export function getCodebreaker(target: DarknetServerDetails, ip: string, ns: NS): Codebreaker {
  switch (target.modelId) {
    case "ZeroLogon": return new ZeroLogonCodebreaker(target, ip, ns);
    case "FreshInstall_1.0": return new FreshInstallCodebreaker(target, ip, ns);
    case "DeskMemo_3.1": return new DeskMemoCodebreaker(target, ip, ns);
    case "CloudBlare(tm)": return new CloudBlareCodebreaker(target, ip, ns);
    case "PHP 5.4": return new PhpCodebreaker(target, ip, ns);
    case "BellaCuore": return new BellaCuoreCodebreaker(target, ip, ns);
    case "OctantVoxel": return new OctantVoxelCodebreaker(target, ip, ns);
    case "AccountsManager_4.2": return new AccountsManagerCodebreaker(target, ip, ns);
    case "DeepGreen": return new DeepGreenCodebreaker(target, ip, ns);
    case "Laika4": return new LaikaCodebreaker(target, ip, ns);
    case "NIL": return new NilCodebreaker(target, ip, ns);
    case "OpenWebAccessPoint": return new OpenWebAccessPointCodebreaker(target, ip, ns);
    case "Factori-Os": return new FactoriOsCodebreaker(target, ip, ns);
    case "RateMyPix.Auth": return new RateMyPixCodebreaker(target, ip, ns);
    case "EuroZone Free": return new EurozoneFreeCodebreaker(target, ip, ns);
    case "KingOfTheHill": return new KingOfTheHillCodebreaker(target, ip, ns);
    case "110100100": return new BinaryCodebreaker(target, ip, ns);
    case "PrimeTime 2": return new PrimeTimeCodebreaker(target, ip, ns);
    case "OrdoXenos": return new OrdoXenosCodebreaker(target, ip, ns);
    case "MathML": return new MathMlCodebreaker(target, ip, ns);
    case "Pr0verFl0": return new ProverFloCodebreaker(target, ip, ns);
    case "TopPass": return new TopPassCodebreaker(target, ip, ns);
    case "2G_cellular": return new TwoGCellularCodebreaker(target, ip, ns);
    case "BigMo%od": return new BigMoodCodebreaker(target, ip, ns);
    case "(The Labyrinth)": return new LabyrinthCodebreaker(target, ip, ns);
    default: return new UnknownCodebreaker(target, ip, ns);
  }
}
