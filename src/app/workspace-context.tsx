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
  workspaceWatchStart,
} from "@/api/tauri";
import { migrateLegacyLocalState } from "@/features/chat/chat-local-state";

interface WorkspaceContextValue {
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
  const [root, setRootState] = useState<string | null>(null);
  const [recentRoots, setRecentRoots] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [changeNonce, setChangeNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void migrateLegacyLocalState().then(workspaceGetState).then((state) => {
      if (cancelled) return;
      setRootState(state.current_root);
      setRecentRoots(state.recent_roots);
      if (state.current_root) {
        void workspaceWatchStart(state.current_root);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<FileEvent>("workspace://fs-changed", () => {
      setChangeNonce((n) => n + 1);
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);

  const setRoot = useCallback(async (path: string) => {
    const state = await workspaceOpenRoot(path);
    setRootState(state.current_root);
    setRecentRoots(state.recent_roots);
    setSelectedFiles([]);
    await workspaceWatchStart(path);
  }, []);

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
  if (!ctx)
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
