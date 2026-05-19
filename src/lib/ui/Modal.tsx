import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { Row } from "./Row";
import { ScrollScope } from "./ScrollScope";
import { useTheme } from "./theme";

// Near the CSS-spec max for a 32-bit z-index (2^31 - 1 = 2147483647). We need
// to beat Bitburner's tail-window stacking, which bumps a window's z-index on
// focus and can grow well past typical MUI ranges (~1300-1500). The portal
// drops the backdrop directly under `<body>`, so it competes with every tail
// window for ordering. Ten units of headroom for siblings like ConfirmDialog.
const MODAL_Z_INDEX = 2147483640;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  actions?: ReactNode;
}

// Find the first text-editing input under `root` and put it into a "ready
// to type" state. Used by the modal's Ctrl+F binding.
function focusFirstSearchInput(root: HTMLElement | null): boolean {
  if (!root) return false;
  const el = root.querySelector("input, textarea");
  if (!el) return false;
  const tag = el.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA") return false;
  const input = el as HTMLInputElement | HTMLTextAreaElement;
  input.focus();
  input.select();
  return true;
}

export function Modal({ open, onClose, title, children, style, actions }: ModalProps) {
  const { space } = useTheme();
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  // Reach the document body via a mounted sentinel's `ownerDocument` rather
  // than naming the `document` global directly — the latter trips Bitburner's
  // static RAM analyzer for an extra 25GB charge per script. `body` is the
  // portal target so the backdrop can cover the whole game (escaping the
  // tail-window's transformed containing block) and also the keydown target.
  useEffect(() => {
    const owner = sentinelRef.current?.ownerDocument;
    if (owner) setBody(owner.body);
  }, []);

  useEffect(() => {
    if (!open || !body) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        // Fallback Ctrl+F handler for when focus has drifted to body —
        // the React onKeyDown below catches the in-modal-content case.
        if (focusFirstSearchInput(contentRef.current)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    body.addEventListener("keydown", onKey);
    return () => body.removeEventListener("keydown", onKey);
  }, [open, body, onClose]);

  return (
    <>
      <span ref={sentinelRef} style={{ display: "none" }} />
      {open && body
        ? createPortal(
            <ScrollScope
              onClick={onClose}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: MODAL_Z_INDEX,
              }}
            >
              <div
                ref={contentRef}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  // Ctrl+F jumps to the first input in the modal regardless
                  // of the current target, so it works the same whether the
                  // user is on a row, a button, or already in the search box.
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
                    if (focusFirstSearchInput(contentRef.current)) {
                      e.preventDefault();
                      e.nativeEvent.stopPropagation();
                    }
                    return;
                  }

                  // Bitburner installs a document-level keydown listener for
                  // its global hotkeys and preventDefaults modifier-key
                  // combos, which breaks browser shortcuts in inputs. Stop the
                  // native event here so it never reaches the game's listener.
                  // Escape is allowed through so the body listener below can
                  // still close the modal.
                  if (e.key === "Escape") return;
                  const t = e.target as HTMLElement | null;
                  if (!t) return;
                  const tag = t.tagName;
                  const isInput = tag === "INPUT" || tag === "TEXTAREA";
                  if (!isInput && !t.isContentEditable) return;
                  e.nativeEvent.stopPropagation();

                  // Ctrl+A is intercepted by Bitburner before the browser's
                  // default "select all in input" runs (Ctrl+C/V are not).
                  // Reach the same outcome by calling .select() ourselves.
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && isInput) {
                    e.preventDefault();
                    (t as HTMLInputElement | HTMLTextAreaElement).select();
                  }
                }}
                style={{
                  maxWidth: "90vw",
                  maxHeight: "90vh",
                  overflow: "auto",
                }}
              >
                <Panel title={title} style={{ minWidth: 480, ...style }}>
                  {children}
                  <Row gap={space.sm} style={{ justifyContent: "flex-end" }}>
                    {actions}
                    <Button onClick={onClose}>Close</Button>
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
