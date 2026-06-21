import { Loader2, Trash2 } from "lucide-react";
import type { ConfigResourceRef } from "./config-resource";

export function ResourceDeleteDialog({
  resource,
  busy,
  onCancel,
  onDelete,
}: {
  resource: ConfigResourceRef;
  busy?: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-config-resource-title"
        className="w-full max-w-md rounded-lg border border-red-500/25 bg-[#060b1a] p-5 shadow-2xl shadow-black/50"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-300">
            <Trash2 size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3
              id="delete-config-resource-title"
              className="text-sm font-semibold text-neutral-100"
            >
              Delete config resource?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              This removes <span className="font-medium text-neutral-100">{resource.label}</span>{" "}
              immediately from{" "}
              <span className="font-mono text-neutral-300">{resource.resourcePath}</span>.
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-white/20 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}
