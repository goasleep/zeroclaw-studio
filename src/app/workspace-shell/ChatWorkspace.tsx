import { useEffect, useState } from "react";
import { Bot, MessageSquarePlus } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { AgentSetupWizard } from "@/features/chat/AgentSetupWizard";

interface ChatWorkspaceProps {
  mode: "chat" | "acp";
  workspaceRoot: string | null;
  onWorkspaceRoot: (path: string | null) => void;
  agents: string[];
  activeAgent: string | null;
  onAgentChange: (agent: string) => void;
  onAgentCreated: () => void;
}

export function ChatWorkspace({
  mode,
  workspaceRoot,
  onWorkspaceRoot,
  agents,
  activeAgent,
  onAgentChange,
  onAgentCreated,
}: ChatWorkspaceProps) {
  const isCode = mode === "acp";
  const [showAgentSetup, setShowAgentSetup] = useState(true);

  useEffect(() => {
    if (agents.length > 0) setShowAgentSetup(false);
  }, [agents.length]);

  if (agents.length === 0) {
    return (
      <section className="flex min-w-0 flex-col overflow-hidden bg-[#020818]/70">
        {showAgentSetup ? (
          <AgentSetupWizard
            onAgentCreated={onAgentCreated}
            onCancel={() => setShowAgentSetup(false)}
          />
        ) : (
          <NoAgentSessionFallback onCreateAgent={() => setShowAgentSetup(true)} />
        )}
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden bg-[#020818]/70">
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeAgent && (
          <ChatPanel
            key={`${mode}:${activeAgent}:${workspaceRoot ?? "no-project"}`}
            agentAlias={activeAgent}
            agents={agents}
            onAgentChange={onAgentChange}
            mode={mode}
            workspaceDir={isCode ? workspaceRoot : null}
            workspaceRoot={workspaceRoot}
            onWorkspaceRoot={onWorkspaceRoot}
          />
        )}
      </div>
    </section>
  );
}

function NoAgentSessionFallback({ onCreateAgent }: { onCreateAgent: () => void }) {
  const { t } = useLingui();

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="max-w-sm rounded-lg border border-white/10 bg-white/[0.035] p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-300">
          <Bot size={18} />
        </div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-100">{t`No agent configured`}</h2>
        <p className="mb-4 text-xs leading-relaxed text-neutral-500">
          {t`Choose an existing session from the sidebar, or create an agent when you are ready to start a new one.`}
        </p>
        <button
          type="button"
          onClick={onCreateAgent}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-400 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300"
        >
          <MessageSquarePlus size={13} />
          {t`Create agent`}
        </button>
      </div>
    </div>
  );
}
