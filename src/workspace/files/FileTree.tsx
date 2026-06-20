// Recursive file tree for the workspace root.

import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { useWorkspace } from "@/app/workspace-context";
import { useConnections } from "@/app/connection-context";
import { type WorkspaceEntry, workspaceAdapterListDir } from "@/api/workspace";

interface NodeProps {
  entry: WorkspaceEntry;
  depth: number;
  root: string;
}

function FileNode({ entry, depth, root }: NodeProps) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<WorkspaceEntry[] | null>(null);
  const { active } = useConnections();
  const { selectedFiles, toggleFile, changeNonce } = useWorkspace();
  const isSelected = !entry.isDir && selectedFiles.includes(entry.path);

  useEffect(() => {
    if (active && entry.isDir && open) {
      void workspaceAdapterListDir(active, root, entry.relPath)
        .then(setChildren)
        .catch(() => setChildren([]));
    }
  }, [active, entry, open, root, changeNonce]);

  const padding = { paddingLeft: `${depth * 12 + 6}px` };

  if (!entry.isDir) {
    return (
      <button
        type="button"
        onClick={() => toggleFile(entry.path)}
        className={`flex w-full items-center gap-1.5 truncate py-0.5 text-left text-xs hover:bg-white/[0.08] ${
          isSelected ? "bg-cyan-400/10 text-cyan-100" : "text-neutral-300"
        }`}
        style={padding}
      >
        <File size={12} className="shrink-0 text-neutral-500" />
        <span className="truncate">{entry.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 truncate py-0.5 text-left text-xs text-neutral-200 hover:bg-white/[0.08]"
        style={padding}
      >
        {open ? (
          <ChevronDown size={11} className="shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight size={11} className="shrink-0 text-neutral-500" />
        )}
        {open ? (
          <FolderOpen size={12} className="shrink-0 text-cyan-300" />
        ) : (
          <Folder size={12} className="shrink-0 text-cyan-300" />
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {open && children !== null && (
        <div>
          {children.map((c) => (
            <FileNode key={c.path} entry={c} depth={depth + 1} root={root} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree() {
  const { t } = useLingui();
  const { active } = useConnections();
  const { root, changeNonce } = useWorkspace();
  const [top, setTop] = useState<WorkspaceEntry[] | null>(null);

  useEffect(() => {
    if (!active || !root) {
      setTop(null);
      return;
    }
    void workspaceAdapterListDir(active, root)
      .then(setTop)
      .catch(() => setTop([]));
  }, [active, root, changeNonce]);

  if (!root) return null;
  if (top === null) {
    return <div className="px-3 py-2 text-xs text-neutral-500">{t`Loading…`}</div>;
  }
  if (top.length === 0) {
    return <div className="px-3 py-2 text-xs text-neutral-500">{t`Empty directory`}</div>;
  }

  return (
    <div className="select-none py-1 font-mono">
      {top.map((entry) => (
        <FileNode key={entry.path} entry={entry} depth={0} root={root} />
      ))}
    </div>
  );
}
