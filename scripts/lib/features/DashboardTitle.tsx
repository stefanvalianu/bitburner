import { HP, NS } from "@ns";

interface Props {
  ns: NS;

  hp?: HP | undefined;
  money?: number | undefined;
}

export function DashboardTitle({ ns, hp, money }: Props) {
  const theme = ns.ui.getTheme();

  return (
    <div style={{ padding: "4px 8px" }}>
      {hp === undefined && (
        <span style={{ color: theme.primary, fontSize: 16, fontWeight: "bolder" }}>
          Dashboard loading...
        </span>
      )}
      {hp && (
        <span style={{ color: theme.hp }}>
          HP {hp.current}/{hp.max}
        </span>
      )}
      {money && (
        <span style={{ color: theme.money, marginLeft: "8px" }}>${ns.format.number(money, 2)}</span>
      )}
    </div>
  );
}
