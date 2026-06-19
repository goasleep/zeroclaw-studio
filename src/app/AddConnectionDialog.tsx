// Add Connection wizard — covers the three top-level paths.

import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  type Connection,
  type DetectedBinary,
  type DiscoveredLocal,
  type InstallInstructions,
  type SshConfig,
  detectLocalBinary,
  discoverLocalGateway,
  installInstructions,
  sshOpenTunnel,
} from "@/api/tauri";
import { useConnections } from "@/app/connection-context";
import { Loader2, Server, Terminal, X } from "lucide-react";

type Path = "remote" | "local-attach" | "local-install" | null;

interface Props {
  initialPath: Path;
  onClose: () => void;
}

const DEFAULT_PORT = 42617;

function uuidv4(): string {
  // Crypto-strong UUID v4 — replaces the backend's Uuid::new_v4() for
  // connections created on the frontend.
  return crypto.randomUUID();
}

function newLocalAttach(name: string, port: number): Connection {
  return {
    id: uuidv4(),
    name,
    transport: "local",
    url: `http://127.0.0.1:${port}`,
    ssh: null,
    auth: { mode: "pairing", token: null },
    lifecycle: "attach",
    binary_path: null,
  };
}

function newLocalManaged(name: string, binaryPath: string, port: number): Connection {
  return {
    id: uuidv4(),
    name,
    transport: "local",
    url: `http://127.0.0.1:${port}`,
    ssh: null,
    auth: { mode: "pairing", token: null },
    lifecycle: "managed",
    binary_path: binaryPath,
  };
}

function newRemoteHttp(name: string, url: string): Connection {
  return {
    id: uuidv4(),
    name,
    transport: "http",
    url,
    ssh: null,
    auth: { mode: "pairing", token: null },
    lifecycle: "remote",
    binary_path: null,
  };
}

function newRemoteSsh(name: string, ssh: SshConfig): Connection {
  return {
    id: uuidv4(),
    name,
    transport: "ssh",
    url: "", // filled in after tunnel comes up
    ssh,
    auth: { mode: "pairing", token: null },
    lifecycle: "remote",
    binary_path: null,
  };
}

// ------- Remote subform -------

function RemoteForm({ onCreate }: { onCreate: (c: Connection) => Promise<void> }) {
  const { t } = useLingui();
  const [mode, setMode] = useState<"url" | "ssh">("url");
  const [name, setName] = useState("Remote");
  const [url, setUrl] = useState("http://example:42617");
  const [host, setHost] = useState("");
  const [user, setUser] = useState("");
  const [port, setPort] = useState<string>("");
  const [remotePort, setRemotePort] = useState<number>(DEFAULT_PORT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      if (mode === "url") {
        const conn = newRemoteHttp(name.trim() || "Remote", url.trim());
        await onCreate(conn);
      } else {
        const ssh: SshConfig = {
          host: host.trim(),
          user: user.trim(),
          port: port.trim() ? Number(port) : null,
          key_path: null,
          remote_port: remotePort,
          local_forward_port: null,
        };
        const conn = newRemoteSsh(name.trim() || `${user}@${host}`, ssh);
        await onCreate(conn);
        // Open tunnel immediately so the URL gets resolved.
        await sshOpenTunnel(conn.id);
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`flex-1 rounded border px-3 py-1.5 ${
            mode === "url"
              ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
              : "border-white/15 text-neutral-300"
          }`}
        >
          {t`Direct URL`}
        </button>
        <button
          type="button"
          onClick={() => setMode("ssh")}
          className={`flex-1 rounded border px-3 py-1.5 ${
            mode === "ssh"
              ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
              : "border-white/15 text-neutral-300"
          }`}
        >
          {t`SSH tunnel`}
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">{t`Connection name`}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-white/15 bg-[#020818]/90 px-2 py-1.5 outline-none focus:border-cyan-400"
        />
      </label>

      {mode === "url" ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">{t`Gateway URL`}</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://homelab.tailnet.ts.net:42617"
            className="rounded border border-white/15 bg-[#020818]/90 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-400"
          />
        </label>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">{t`SSH user`}</span>
              <input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="pi"
                className="rounded border border-white/15 bg-[#020818]/90 px-2 py-1.5 outline-none focus:border-cyan-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">{t`SSH host`}</span>
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="homelab.local"
                className="rounded border border-white/15 bg-[#020818]/90 px-2 py-1.5 outline-none focus:border-cyan-400"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">{t`SSH port (optional)`}</span>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="22"
                className="rounded border border-white/15 bg-[#020818]/90 px-2 py-1.5 outline-none focus:border-cyan-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">{t`Remote gateway port`}</span>
              <input
                type="number"
                value={remotePort}
                onChange={(e) => setRemotePort(Number(e.target.value))}
                className="rounded border border-white/15 bg-[#020818]/90 px-2 py-1.5 outline-none focus:border-cyan-400"
              />
            </label>
          </div>
          <p className="text-xs text-neutral-500">
            {t`Uses your local ssh, ssh-agent, and ~/.ssh/config. The workspace opens an ssh -L port forward.`}
          </p>
        </>
      )}

      {err && <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="rounded bg-sky-400 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
      >
        {busy && <Loader2 className="mr-1 inline animate-spin" size={14} />}
        {t`Create connection`}
      </button>
    </div>
  );
}

// ------- Local-attach subform -------

function LocalAttachForm({ onCreate }: { onCreate: (c: Connection) => Promise<void> }) {
  const { t } = useLingui();
  const [name, setName] = useState("Local");
  const [port, setPort] = useState<number>(DEFAULT_PORT);
  const [discovered, setDiscovered] = useState<DiscoveredLocal | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void discoverLocalGateway()
      .then(setDiscovered)
      .catch(() => setDiscovered(null));
  }, []);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const conn = newLocalAttach(name.trim() || "Local", port);
      await onCreate(conn);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {discovered === undefined && (
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <Loader2 className="animate-spin" size={12} />
          {t`Probing localhost:${DEFAULT_PORT}…`}
        </div>
      )}
      {discovered === null && (
        <div className="rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {t`No gateway running on port ${DEFAULT_PORT} right now. That's fine — if a local zeroclaw binary is installed, the workspace will start it automatically when you save this connection.`}
        </div>
      )}
      {discovered && (
        <div className="rounded bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          Detected a running gateway at <code>{discovered.url}</code>.{" "}
          {discovered.require_pairing
            ? t`Pairing is required — workspace will auto-pair after you save.`
            : t`Pairing is disabled — no auth needed.`}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">{t`Connection name`}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-white/15 bg-[#020818]/90 px-2 py-1.5 outline-none focus:border-cyan-400"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">{t`Gateway port`}</span>
        <input
          type="number"
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          className="rounded border border-white/15 bg-[#020818]/90 px-2 py-1.5 outline-none focus:border-cyan-400"
        />
      </label>

      {err && <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="rounded bg-sky-400 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
      >
        {t`Create connection`}
      </button>
    </div>
  );
}

// ------- Local-install path -------

function LocalInstallForm({ onCreate }: { onCreate: (c: Connection) => Promise<void> }) {
  const { t } = useLingui();
  const [binary, setBinary] = useState<DetectedBinary | null | undefined>(undefined);
  const [instructions, setInstructions] = useState<InstallInstructions | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("Managed local");
  const [port, setPort] = useState<number>(DEFAULT_PORT);

  useEffect(() => {
    void detectLocalBinary()
      .then(setBinary)
      .catch(() => setBinary(null));
    void installInstructions().then(setInstructions);
  }, []);

  async function redetect() {
    setBinary(undefined);
    setBinary(await detectLocalBinary());
  }

  async function submit() {
    if (!binary) return;
    setBusy(true);
    setErr(null);
    try {
      const conn = newLocalManaged(name.trim() || "Managed local", binary.path, port);
      await onCreate(conn);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (binary === undefined) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <Loader2 className="animate-spin" size={12} />
        {t`Looking for an installed zeroclaw…`}
      </div>
    );
  }

  if (binary === null) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <div className="rounded border border-white/10 bg-white/[0.06] p-3 text-xs text-neutral-300">
          {t`No zeroclaw binary found. Run this in your terminal:`}
        </div>
        <pre className="overflow-x-auto rounded bg-[#020818]/90 px-3 py-2 text-[11px] text-emerald-300 zc-scrollbar">
          <Terminal className="-mt-1 mr-1 inline" size={12} />
          {instructions?.command ?? t`Loading…`}
        </pre>
        {instructions && (
          <ul className="list-disc space-y-1 pl-5 text-xs text-neutral-400">
            {instructions.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => void redetect()}
          className="self-start rounded border border-white/15 px-3 py-1.5 text-xs text-neutral-200 hover:border-cyan-400"
        >
          {t`Detect again`}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="rounded bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
        {t`Found`} <code>{binary.path}</code>
        {binary.version && <span className="ml-1 text-neutral-400">({binary.version})</span>}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">{t`Connection name`}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-white/15 bg-[#020818]/90 px-2 py-1.5 outline-none focus:border-cyan-400"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">{t`Gateway port`}</span>
        <input
          type="number"
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          className="rounded border border-white/15 bg-[#020818]/90 px-2 py-1.5 outline-none focus:border-cyan-400"
        />
      </label>
      {err && <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}
      <p className="text-xs text-neutral-500">
        {t`Workspace will spawn zeroclaw gateway --port ${port} when this connection is active, and shut it down when the workspace exits.`}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="rounded bg-sky-400 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
      >
        {t`Create managed connection`}
      </button>
    </div>
  );
}

export function AddConnectionDialog({ initialPath, onClose }: Props) {
  const { t } = useLingui();
  const { add, activate } = useConnections();
  const [path, setPath] = useState<Path>(initialPath);

  async function create(conn: Connection) {
    await add(conn);
    // activate() triggers the backend activator, which probes the gateway,
    // spawns it if local + binary available, waits for health, and pairs.
    // Progress is reported via zeroclaw://activation events the connection
    // context picks up. No need to call ensureToken from here anymore.
    await activate(conn.id);
    onClose();
  }

  if (path === null) return null;

  const titles: Record<Exclude<Path, null>, string> = {
    remote: t`Connect to a remote zeroclaw`,
    "local-attach": t`Connect to local zeroclaw`,
    "local-install": t`Set up a new local zeroclaw`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000010]/75 p-6 backdrop-blur-md">
      <div className="zc-terminal-surface w-full max-w-lg rounded-2xl p-6 shadow-2xl">
        <header className="mb-4 flex items-center gap-2">
          <Server size={16} className="text-cyan-300" />
          <h2 className="flex-1 text-base font-medium">{titles[path]}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-100"
          >
            <X size={16} />
          </button>
        </header>

        <nav className="mb-4 flex gap-1 border-b border-white/10 text-xs">
          {(["remote", "local-attach", "local-install"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPath(p)}
              className={`-mb-px border-b-2 px-3 py-2 ${
                path === p
                  ? "border-cyan-400 text-cyan-300"
                  : "border-transparent text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {p === "remote"
                ? t`Remote`
                : p === "local-attach"
                  ? t`Local attach`
                  : t`Install + manage`}
            </button>
          ))}
        </nav>

        {path === "remote" && <RemoteForm onCreate={create} />}
        {path === "local-attach" && <LocalAttachForm onCreate={create} />}
        {path === "local-install" && <LocalInstallForm onCreate={create} />}
      </div>
    </div>
  );
}
