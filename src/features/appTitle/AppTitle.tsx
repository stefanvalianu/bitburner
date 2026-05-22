import { NS } from "@ns"
import { Titlebar } from "./Titlebar";
import { NsProvider } from "@repo/features/ns/NsProvider";
import { ThemeProvider } from "@repo/features/theme/ThemeProvider";

type Props = {
  ns: NS;
}

export function AppTitle({ ns }: Props) {
  return (
    <NsProvider ns={ns}>
      <ThemeProvider>
        <Titlebar />
      </ThemeProvider>
    </NsProvider>
  );
}
