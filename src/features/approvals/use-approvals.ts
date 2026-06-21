import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  approvalList,
  approvalRespond,
  type ApprovalDecision,
  type ApprovalsUpdatedEvent,
  type PendingApproval,
} from "@/api/tauri";

export function useApprovals(connectionId: string | null = null) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setApprovals(await approvalList(connectionId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [connectionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unlisten = listen<ApprovalsUpdatedEvent>("zeroclaw://approvals-updated", (event) => {
      if (connectionId && event.payload.connection_id !== connectionId) return;
      if (connectionId) {
        setApprovals(event.payload.approvals);
      } else {
        setApprovals((prev) => mergeApprovalUpdates(prev, event.payload.approvals, event.payload.connection_id));
      }
      setError(null);
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [connectionId]);

  const respond = useCallback(
    async (approval: PendingApproval, decision: ApprovalDecision) => {
      await approvalRespond(
        approval.connection_id,
        approval.session_id,
        approval.request_id,
        decision,
      );
      setApprovals((prev) =>
        prev.filter(
          (item) =>
            item.connection_id !== approval.connection_id ||
            item.request_id !== approval.request_id,
        ),
      );
    },
    [],
  );

  return useMemo(
    () => ({
      approvals,
      error,
      refresh,
      respond,
    }),
    [approvals, error, refresh, respond],
  );
}

export function mergeApprovalUpdates(
  prev: PendingApproval[],
  updates: PendingApproval[],
  connectionId: string,
) {
  const withoutConnection = prev.filter((approval) => approval.connection_id !== connectionId);
  return [...withoutConnection, ...updates].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
