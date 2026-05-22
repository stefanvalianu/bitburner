import { useState } from "react";
import { Modal } from "@repo/features/components/Modal";
import { ServerMapDialog } from "./ServerMapDialog";
import { Button } from "@repo/features/components/Button";
import { WorldIcon } from "@repo/features/components/Icons";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { SectionHeading } from "@repo/features/components/SectionHeading";
import { useDashboard } from "@repo/features/app/DashboardProvider";
import { useNs } from "@repo/features/ns/NsProvider";
import { BACKDOORER_STATE_PORT, getPortData } from "@repo/common/ports";
import { BackdoorerState } from "@repo/tasks/backdoorer/info";

export function ServerSubpanel() {
  const theme = useTheme();
  const ns = useNs();

  const [mapOpen, setMapOpen] = useState<boolean>(false);
  
  const { state } = useDashboard();

  const backdoorInfo = getPortData<BackdoorerState>(ns, BACKDOORER_STATE_PORT);

  return (
    <>
      <SectionHeading>Servers</SectionHeading>
      <span>
        {state.servers.filter((s) => s.hasAdminRights && !s.purchasedByPlayer).length} / {state.servers.filter((s) => !s.purchasedByPlayer).length} nuked
      </span>
      { backdoorInfo &&
        <span>
          {backdoorInfo.numBackdoored} / {backdoorInfo.total} backdoored
        </span>
      }
      <Button onClick={() => setMapOpen(true)}>
        <WorldIcon color={theme.colors.info} />
        Map
      </Button>
      <Modal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        title="Map"
        style={{ minWidth: 800, maxWidth: "calc(90vw - 16px)" }}
      >
        <ServerMapDialog isOpen={mapOpen} />
      </Modal>
    </>
  );
}
