import { useState, type CSSProperties, type ReactNode } from "react";
import { useNs } from "../util/ns";
import { usePreferences } from "../util/usePreferences";
import { Button } from "./Button";
import { Col } from "./Col";
import { WrenchIcon } from "./Icons";
import { Modal } from "./Modal";
import { Row } from "./Row";
import { useTheme } from "./theme";

export function PreferencesButton() {
  const { colors, space, fonts } = useTheme();
  const ns = useNs();
  const { preferences, setPreferences } = usePreferences();

  const [open, setOpen] = useState(false);
  const [reservedMoneyInput, setReservedMoneyInput] = useState<string>("0");
  const [autobuyServers, setAutobuyServers] = useState<boolean>(false);
  const [autobuyHacknet, setAutobuyHacknet] = useState<boolean>(false);

  const openModal = () => {
    setReservedMoneyInput(String(preferences.reservedMoney));
    setAutobuyServers(preferences.autobuyServers);
    setAutobuyHacknet(preferences.autobuyHacknet);
    setOpen(true);
  };

  const save = () => {
    const parsed = Number(reservedMoneyInput);
    const reservedMoney = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setPreferences({
      ...preferences,
      reservedMoney,
      autobuyServers,
      autobuyHacknet,
    });
    setOpen(false);
  };

  const parsedPreview = Number(reservedMoneyInput);
  const preview =
    Number.isFinite(parsedPreview) && parsedPreview >= 0
      ? `$${ns.format.number(parsedPreview, 2)}`
      : "—";

  return (
    <>
      <Button onClick={openModal}>
        <WrenchIcon color={colors.fg} title="Preferences" />
        Preferences
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Preferences"
        actions={<Button onClick={save}>Save</Button>}
      >
        <Col gap={space.lg}>
          <PrefSection heading="Reserved money">
            <Row gap={space.sm} style={{ alignItems: "center" }}>
              <span style={{ color: colors.muted }}>$</span>
              <input
                type="number"
                min={0}
                value={reservedMoneyInput}
                onChange={(e) => setReservedMoneyInput(e.target.value)}
                style={{
                  background: colors.surface,
                  color: colors.fg,
                  border: `1px solid ${colors.border}`,
                  padding: space.xs,
                  fontFamily: fonts.mono,
                  fontSize: "1em",
                  minWidth: 220,
                }}
              />
              <span style={{ color: colors.muted, fontSize: "0.85em" }}>{preview}</span>
            </Row>
            <Hint>Money the dashboard will refuse to spend below. 0 means spend freely.</Hint>
          </PrefSection>

          <PrefSection heading="Auto-purchasing">
            <CheckboxRow
              checked={autobuyServers}
              onChange={setAutobuyServers}
              label="Buy & upgrade private servers"
              hint="Server task will purchase and upgrade purchased servers automatically."
            />
            <CheckboxRow
              checked={autobuyHacknet}
              onChange={setAutobuyHacknet}
              label="Buy & upgrade hacknet nodes"
              hint="Hacknet task will purchase nodes and apply upgrades automatically."
            />
          </PrefSection>
        </Col>
      </Modal>
    </>
  );
}

function PrefSection({ heading, children }: { heading: string; children: ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <Col gap={space.sm}>
      <span
        style={{
          color: colors.fgDim,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {heading}
      </span>
      {children}
    </Col>
  );
}

function Hint({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const { colors } = useTheme();
  return <span style={{ color: colors.muted, fontSize: "0.85em", ...style }}>{children}</span>;
}

interface CheckboxRowProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}

function CheckboxRow({ checked, onChange, label, hint }: CheckboxRowProps) {
  const { colors, space } = useTheme();
  return (
    <Col gap={space.xs}>
      <label
        style={{ display: "inline-flex", alignItems: "center", gap: space.sm, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: colors.accent, cursor: "pointer" }}
        />
        <span style={{ color: colors.fg }}>{label}</span>
      </label>
      {hint && <Hint style={{ paddingLeft: space.lg }}>{hint}</Hint>}
    </Col>
  );
}
