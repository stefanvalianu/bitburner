import { HP } from "@ns";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useNs } from "@repo/features/ns/NsProvider";

type Props = {
  hp?: HP | undefined;
  money?: number | undefined;
}

export function Titlebar({ hp, money }: Props) {
  const ns = useNs();
  const theme = useTheme();

  return (
    <div style={{ padding: "4px 8px" }}>
      {hp === undefined && (
        <span style={{ color: theme.colors.primary, fontSize: 16, fontWeight: "bolder" }}>
          Dashboard loading...
        </span>
      )}
      {hp && (
        <span style={{ color: theme.colors.hp }}>
          HP {hp.current}/{hp.max}
        </span>
      )}
      {money && (
        <span style={{ color: theme.colors.money, marginLeft: "8px" }}>${ns.format.number(money, 2)}</span>
      )}
    </div>
  );
}
