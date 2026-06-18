// Recursive file tree for the workspace root.

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { type DirEntry, workspaceListDir } from "@/api/tauri";
import { useWorkspace } from "@/app/workspace-context";

interface NodeProps {
  entry: DirEntry;
  depth: number;
}

function FileNode({ entry, depth }: NodeProps) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const { selectedFiles, toggleFile, changeNonce } = useWorkspace();
  const isSelected = !entry.isDir && selectedFiles.includes(entry.path);

  useEffect(() => {
    if (entry.isDir && open) {
      void workspaceListDir(entry.path).then(setChildren).catch(() => setChildren([]));
    }
  }, [entry, open, changeNonce]);

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
            <FileNode key={c.path} entry={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree() {
  const { root, changeNonce } = useWorkspace();
  const [top, setTop] = useState<DirEntry[] | null>(null);

  useEffect(() => {
    if (!root) {
      setTop(null);
      return;
    }
    void workspaceListDir(root).then(setTop).catch(() => setTop([]));
  }, [root, changeNonce]);

  if (!root) return null;
  if (top === null) {
    return <div className="px-3 py-2 text-xs text-neutral-500">Loading…</div>;
  }
  if (top.length === 0) {
    return <div className="px-3 py-2 text-xs text-neutral-500">Empty directory</div>;
  }

  return (
    <div className="select-none py-1 font-mono">
      {top.map((entry) => (
        <FileNode key={entry.path} entry={entry} depth={0} />
      ))}
    </div>
  );
}
