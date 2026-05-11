import { useState } from "react";
import { useNs } from "../util/ns";
import { usePreferences } from "../util/usePreferences";
import { Button } from "./Button";
import { Col } from "./Col";
import { Hint } from "./Hint";
import { WrenchIcon } from "./Icons";
import { Modal } from "./Modal";
import { NumberInput } from "./NumberInput";
import { Row } from "./Row";
import { SectionHeading } from "./SectionHeading";
import { useTheme } from "./theme";

export function PreferencesButton() {
  const { colors, space } = useTheme();
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
          <Col gap={space.sm}>
            <SectionHeading>Reserved money</SectionHeading>
            <Row gap={space.sm} style={{ alignItems: "center" }}>
              <span style={{ color: colors.muted }}>$</span>
              <NumberInput value={reservedMoneyInput} onChange={setReservedMoneyInput} />
              <Hint>{preview}</Hint>
            </Row>
            <Hint>Money the dashboard will refuse to spend below. 0 means spend freely.</Hint>
          </Col>

          <Col gap={space.sm}>
            <SectionHeading>Auto-purchasing</SectionHeading>
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
          </Col>
        </Col>
      </Modal>
    </>
  );
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
