// Workspace state: selected workspace root, currently-selected files,
// pending chat attachments.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import {
  type FileEvent,
  workspaceGetState,
  workspaceOpenRoot,
  workspaceWatchStop,
  workspaceWatchStart,
} from "@/api/tauri";
import { migrateLegacyLocalState } from "@/features/chat/chat-local-state";
import { useConnections } from "./connection-context";
import { validateWorkspaceRoot } from "@/api/workspace";

export interface WorkspaceScope {
  connectionId: string;
  root: string | null;
}

interface WorkspaceContextValue {
  connectionId: string | null;
  scope: WorkspaceScope | null;
  root: string | null;
  recentRoots: string[];
  setRoot: (path: string) => Promise<void>;
  selectedFiles: string[];
  addFiles: (paths: string[]) => void;
  toggleFile: (path: string) => void;
  clearSelection: () => void;
  /** Bumped each time the watcher reports an fs change — file tree subscribes. */
  changeNonce: number;
}

const Ctx = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { active } = useConnections();
  const connectionId = active?.id ?? null;
  const isLocalRuntime = active?.transport === "local";
  const [root, setRootState] = useState<string | null>(null);
  const [recentRoots, setRecentRoots] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [changeNonce, setChangeNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!connectionId) {
      setRootState(null);
      setRecentRoots([]);
      setSelectedFiles([]);
      void workspaceWatchStop();
      return () => {
        cancelled = true;
      };
    }
    setSelectedFiles([]);
    void migrateLegacyLocalState(connectionId)
      .then(() => workspaceGetState(connectionId))
      .then((state) => {
        if (cancelled) return;
        setRootState(state.current_root);
        setRecentRoots(state.recent_roots);
        if (state.current_root && isLocalRuntime) {
          void workspaceWatchStart(state.current_root);
        } else {
          void workspaceWatchStop();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId, isLocalRuntime]);

  useEffect(() => {
    const unlisten = listen<FileEvent>("workspace://fs-changed", () => {
      setChangeNonce((n) => n + 1);
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);

  const setRoot = useCallback(
    async (path: string) => {
      if (!connectionId) throw new Error("No active connection");
      const canonicalPath = active && !isLocalRuntime ? await validateWorkspaceRoot(active, path) : path;
      const state = await workspaceOpenRoot(connectionId, canonicalPath);
      setRootState(state.current_root);
      setRecentRoots(state.recent_roots);
      setSelectedFiles([]);
      if (isLocalRuntime) {
        await workspaceWatchStart(canonicalPath);
      } else {
        await workspaceWatchStop();
      }
    },
    [active, connectionId, isLocalRuntime],
  );

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  }, []);

  const addFiles = useCallback((paths: string[]) => {
    setSelectedFiles((prev) => {
      const next = [...prev];
      for (const path of paths) {
        if (path && !next.includes(path)) next.push(path);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedFiles([]), []);

  const value = useMemo(
    () => ({
      connectionId,
      scope: connectionId ? { connectionId, root } : null,
      root,
      recentRoots,
      setRoot,
      selectedFiles,
      addFiles,
      toggleFile,
      clearSelection,
      changeNonce,
    }),
    [
      connectionId,
      root,
      recentRoots,
      setRoot,
      selectedFiles,
      addFiles,
      toggleFile,
      clearSelection,
      changeNonce,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
