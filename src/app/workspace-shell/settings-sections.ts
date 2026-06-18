import {
  Clock,
  Cog,
  Database,
  HardDrive,
  PlugZap,
  Settings,
  Stethoscope,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { SettingsSection } from "./types";

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  group: "App" | "Gateway" | "Operations";
  icon: LucideIcon;
}> = [
  { id: "app", label: "App", group: "App", icon: Settings },
  { id: "gateway-config", label: "Gateway Config", group: "Gateway", icon: Cog },
  { id: "memory", label: "Memory", group: "Operations", icon: Database },
  { id: "cron", label: "Cron", group: "Operations", icon: Clock },
  { id: "tools", label: "Tools", group: "Operations", icon: Wrench },
  { id: "integrations", label: "Integrations", group: "Operations", icon: PlugZap },
  { id: "logs", label: "Logs", group: "Operations", icon: Terminal },
  { id: "doctor", label: "Doctor", group: "Operations", icon: Stethoscope },
  { id: "devices", label: "Devices", group: "Operations", icon: HardDrive },
];

export function isSettingsSection(value: string): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}
