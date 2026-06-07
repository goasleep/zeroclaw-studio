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
  workspaceGetRoot,
  workspaceOpenRoot,
  workspaceWatchStart,
} from "@/api/tauri";

interface WorkspaceContextValue {
  root: string | null;
  setRoot: (path: string) => Promise<void>;
  selectedFiles: string[];
  toggleFile: (path: string) => void;
  clearSelection: () => void;
  /** Bumped each time the watcher reports an fs change — file tree subscribes. */
  changeNonce: number;
}

const Ctx = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [root, setRootState] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [changeNonce, setChangeNonce] = useState(0);

  useEffect(() => {
    void workspaceGetRoot().then(setRootState);
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
    await workspaceOpenRoot(path);
    setRootState(path);
    setSelectedFiles([]);
    await workspaceWatchStart(path);
  }, []);

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  }, []);

  const clearSelection = useCallback(() => setSelectedFiles([]), []);

  const value = useMemo(
    () => ({
      root,
      setRoot,
      selectedFiles,
      toggleFile,
      clearSelection,
      changeNonce,
    }),
    [root, setRoot, selectedFiles, toggleFile, clearSelection, changeNonce],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
