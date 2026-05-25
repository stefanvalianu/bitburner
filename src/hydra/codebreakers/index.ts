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
    case "Factori-Os":
    case "Pr0verFl0":
    case "KingOfTheHill":
    case "RateMyPix.Auth":
    case "(The Labyrinth)":
    default: return new UnknownCodebreaker(target, ip, ns);
  }
}
