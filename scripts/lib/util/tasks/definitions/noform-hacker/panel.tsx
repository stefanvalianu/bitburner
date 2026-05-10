import type { TaskCustomPanel } from "../../../../features/taskCustomPanels";
import { useNs } from "../../../ns";
import { useDashboardController } from "../../../useDashboardController";

export const NoformHackerPanel: TaskCustomPanel = () => {
  const ns = useNs();
  const { state } = useDashboardController();
  
  return null;
};
