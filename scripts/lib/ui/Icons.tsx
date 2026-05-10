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

export function BracesIcon({ color, title = "Ports", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M6 2 Q3.5 2 3.5 4.5 V6.5 Q3.5 8 2 8 Q3.5 8 3.5 9.5 V11.5 Q3.5 14 6 14" />
      <path d="M10 2 Q12.5 2 12.5 4.5 V6.5 Q12.5 8 14 8 Q12.5 8 12.5 9.5 V11.5 Q12.5 14 10 14" />
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

export function DoorIcon({ color, title = "Backdoor installed", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <rect x="4" y="2.5" width="8" height="11" />
      <circle cx="10" cy="8" r="0.6" fill={color} stroke="none" />
    </Icon>
  );
}

export function HackIcon({ color, title = "Hack readiness", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M9 2 L3 9 L7 9 L7 14 L13 7 L9 7 Z" />
    </Icon>
  );
}

export function CopyIcon({ color, title = "Copy path", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <rect x="5" y="2.5" width="8" height="9.5" rx="0.5" />
      <path d="M10 12 V13.5 H3 V5 H4.5" />
    </Icon>
  );
}

export function HardwareIcon({ color, title = "Hardware", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <rect x="3.5" y="3.5" width="9" height="9" rx="0.5" />
      <rect x="6" y="6" width="4" height="4" />
      <path d="M6 3.5 V2 M10 3.5 V2 M6 14 V12.5 M10 14 V12.5 M3.5 6 H2 M3.5 10 H2 M14 6 H12.5 M14 10 H12.5" />
    </Icon>
  );
}

export function LockIcon({ color, title = "Security", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <rect x="4" y="7" width="8" height="7" rx="0.5" />
      <path d="M5.5 7 V5 A2.5 2.5 0 0 1 10.5 5 V7" />
    </Icon>
  );
}

export function UntargetIcon({ color, title = "Un-target", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <circle cx="8" cy="8" r="6" />
      <path d="M3.5 12.5 L12.5 3.5" />
    </Icon>
  );
}

export function PinIcon({ color, title = "Pin", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M6 2 H10 L9.5 6 L12 8.5 H4 L6.5 6 Z" />
      <path d="M8 8.5 V13.5" />
    </Icon>
  );
}

export function ChevronUpIcon({ color, title = "Sort ascending", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M3 10 L8 5 L13 10" />
    </Icon>
  );
}

export function ChevronDownIcon({ color, title = "Sort descending", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M3 6 L8 11 L13 6" />
    </Icon>
  );
}

export function ChevronUpDownIcon({ color, title = "Sort", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M4 6 L8 3 L12 6" />
      <path d="M4 10 L8 13 L12 10" />
    </Icon>
  );
}

export function ShuffleIcon({ color, title = "Reallocate", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M2 4 H5 L10 12 H14" />
      <path d="M12 10 L14 12 L12 14" />
      <path d="M2 12 H5 L10 4 H14" />
      <path d="M12 2 L14 4 L12 6" />
    </Icon>
  );
}

export function MoneyBagIcon({ color, title = "Money", size }: NamedIconProps) {
  return (
    <Icon color={color} title={title} size={size}>
      <path d="M6 3.5 L7 2.5 H9 L10 3.5" />
      <path d="M5 3.5 H11 Q13.5 6 13 10 Q12 14 8 14 Q4 14 3 10 Q2.5 6 5 3.5 Z" />
      <path d="M9.5 7 Q8 6.5 6.5 7.2 Q6 8 7.5 8.5 Q9.5 9 9.5 10 Q8.5 10.7 6.5 10.2" />
      <path d="M8 6 V11" />
    </Icon>
  );
}
