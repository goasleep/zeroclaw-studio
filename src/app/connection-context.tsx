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
  type ActivationStep,
  type Connection,
  type HealthEvent,
  getActiveConnection,
  listConnections,
  reactivate,
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
  /** Most recent activation step from the backend orchestrator. */
  activation: ActivationStep | null;
  refresh: () => Promise<void>;
  add: (conn: Connection) => Promise<void>;
  remove: (id: string) => Promise<void>;
  activate: (id: string | null) => Promise<void>;
  /** Re-run activation for the currently active connection. */
  retry: () => Promise<void>;
}

const Ctx = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [active, setActive] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthEvent | null>(null);
  const [activation, setActivation] = useState<ActivationStep | null>(null);

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

  useEffect(() => {
    const unlisten = listen<ActivationStep>(
      "zeroclaw://activation",
      (event) => {
        setActivation(event.payload);
        // `started` is the first event in any activation burst — if it
        // arrives before the initial refresh saw the connection (which
        // happens on first-run auto-onboard, where the backend mints a
        // Connection during setup and the activator fires before React
        // has re-polled), pull the list now so the UI flips from
        // Welcome to Workspace immediately.
        if (event.payload.type === "started") {
          void refresh();
        }
        // When activation reaches `ready`, the persisted Connection.url and
        // possibly token were updated by the backend — re-pull so the rest
        // of the UI sees the resolved state.
        if (event.payload.type === "ready") {
          void refresh();
        }
      },
    );
    return () => {
      void unlisten.then((u) => u());
    };
  }, [refresh]);

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
      // Reset the previous activation state — the next event burst will
      // repopulate it.
      setActivation(null);
      await setActiveConnection(id);
      await refresh();
    },
    [refresh],
  );

  const retry = useCallback(async () => {
    setActivation(null);
    await reactivate();
  }, []);

  const value = useMemo(
    () => ({
      connections,
      active,
      loading,
      health,
      activation,
      refresh,
      add,
      remove,
      activate,
      retry,
    }),
    [
      connections,
      active,
      loading,
      health,
      activation,
      refresh,
      add,
      remove,
      activate,
      retry,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConnections() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useConnections must be used inside <ConnectionProvider>");
  return ctx;
}
