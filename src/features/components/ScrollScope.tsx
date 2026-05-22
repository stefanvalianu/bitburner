import type { CSSProperties, MouseEventHandler, ReactNode, Ref } from "react";
import { useTheme } from "@repo/features/theme/ThemeProvider";

const SCOPE = "bb-scroll-scope";

interface ScrollScopeProps {
  children: ReactNode;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLDivElement>;
  rootRef?: Ref<HTMLDivElement>;
}

// Bitburner's global stylesheet hides webkit scrollbars and any overflow
// silently clips. ScrollScope re-enables and themes them, but only within
// its subtree so the rest of the game UI is untouched.
export function ScrollScope({ children, style, onClick, rootRef }: ScrollScopeProps) {
  const theme = useTheme();
  const css = `
    .${SCOPE}, .${SCOPE} * {
      scrollbar-width: thin !important;
      scrollbar-color: ${theme.colors.primarydark} ${theme.colors.well} !important;
    }
    .${SCOPE} ::-webkit-scrollbar,
    .${SCOPE}::-webkit-scrollbar {
      width: 10px !important;
      height: 10px !important;
      display: block !important;
    }
    .${SCOPE} ::-webkit-scrollbar-thumb,
    .${SCOPE}::-webkit-scrollbar-thumb {
      background: ${theme.colors.primarydark} !important;
      border-radius: 2px !important;
    }
    .${SCOPE} ::-webkit-scrollbar-track,
    .${SCOPE}::-webkit-scrollbar-track {
      background: ${theme.colors.well} !important;
    }
  `;
  return (
    <div ref={rootRef} className={SCOPE} onClick={onClick} style={style}>
      <style>{css}</style>
      {children}
    </div>
  );
}
