import { useMemo, useState } from "react";
import { Boxes, Container, Globe2, PackageCheck, ShieldCheck, TerminalSquare } from "lucide-react";
import { SetupDoctorTab } from "@/features/config/SetupDoctorTab";
import type { SetupCapabilityId } from "@/api/tauri";

type SetupItemId = "browser" | "python" | "docker" | "sandbox" | "mcp";

interface SetupItem {
  id: SetupItemId;
  label: string;
  code: string;
  description: string;
  prefix: string;
  icon: typeof PackageCheck;
  capabilityId: SetupCapabilityId;
}

const SETUP_ITEMS: SetupItem[] = [
  {
    id: "browser",
    label: "Browser agent-browser",
    code: "browser",
    description: "Install and verify agent-browser plus Chrome for Testing.",
    prefix: "browser",
    icon: Globe2,
    capabilityId: "browser_agent_browser",
  },
  {
    id: "python",
    label: "Python Skills",
    code: "skills",
    description: "Detect Python and prepare risk-profile command allowlists.",
    prefix: "skills",
    icon: Boxes,
    capabilityId: "python_skills",
  },
  {
    id: "docker",
    label: "Docker Runtime",
    code: "runtime",
    description: "Check Docker CLI, daemon reachability, and image pulls.",
    prefix: "runtime",
    icon: Container,
    capabilityId: "docker_runtime",
  },
  {
    id: "sandbox",
    label: "Sandbox Backend",
    code: "risk_profiles.default",
    description: "Detect sandbox backends and enable auto sandbox config.",
    prefix: "risk_profiles.default",
    icon: ShieldCheck,
    capabilityId: "sandbox_backend",
  },
  {
    id: "mcp",
    label: "MCP stdio Doctor",
    code: "mcp.servers.default",
    description: "Doctor a stdio MCP server command and transport.",
    prefix: "mcp.servers.default",
    icon: TerminalSquare,
    capabilityId: "mcp_stdio",
  },
];

export function SetupCenterPanel() {
  const [selectedId, setSelectedId] = useState<SetupItemId>("browser");
  const [riskAlias, setRiskAlias] = useState("default");
  const [mcpAlias, setMcpAlias] = useState("default");
  const selected = SETUP_ITEMS.find((item) => item.id === selectedId) ?? SETUP_ITEMS[0];

  const target = useMemo(() => {
    if (selected.id === "sandbox") {
      return {
        ...selected,
        prefix: `risk_profiles.${cleanAlias(riskAlias) || "default"}`,
      };
    }
    if (selected.id === "mcp") {
      return {
        ...selected,
        prefix: `mcp.servers.${cleanAlias(mcpAlias) || "default"}`,
      };
    }
    return selected;
  }, [mcpAlias, riskAlias, selected]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-w-0 flex-col border-r border-white/10 bg-[#020818]/90">
        <header className="shrink-0 border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            <PackageCheck size={16} className="text-cyan-300" />
            <h2 className="text-sm font-semibold text-neutral-100">Setup Center</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">
            Install, configure, and verify local capabilities without opening raw config first.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {SETUP_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition ${
                    selectedId === item.id
                      ? "bg-cyan-400/10 text-cyan-100"
                      : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                  }`}
                >
                  <Icon size={15} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{item.label}</span>
                    <span className="mt-1 block font-mono text-[10px] text-neutral-500">
                      {item.code}
                    </span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-neutral-500">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {(selectedId === "sandbox" || selectedId === "mcp") && (
          <div className="shrink-0 border-t border-white/10 p-3">
            <label className="block text-[10px] uppercase tracking-wide text-neutral-500">
              {selectedId === "sandbox" ? "Risk profile alias" : "MCP server alias"}
            </label>
            <input
              value={selectedId === "sandbox" ? riskAlias : mcpAlias}
              onChange={(event) =>
                selectedId === "sandbox"
                  ? setRiskAlias(event.target.value)
                  : setMcpAlias(event.target.value)
              }
              className="mt-2 w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
          </div>
        )}
      </aside>

      <main className="min-w-0 overflow-hidden">
        <SetupDoctorTab
          key={target.prefix}
          prefix={target.prefix}
          title={target.label}
          preferredCapabilityId={target.capabilityId}
          onConfigSaved={() => undefined}
        />
      </main>
    </div>
  );
}

function cleanAlias(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_-]/g, "");
}
