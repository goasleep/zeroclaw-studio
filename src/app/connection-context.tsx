// Connection store (React context + hook).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type Connection,
  type HealthEvent,
  getActiveConnection,
  listConnections,
  removeConnection,
  setActiveConnection,
  upsertConnection,
} from "@/api/tauri";
import { listen } from "@tauri-apps/api/event";

interface ConnectionContextValue {
  connections: Connection[];
  active: Connection | null;
  loading: boolean;
  health: HealthEvent | null;
  refresh: () => Promise<void>;
  add: (conn: Connection) => Promise<void>;
  remove: (id: string) => Promise<void>;
  activate: (id: string | null) => Promise<void>;
}

const Ctx = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [active, setActive] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthEvent | null>(null);

  const refresh = useCallback(async () => {
    const [list, act] = await Promise.all([
      listConnections(),
      getActiveConnection(),
    ]);
    setConnections(list);
    setActive(act);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unlisten = listen<HealthEvent>("zeroclaw://health", (event) => {
      setHealth(event.payload);
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);

  const add = useCallback(
    async (conn: Connection) => {
      await upsertConnection(conn);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await removeConnection(id);
      await refresh();
    },
    [refresh],
  );

  const activate = useCallback(
    async (id: string | null) => {
      await setActiveConnection(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      connections,
      active,
      loading,
      health,
      refresh,
      add,
      remove,
      activate,
    }),
    [connections, active, loading, health, refresh, add, remove, activate],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConnections() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useConnections must be used inside <ConnectionProvider>");
  return ctx;
}
