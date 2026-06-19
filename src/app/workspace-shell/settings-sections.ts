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
import { msg } from "@lingui/core/macro";
import type { MacroMessageDescriptor } from "@lingui/core/macro";
import type { SettingsSection } from "./types";

export type SettingsGroup = "App" | "Gateway" | "Capabilities" | "Operations";

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: MacroMessageDescriptor;
  group: SettingsGroup;
  icon: LucideIcon;
}> = [
  { id: "app", label: msg`App`, group: "App", icon: Settings },
  { id: "setup-center", label: msg`Setup Center`, group: "App", icon: PackageCheck },
  { id: "gateway-overview", label: msg`Gateway Overview`, group: "Gateway", icon: Cog },
  { id: "models-providers", label: msg`Models & Providers`, group: "Gateway", icon: PlugZap },
  { id: "agents", label: msg`Agents`, group: "Gateway", icon: Bot },
  { id: "runtime-safety", label: msg`Runtime & Safety`, group: "Gateway", icon: ShieldCheck },
  { id: "channels", label: msg`Channels`, group: "Gateway", icon: Network },
  { id: "memory", label: msg`Memory`, group: "Capabilities", icon: Database },
  { id: "tools-skills", label: msg`Tools & Skills`, group: "Capabilities", icon: Wrench },
  { id: "integrations", label: msg`Integrations`, group: "Capabilities", icon: PlugZap },
  { id: "cron", label: msg`Cron`, group: "Operations", icon: Clock },
  { id: "logs", label: msg`Logs`, group: "Operations", icon: Terminal },
  { id: "doctor", label: msg`Doctor`, group: "Operations", icon: Stethoscope },
  { id: "devices", label: msg`Devices`, group: "Operations", icon: HardDrive },
];

export function isSettingsSection(value: string): value is SettingsSection {
  return (
    SETTINGS_SECTIONS.some((section) => section.id === value) ||
    value === "gateway-config" ||
    value === "tools"
  );
}
