import { useWorkspace } from "@/app/workspace-context";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { AgentSetupWizard } from "@/features/chat/AgentSetupWizard";

interface ChatWorkspaceProps {
  mode: "chat" | "acp";
  agents: string[];
  activeAgent: string | null;
  onAgentCreated: () => void;
}

export function ChatWorkspace({
  mode,
  agents,
  activeAgent,
  onAgentCreated,
}: ChatWorkspaceProps) {
  const { root } = useWorkspace();
  const isCode = mode === "acp";

  if (agents.length === 0) {
    return (
      <section className="flex min-w-0 flex-col overflow-hidden bg-neutral-950">
        <AgentSetupWizard onAgentCreated={onAgentCreated} />
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden bg-neutral-950">
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeAgent && (
          <ChatPanel
            agentAlias={activeAgent}
            mode={mode}
            workspaceDir={isCode ? root : null}
          />
        )}
      </div>
    </section>
  );
}
