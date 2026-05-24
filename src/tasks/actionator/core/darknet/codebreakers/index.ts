import { NS } from "@ns";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";
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

export function getCodebreaker(target: DarknetServer, ns: NS): Codebreaker {
  switch (target.modelId) {
    case "ZeroLogon": return new ZeroLogonCodebreaker(target, ns);
    case "FreshInstall_1.0": return new FreshInstallCodebreaker(target, ns);
    case "DeskMemo_3.1": return new DeskMemoCodebreaker(target, ns);
    case "CloudBlare(tm)": return new CloudBlareCodebreaker(target, ns);
    case "PHP 5.4": return new PhpCodebreaker(target, ns);
    case "BellaCuore": return new BellaCuoreCodebreaker(target, ns);
    case "OctantVoxel": return new OctantVoxelCodebreaker(target, ns);
    case "AccountsManager_4.2": return new AccountsManagerCodebreaker(target, ns);
    case "DeepGreen": return new DeepGreenCodebreaker(target, ns);
    case "Laika4":
    case "Factori-Os":
    case "Pr0verFl0":
    case "NIL":
    case "OpenWebAccessPoint":
    default: return new UnknownCodebreaker(target, ns);
  }
}
