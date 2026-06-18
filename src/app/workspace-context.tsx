// Workspace state: selected workspace root, currently-selected files,
// pending chat attachments.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { listen } from "@tauri-apps/api/event";
import {
  type FileEvent,
  workspaceGetRoot,
  workspaceOpenRoot,
  workspaceWatchStart,
} from "@/api/tauri";

const RECENT_WORKSPACES_KEY = "zeroclaw_recent_workspaces";
const MAX_RECENT_WORKSPACES = 8;

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
  const [recentRoots, setRecentRoots] = useState<string[]>(() =>
    readRecentWorkspaces(),
  );
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [changeNonce, setChangeNonce] = useState(0);

  useEffect(() => {
    void workspaceGetRoot().then((path) => {
      setRootState(path);
      if (path) rememberWorkspace(path, setRecentRoots);
    });
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
    rememberWorkspace(path, setRecentRoots);
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

function readRecentWorkspaces() {
  try {
    const raw = localStorage.getItem(RECENT_WORKSPACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((path): path is string => typeof path === "string");
  } catch {
    return [];
  }
}

function rememberWorkspace(
  path: string,
  setRecentRoots: Dispatch<SetStateAction<string[]>>,
) {
  setRecentRoots((prev) => {
    const next = [path, ...prev.filter((item) => item !== path)].slice(
      0,
      MAX_RECENT_WORKSPACES,
    );
    try {
      localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(next));
    } catch {
      // Local recents are a convenience only.
    }
    return next;
  });
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
