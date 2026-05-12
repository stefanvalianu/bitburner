import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { Row } from "./Row";
import { ScrollScope } from "./ScrollScope";
import { useTheme } from "./theme";

// One higher than MODAL_Z_INDEX in Modal.tsx so confirm dialogs always sit
// above any modal that opened them. See the comment there for the rationale
// behind the near-max value.
const CONFIRM_DIALOG_Z_INDEX = 2147483641;

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "warn" | "error";
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title = "Are you sure?",
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  confirmVariant = "warn",
}: ConfirmDialogProps) {
  const { colors, space } = useTheme();
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const owner = sentinelRef.current?.ownerDocument;
    if (owner) setBody(owner.body);
  }, []);

  useEffect(() => {
    if (!open || !body) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onConfirm();
    };
    body.addEventListener("keydown", onKey);
    return () => body.removeEventListener("keydown", onKey);
  }, [open, body, onCancel, onConfirm]);

  return (
    <>
      <span ref={sentinelRef} style={{ display: "none" }} />
      {open && body
        ? createPortal(
            <ScrollScope
              onClick={onCancel}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: CONFIRM_DIALOG_Z_INDEX,
              }}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <Panel title={title} style={{ minWidth: 360, maxWidth: 560 }}>
                  <div style={{ color: colors.fg }}>{message}</div>
                  <Row gap={space.sm} style={{ justifyContent: "flex-end" }}>
                    <Button onClick={onCancel}>{cancelLabel}</Button>
                    <Button onClick={onConfirm} variant={confirmVariant}>
                      {confirmLabel}
                    </Button>
                  </Row>
                </Panel>
              </div>
            </ScrollScope>,
            body,
          )
        : null}
    </>
  );
}
