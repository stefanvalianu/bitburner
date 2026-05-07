import type { ReactNode } from "react";

const ICON_SIZE = 14;

interface IconProps {
  color: string;
  title: string;
  size?: number;
  children: ReactNode;
}

export function Icon({ color, title, size = ICON_SIZE, children }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ verticalAlign: "middle", flexShrink: 0 }}
      role="img"
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

interface NamedIconProps {
  color: string;
  title?: string;
  size?: number;
}

export function PortsIcon({ color, title = "Port openers", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <rect x="2" y="6" width="2.5" height="4" />
      <rect x="6.75" y="6" width="2.5" height="4" />
      <rect x="11.5" y="6" width="2.5" height="4" />
    </Icon>
  );
}

export function TorIcon({ color, title = "TOR router", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <rect x="2" y="9" width="12" height="4" rx="0.5" />
      <circle cx="4.5" cy="11" r="0.6" fill={color} stroke="none" />
      <circle cx="7" cy="11" r="0.6" fill={color} stroke="none" />
      <path d="M5 9 V6.5 A3 3 0 0 1 11 6.5 V9" />
      <path d="M8 6.5 V3" />
    </Icon>
  );
}

export function FormulasIcon({ color, title = "Formulas.exe", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M5 13 L7.5 8 L5 3 H10" />
      <path d="M9 7 L13 11 M13 7 L9 11" />
    </Icon>
  );
}

export function WrenchIcon({ color, title = "Tools", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M11 2 L 8 5 L 10 7 L 4 13 L 3 13 L 3 12 L 9 6 L 11 8 L 14 5 Z" />
    </Icon>
  );
}

export function WorldIcon({ color, title = "Server map", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <circle cx="8" cy="8" r="6" />
      <ellipse cx="8" cy="8" rx="2.5" ry="6" />
      <path d="M2 8 H14" />
    </Icon>
  );
}

export function LogsIcon({ color, title = "Logs", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M3 4 H13" />
      <path d="M3 8 H13" />
      <path d="M3 12 H10" />
    </Icon>
  );
}

export function PowerIcon({ color, title = "Kill all", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M5 5 A4.5 4.5 0 1 0 11 5" />
      <path d="M8 2 V8" />
    </Icon>
  );
}

export function MoneyIcon({ color, title = "Money", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <circle cx="8" cy="8" r="6" />
      <path d="M10.5 5.5 Q9 5 7.5 5.5 Q5.5 6 5.5 7.5 Q5.5 9 7.5 9.5 Q10.5 10 10.5 11.5 Q10.5 12.5 9 13 Q7 13.5 5.5 12.5" />
      <path d="M8 3.5 V12.5" />
    </Icon>
  );
}

export function ShieldIcon({ color, title = "Security", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M8 2 L13 4 V8 Q13 12 8 14 Q3 12 3 8 V4 Z" />
    </Icon>
  );
}

export function TargetIcon({ color, title = "Target", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="0.6" fill={color} stroke="none" />
    </Icon>
  );
}

export function HomeIcon({ color, title = "Controller host", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M2 8 L8 2 L14 8" />
      <path d="M4 8 V14 H12 V8" />
      <path d="M7 14 V11 H9 V14" />
    </Icon>
  );
}

export function ProgramsIcon({ color, title = "Programs", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <rect x="2" y="3" width="12" height="10" rx="0.5" />
      <path d="M2 6 H14" />
      <circle cx="4" cy="4.5" r="0.4" fill={color} stroke="none" />
      <circle cx="5.5" cy="4.5" r="0.4" fill={color} stroke="none" />
      <path d="M5 9.5 L7 11 L5 12.5" />
      <path d="M8.5 12.5 H11" />
    </Icon>
  );
}
