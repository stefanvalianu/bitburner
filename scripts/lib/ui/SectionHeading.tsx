import { useTheme } from "./theme";

// Uppercase muted-color caption used to label a section inside a panel or
// modal. Wrap in a `<Col gap={space.sm}>` with the section's content.
export function SectionHeading({ children }: { children: string }) {
  const { colors, space } = useTheme();
  return (
    <span
      style={{
        color: colors.fgDim,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 1,
        paddingTop: space.xs,
      }}
    >
      {children}
    </span>
  );
}
