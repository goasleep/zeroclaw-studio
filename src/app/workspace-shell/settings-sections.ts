import {
  Bot,
  Clock,
  Cog,
  Database,
  HardDrive,
  Network,
  PackageCheck,
  PlugZap,
  Settings,
  ShieldCheck,
  Stethoscope,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { SettingsSection } from "./types";

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  group: "App" | "Gateway" | "Capabilities" | "Operations";
  icon: LucideIcon;
}> = [
  { id: "app", label: "App", group: "App", icon: Settings },
  { id: "setup-center", label: "Setup Center", group: "App", icon: PackageCheck },
  { id: "gateway-overview", label: "Gateway Overview", group: "Gateway", icon: Cog },
  { id: "models-providers", label: "Models & Providers", group: "Gateway", icon: PlugZap },
  { id: "agents", label: "Agents", group: "Gateway", icon: Bot },
  { id: "runtime-safety", label: "Runtime & Safety", group: "Gateway", icon: ShieldCheck },
  { id: "channels", label: "Channels", group: "Gateway", icon: Network },
  { id: "memory", label: "Memory", group: "Capabilities", icon: Database },
  { id: "tools-skills", label: "Tools & Skills", group: "Capabilities", icon: Wrench },
  { id: "integrations", label: "Integrations", group: "Capabilities", icon: PlugZap },
  { id: "cron", label: "Cron", group: "Operations", icon: Clock },
  { id: "logs", label: "Logs", group: "Operations", icon: Terminal },
  { id: "doctor", label: "Doctor", group: "Operations", icon: Stethoscope },
  { id: "devices", label: "Devices", group: "Operations", icon: HardDrive },
];

export function isSettingsSection(value: string): value is SettingsSection {
  return (
    SETTINGS_SECTIONS.some((section) => section.id === value) ||
    value === "gateway-config" ||
    value === "tools"
  );
}
