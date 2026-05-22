import { useTheme } from "@repo/features/theme/ThemeProvider";

// modal. Wrap in a `<Col gap={space.sm}>` with the section's content.
export function SectionHeading({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <span
      style={{
        color: theme.colors.primarydark,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 1,
        paddingTop: theme.spacing.xs,
      }}
    >
      {children}
    </span>
  );
}
