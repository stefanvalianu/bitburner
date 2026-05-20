import { NS } from "@ns"
import { Titlebar } from "./Titlebar";
import { NsProvider } from "../ns/NsProvider";
import { ThemeProvider } from "../theme/ThemeProvider";

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
