import { useState } from "react";
import { usePreferences } from "@repo/features/usePreferences";
import { Button } from "./Button";
import { Col } from "./Col";
import { Hint } from "./Hint";
import { WrenchIcon } from "./Icons";
import { Modal } from "./Modal";
import { NumberInput } from "./NumberInput";
import { Row } from "./Row";
import { SectionHeading } from "./SectionHeading";
import { useNs } from "@repo/features/ns/NsProvider";
import { useTheme } from "@repo/features/theme/ThemeProvider";

export function PreferencesButton() {
  const theme = useTheme();
  const ns = useNs();
  const { preferences, setPreferences } = usePreferences();

  const [open, setOpen] = useState(false);
  const [reservedMoneyInput, setReservedMoneyInput] = useState<string>("0");
  const [autobuyServers, setAutobuyServers] = useState<boolean>(false);
  const [autobuyHacknet, setAutobuyHacknet] = useState<boolean>(false);
  const [gangClashThresholdInput, setGangClashThresholdInput] = useState<string>("");
  const [hackMinMoneyPctInput, setHackMinMoneyPctInput] = useState<string>("");

  const openModal = () => {
    setReservedMoneyInput(String(preferences.reservedMoney));
    setAutobuyServers(preferences.autobuyServers);
    setAutobuyHacknet(preferences.autobuyHacknet);
    setGangClashThresholdInput(
      preferences.gangClashWinThreshold !== undefined
        ? String(preferences.gangClashWinThreshold)
        : "",
    );
    // Stored as a fraction (0.0-1.0); display as a percentage (0-100).
    setHackMinMoneyPctInput(
      preferences.hackMinimumMoneyPct !== undefined
        ? String(Math.round(preferences.hackMinimumMoneyPct * 100))
        : "",
    );
    setOpen(true);
  };

  const save = () => {
    const parsed = Number(reservedMoneyInput);
    const reservedMoney = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    const gangClashWinThreshold = parseGangClashThreshold(gangClashThresholdInput);
    const hackMinimumMoneyPct = parseHackMinMoneyPct(hackMinMoneyPctInput);
    setPreferences({
      ...preferences,
      reservedMoney,
      autobuyServers,
      autobuyHacknet,
      gangClashWinThreshold,
      hackMinimumMoneyPct,
    });
    setOpen(false);
  };

  const parsedPreview = Number(reservedMoneyInput);
  const preview =
    Number.isFinite(parsedPreview) && parsedPreview >= 0
      ? `$${ns.format.number(parsedPreview, 2)}`
      : "—";

  const gangThresholdPreview =
    parseGangClashThreshold(gangClashThresholdInput) !== undefined
      ? `${parseGangClashThreshold(gangClashThresholdInput)}%`
      : "task default";

  const hackMinMoneyPctPreviewFraction = parseHackMinMoneyPct(hackMinMoneyPctInput);
  const hackMinMoneyPctPreview =
    hackMinMoneyPctPreviewFraction !== undefined
      ? `keep ≥ ${Math.round(hackMinMoneyPctPreviewFraction * 100)}% (steal ≤ ${Math.round(
          (1 - hackMinMoneyPctPreviewFraction) * 100,
        )}%)`
      : "task default";

  return (
    <>
      <Button onClick={openModal}>
        <WrenchIcon color={theme.colors.primary} title="Preferences" />
        Preferences
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Preferences"
        actions={<Button onClick={save}>Save</Button>}
      >
        <Col gap={theme.spacing.lg}>
          <Col gap={theme.spacing.sm}>
            <SectionHeading>Reserved money</SectionHeading>
            <Row gap={theme.spacing.sm} style={{ alignItems: "center" }}>
              <span style={{ color: theme.colors.secondary }}>$</span>
              <NumberInput value={reservedMoneyInput} onChange={setReservedMoneyInput} />
              <Hint>{preview}</Hint>
            </Row>
            <Hint>Money the dashboard will refuse to spend below. 0 means spend freely.</Hint>
          </Col>

          <Col gap={theme.spacing.sm}>
            <SectionHeading>Gang clash win threshold</SectionHeading>
            <Row gap={theme.spacing.sm} style={{ alignItems: "center" }}>
              <NumberInput
                value={gangClashThresholdInput}
                onChange={setGangClashThresholdInput}
                min={1}
                max={100}
                placeholder="blank = task default"
              />
              <span style={{ color: theme.colors.secondary }}>%</span>
              <Hint>{gangThresholdPreview}</Hint>
            </Row>
            <Hint>
              Minimum win chance (1–100) required before the gang task enables territory clashes.
              Leave blank to use the task's built-in default.
            </Hint>
          </Col>

          <Col gap={theme.spacing.sm}>
            <SectionHeading>Hack minimum money</SectionHeading>
            <Row gap={theme.spacing.sm} style={{ alignItems: "center" }}>
              <NumberInput
                value={hackMinMoneyPctInput}
                onChange={setHackMinMoneyPctInput}
                min={0}
                max={99}
                placeholder="blank = task default"
              />
              <span style={{ color: theme.colors.secondary }}>%</span>
              <Hint>{hackMinMoneyPctPreview}</Hint>
            </Row>
            <Hint>
              Minimum % of moneyMax preserved per HWGW batch. Higher values steal less per batch but
              tolerate more player-level drift before the cascade drains. Leave blank to use the
              task's built-in default (75%).
            </Hint>
          </Col>

          <Col gap={theme.spacing.sm}>
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

// Treat blank, non-numeric, or out-of-range inputs the same as "unset" —
// the gang task falls back to its built-in default when this is undefined.
function parseGangClashThreshold(input: string): number | undefined {
  if (input.trim() === "") return undefined;
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) return undefined;
  return parsed;
}

// UI value is a percentage (0-99); stored as a fraction (0.0-0.99). Blank /
// invalid / out-of-range → undefined (ultrahacker falls back to its built-in
// HACK_MINIMUM_MONEY_PCT default).
function parseHackMinMoneyPct(input: string): number | undefined {
  if (input.trim() === "") return undefined;
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99) return undefined;
  return parsed / 100;
}

interface CheckboxRowProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}

function CheckboxRow({ checked, onChange, label, hint }: CheckboxRowProps) {
  const theme = useTheme();
  return (
    <Col gap={theme.spacing.xs}>
      <label
        style={{ display: "inline-flex", alignItems: "center", gap: theme.spacing.sm, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: theme.colors.info, cursor: "pointer" }}
        />
        <span style={{ color: theme.colors.primary }}>{label}</span>
      </label>
      {hint && <Hint style={{ paddingLeft: theme.spacing.lg }}>{hint}</Hint>}
    </Col>
  );
}
