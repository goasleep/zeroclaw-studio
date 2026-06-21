import { Check, Inbox, ShieldAlert, X } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { useConnections } from "@/app/connection-context";

export interface PendingApproval {
  requestId: string;
  taskId: string;
  taskTitle: string | null;
  tool: string;
  argumentsSummary: string;
  workspaceRoot: string | null;
  agentAlias: string;
  respond: (requestId: string, decision: "approve" | "deny" | "always") => Promise<void>;
}

interface ApprovalsPageProps {
  approvals: PendingApproval[];
  onOpenTask: (taskId: string) => void;
  onResolved: (requestId: string) => void;
}

export function ApprovalsPage({ approvals, onOpenTask, onResolved }: ApprovalsPageProps) {
  const { t } = useLingui();
  const { active } = useConnections();

  async function respond(approval: PendingApproval, decision: "approve" | "deny" | "always") {
    await approval.respond(approval.requestId, decision);
    onResolved(approval.requestId);
  }

  return (
    <main className="h-full min-h-0 overflow-auto bg-[#020818]/70 p-5 zc-scrollbar">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4">
          <h1 className="text-lg font-semibold text-neutral-100">{t`Approvals`}</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {t`Live approvals captured from active task runs on the current gateway.`}
          </p>
        </header>

        {approvals.length === 0 ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
            <div>
              <Inbox size={28} className="mx-auto mb-3 text-neutral-600" />
              <h2 className="text-sm font-semibold text-neutral-100">{t`No pending approvals`}</h2>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">
                {t`When an active task requests a tool approval, it will appear here with runtime and workspace context.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.map((approval) => (
              <article
                key={approval.requestId}
                className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-400/30 bg-amber-400/10 text-amber-200">
                    <ShieldAlert size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-amber-100">
                      {approval.tool}
                    </h2>
                    <dl className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                      <Info label={t`Task`} value={approval.taskTitle ?? approval.taskId} />
                      <Info label={t`Runtime`} value={active?.name ?? t`No connection`} />
                      <Info
                        label={t`Workspace`}
                        value={approval.workspaceRoot ?? t`No workspace selected`}
                        mono
                      />
                      <Info label={t`Agent`} value={approval.agentAlias} />
                    </dl>
                    <div className="mt-3 rounded-md border border-white/10 bg-[#020818]/70 p-3">
                      <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
                        {t`Arguments summary`}
                      </div>
                      <pre className="whitespace-pre-wrap text-xs text-neutral-300">
                        {approval.argumentsSummary}
                      </pre>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void respond(approval, "approve")}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-300"
                    >
                      <Check size={13} />
                      {t`Approve`}
                    </button>
                    <button
                      type="button"
                      onClick={() => void respond(approval, "deny")}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-red-400/30 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-400/10"
                    >
                      <X size={13} />
                      {t`Deny`}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenTask(approval.taskId)}
                      className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400 hover:text-cyan-300"
                    >
                      {t`Open task`}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={`truncate text-neutral-200 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
