import { ChatPanel } from "@/features/chat/ChatPanel";
import { AgentSetupWizard } from "@/features/chat/AgentSetupWizard";

interface ChatWorkspaceProps {
  mode: "chat" | "acp";
  workspaceRoot: string | null;
  onWorkspaceRoot: (path: string | null) => void;
  agents: string[];
  activeAgent: string | null;
  onAgentCreated: () => void;
}

export function ChatWorkspace({
  mode,
  workspaceRoot,
  onWorkspaceRoot,
  agents,
  activeAgent,
  onAgentCreated,
}: ChatWorkspaceProps) {
  const isCode = mode === "acp";

  if (agents.length === 0) {
    return (
      <section className="flex min-w-0 flex-col overflow-hidden bg-[#020818]/70">
        <AgentSetupWizard onAgentCreated={onAgentCreated} />
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden bg-[#020818]/70">
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeAgent && (
          <ChatPanel
            agentAlias={activeAgent}
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
