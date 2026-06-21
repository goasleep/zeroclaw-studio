import { Check, Inbox, ShieldAlert, X } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ApprovalDecision, Connection, PendingApproval } from "@/api/tauri";

interface ApprovalsPageProps {
  approvals: PendingApproval[];
  connections: Connection[];
  error?: string | null;
  onOpenApproval: (approval: PendingApproval) => void;
  onRespond: (approval: PendingApproval, decision: ApprovalDecision) => Promise<void>;
}

export function ApprovalsPage({
  approvals,
  connections,
  error,
  onOpenApproval,
  onRespond,
}: ApprovalsPageProps) {
  const { t } = useLingui();

  function runtimeName(connectionId: string) {
    return connections.find((connection) => connection.id === connectionId)?.name ?? connectionId;
  }

  return (
    <main className="h-full min-h-0 overflow-auto bg-[#020818]/70 p-5 zc-scrollbar">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4">
          <h1 className="text-lg font-semibold text-neutral-100">{t`Approvals`}</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {t`Live approvals captured from task runs across your runtimes.`}
          </p>
        </header>

        {error && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        {approvals.length === 0 ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
            <div>
              <Inbox size={28} className="mx-auto mb-3 text-neutral-600" />
              <h2 className="text-sm font-semibold text-neutral-100">{t`No pending approvals`}</h2>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">
                {t`When a task requests a tool approval, it will appear here with runtime and workspace context.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.map((approval) => (
              <article
                key={`${approval.connection_id}:${approval.request_id}`}
                className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-400/30 bg-amber-400/10 text-amber-200">
                    <ShieldAlert size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-amber-100">
                      {approval.tool ?? t`Approval required`}
                    </h2>
                    <dl className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                      <Info
                        label={t`Task`}
                        value={approval.task_title ?? approval.task_id ?? approval.session_id}
                      />
                      <Info label={t`Runtime`} value={runtimeName(approval.connection_id)} />
                      <Info
                        label={t`Workspace`}
                        value={approval.workspace_root ?? t`No workspace selected`}
                        mono
                      />
                      <Info label={t`Agent`} value={approval.agent_alias ?? t`Unknown`} />
                    </dl>
                    <div className="mt-3 rounded-md border border-white/10 bg-[#020818]/70 p-3">
                      <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
                        {t`Arguments summary`}
                      </div>
                      <pre className="whitespace-pre-wrap text-xs text-neutral-300">
                        {approval.arguments_summary ?? t`No requirement captured`}
                      </pre>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void onRespond(approval, "approve")}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-300"
                    >
                      <Check size={13} />
                      {t`Approve`}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onRespond(approval, "deny")}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-red-400/30 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-400/10"
                    >
                      <X size={13} />
                      {t`Deny`}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenApproval(approval)}
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
