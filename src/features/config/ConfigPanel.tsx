// Config: read-only browser over /api/config + /api/config/list.
//
// Phase 6 ships this as "view-only with single-field edit via PUT
// /api/config/prop?path=...". Full schema-driven form generator
// (matching web/) is large enough to be its own follow-up.

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { apiFetch, ApiError } from "@/api/client";

interface ConfigListEntry {
  path: string;
  ty?: string;
  category?: string;
}

export function ConfigPanel() {
  const [list, setList] = useState<ConfigListEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [value, setValue] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    void apiFetch<{ entries: ConfigListEntry[] }>("/api/config/list")
      .then((r) => setList(r.entries))
      .catch((e) => setError(String(e)));
  }, []);

  async function loadField(path: string) {
    setSelected(path);
    setValue("");
    setError(null);
    try {
      const r = await apiFetch<{ value: unknown }>(
        `/api/config/prop?path=${encodeURIComponent(path)}`,
      );
      setValue(
        typeof r.value === "string" ? r.value : JSON.stringify(r.value, null, 2),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.envelope.message : String(e));
    }
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      let parsed: unknown = value;
      try {
        parsed = JSON.parse(value);
      } catch {
        /* keep as string */
      }
      await apiFetch(`/api/config/prop?path=${encodeURIComponent(selected)}`, {
        method: "PUT",
        body: JSON.stringify({ value: parsed }),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.envelope.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const filtered = filter
    ? list.filter((e) => e.path.toLowerCase().includes(filter.toLowerCase()))
    : list;

  return (
    <div className="flex h-full">
      <aside className="flex w-1/3 flex-col border-r border-neutral-800">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter paths…"
          className="m-2 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-orange-500"
        />
        <ul className="flex-1 overflow-y-auto font-mono text-[11px]">
          {filtered.map((e) => (
            <li key={e.path}>
              <button
                type="button"
                onClick={() => void loadField(e.path)}
                className={`block w-full truncate px-2 py-0.5 text-left hover:bg-neutral-900 ${
                  selected === e.path
                    ? "bg-orange-500/10 text-orange-200"
                    : "text-neutral-400"
                }`}
              >
                {e.path}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main className="flex flex-1 flex-col">
        {selected ? (
          <>
            <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1.5 text-xs">
              <span className="font-mono text-orange-300">{selected}</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="flex items-center gap-1 rounded bg-orange-500 px-2 py-1 text-[10px] font-medium text-neutral-950 hover:bg-orange-400 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Save size={10} />
                )}
                Save
              </button>
            </header>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="flex-1 resize-none bg-neutral-950 p-3 font-mono text-xs text-neutral-100 outline-none"
            />
            {error && (
              <div className="border-t border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">
                {error}
              </div>
            )}
          </>
        ) : (
          <p className="m-6 text-xs text-neutral-500">
            Select a config path on the left to view and edit.
          </p>
        )}
      </main>
    </div>
  );
}
