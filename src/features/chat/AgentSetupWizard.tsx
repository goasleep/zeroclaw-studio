// Agent Setup Wizard — full quickstart builder for the workspace surface.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, CheckCircle2, ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import {
  apiQuickstartApply,
  apiQuickstartFields,
  apiQuickstartState,
  apiQuickstartValidate,
  type BuilderSubmission,
  type FieldDescriptor,
  type MemoryChoice,
  type QuickstartPeerGroup,
  type QuickstartState,
} from "@/api/client";

type WizardStep = "loading" | "form" | "validating" | "applying" | "done" | "error";

interface AgentSetupWizardProps {
  onAgentCreated?: () => void;
}

interface ChannelDraft {
  channel_type: string;
  alias: string;
  token: string;
}

interface PeerDraft {
  name: string;
  channel: string;
  external_peers: string;
  ignore: string;
}

interface PersonalityDraft {
  filename: string;
  content: string;
}

export function AgentSetupWizard({ onAgentCreated }: AgentSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>("loading");
  const [qsState, setQsState] = useState<QuickstartState | null>(null);
  const [error, setError] = useState("");
  const [fieldDescs, setFieldDescs] = useState<FieldDescriptor[]>([]);
  const [providerType, setProviderType] = useState("");
  const [providerAlias, setProviderAlias] = useState("default");
  const [model, setModel] = useState("");
  const [agentName, setAgentName] = useState("default");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [riskMode, setRiskMode] = useState<"fresh" | "existing">("fresh");
  const [riskValue, setRiskValue] = useState("locked_down");
  const [runtimeMode, setRuntimeMode] = useState<"fresh" | "existing">("fresh");
  const [runtimeValue, setRuntimeValue] = useState("balanced");
  const [memoryMode, setMemoryMode] = useState<"fresh" | "existing">("fresh");
  const [memoryValue, setMemoryValue] = useState<MemoryChoice>("sqlite");
  const [channels, setChannels] = useState<ChannelDraft[]>([]);
  const [peerGroups, setPeerGroups] = useState<PeerDraft[]>([]);
  const [personalityFile, setPersonalityFile] = useState("");
  const [personalityFiles, setPersonalityFiles] = useState<PersonalityDraft[]>([]);

  useEffect(() => {
    void apiQuickstartState()
      .then((s) => {
        setQsState(s);
        const firstProvider = s.model_provider_types[0]?.kind ?? "";
        const firstChannel = s.channel_types[0]?.kind ?? "";
        setProviderType(firstProvider);
        setRiskValue(s.risk_presets[0]?.key ?? s.risk_profiles[0] ?? "locked_down");
        setRuntimeValue(s.runtime_presets[0]?.key ?? s.runtime_profiles[0] ?? "balanced");
        setMemoryValue((s.memory_kinds[0] as MemoryChoice | undefined) ?? "sqlite");
        setPersonalityFile(s.personality_files[0] ?? "");
        if (firstChannel) {
          setChannels([{ channel_type: firstChannel, alias: "default", token: "" }]);
        }
        setStep("form");
      })
      .catch((e) => {
        setError(errorMessage(e));
        setStep("error");
      });
  }, []);

  useEffect(() => {
    if (step !== "done") return;
    void apiQuickstartState()
      .then((s) => {
        if (s.agents.length > 0) onAgentCreated?.();
      })
      .catch(() => {});
    let checks = 0;
    const id = window.setInterval(() => {
      checks++;
      if (checks > 15) {
        window.clearInterval(id);
        return;
      }
      void apiQuickstartState()
        .then((s) => {
          if (s.agents.length > 0) {
            window.clearInterval(id);
            onAgentCreated?.();
          }
        })
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(id);
  }, [step, onAgentCreated]);

  useEffect(() => {
    if (!providerType) return;
    void apiQuickstartFields({
      section: "model_provider",
      type_key: providerType,
    })
      .then((r) => {
        setFieldDescs(r.fields);
        const defaults: Record<string, string> = {};
        for (const f of r.fields) {
          if (f.default) defaults[f.key] = f.default;
        }
        setFieldValues((prev) => ({ ...defaults, ...prev }));
      })
      .catch(() => setFieldDescs([]));
  }, [providerType]);

  const riskOptions = useMemo(() => qsState?.risk_presets ?? [], [qsState]);
  const runtimeOptions = useMemo(() => qsState?.runtime_presets ?? [], [qsState]);

  const updateField = useCallback((key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setStep("validating");
    setError("");

    const fields: Record<string, string> = {};
    for (const f of fieldDescs) {
      const v = fieldValues[f.key] ?? "";
      if (f.required && !v) {
        setError(`Required field missing: ${f.label}`);
        setStep("form");
        return;
      }
      fields[f.key] = v;
    }

    const cleanChannels = channels
      .filter((c) => c.alias.trim() && c.channel_type)
      .map((c) => ({
        mode: "fresh" as const,
        value: {
          channel_type: c.channel_type,
          alias: c.alias.trim(),
          token: c.token.trim() || undefined,
        },
      }));
    const submission: BuilderSubmission = {
      model_provider: {
        mode: "fresh",
        value: {
          provider_type: providerType,
          alias: providerAlias.trim() || "default",
          model: model || "default",
          fields,
        },
      },
      risk_profile: { mode: riskMode, value: riskValue },
      runtime_profile: { mode: runtimeMode, value: runtimeValue },
      memory: { mode: memoryMode, value: memoryValue },
      channels: cleanChannels,
      peer_groups: peerGroups
        .filter((p) => p.name.trim() && p.channel.trim())
        .map(
          (p): QuickstartPeerGroup => ({
            name: p.name.trim(),
            channel: p.channel.trim(),
            external_peers: splitList(p.external_peers),
            ignore: splitList(p.ignore),
          }),
        ),
      agent: {
        name: agentName.trim() || "default",
        system_prompt: systemPrompt,
        personality_file: personalityFile || undefined,
        personality_files: personalityFiles.filter((p) => p.filename.trim()),
      },
    };

    try {
      const validateRes = await apiQuickstartValidate(submission);
      if (validateRes.kind === "errors") {
        setError(formatErrors(validateRes.errors));
        setStep("form");
        return;
      }
    } catch (e) {
      setError(`Validation failed: ${errorMessage(e)}`);
      setStep("form");
      return;
    }

    setStep("applying");
    try {
      const applyRes = await apiQuickstartApply(submission);
      if (applyRes.kind === "errors") {
        setError(formatErrors(applyRes.errors));
        setStep("form");
        return;
      }
      setStep("done");
      onAgentCreated?.();
    } catch (e) {
      setError(`Apply failed: ${errorMessage(e)}`);
      setStep("form");
    }
  }, [
    agentName,
    channels,
    fieldDescs,
    fieldValues,
    memoryMode,
    memoryValue,
    model,
    onAgentCreated,
    peerGroups,
    personalityFile,
    personalityFiles,
    providerAlias,
    providerType,
    riskMode,
    riskValue,
    runtimeMode,
    runtimeValue,
    systemPrompt,
  ]);

  if (step === "loading") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#020818]/90">
        <Loader2 size={20} className="animate-spin text-cyan-300" />
        <span className="ml-2 text-xs text-neutral-400">Loading setup...</span>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#020818]/90 p-8">
        <div className="max-w-sm rounded-lg border border-white/10 bg-white/[0.05]/50 p-6 text-center">
          <CheckCircle2 size={24} className="mx-auto mb-3 text-green-400" />
          <h3 className="mb-1 text-sm font-semibold text-neutral-100">Agent created</h3>
          <p className="mb-3 text-xs text-neutral-400">
            Waiting for the gateway to restart and load the new agent.
          </p>
          <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-500">
            <Loader2 size={12} className="animate-spin" />
            <span>Refreshing...</span>
          </div>
        </div>
      </div>
    );
  }

  if (step === "error" && !qsState) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#020818]/90 p-8">
        <div className="max-w-sm rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertCircle size={20} className="mx-auto mb-2 text-red-400" />
          <h3 className="mb-1 text-sm font-semibold text-red-200">Setup unavailable</h3>
          <p className="text-xs text-red-300/70">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#020818]/90 p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-300">
            <Bot size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-100">Quickstart Builder</h2>
            <p className="text-xs text-neutral-500">
              Create an agent, provider, runtime, memory, channels, and peer groups in one apply
              step.
            </p>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="Provider">
            <Field label="Provider type">
              <Select value={providerType} onChange={setProviderType}>
                {qsState?.model_provider_types.map((pt) => (
                  <option key={pt.kind} value={pt.kind}>
                    {pt.display_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Provider alias">
              <Input value={providerAlias} onChange={setProviderAlias} />
            </Field>
            <Field label="Model">
              <Input value={model} onChange={setModel} placeholder="e.g. gpt-5.1-code" />
            </Field>
            {fieldDescs.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`} help={f.help}>
                {f.enum_variants ? (
                  <Select
                    value={fieldValues[f.key] ?? f.default ?? ""}
                    onChange={(value) => updateField(f.key, value)}
                  >
                    {f.enum_variants.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    type={f.is_secret ? "password" : "text"}
                    value={fieldValues[f.key] ?? f.default ?? ""}
                    onChange={(value) => updateField(f.key, value)}
                    placeholder={f.default ?? ""}
                  />
                )}
              </Field>
            ))}
          </Panel>

          <Panel title="Agent">
            <Field label="Agent alias">
              <Input value={agentName} onChange={setAgentName} />
            </Field>
            <Field label="System prompt">
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={8}
                className="w-full resize-y rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-cyan-400"
              />
            </Field>
            {qsState && qsState.personality_files.length > 0 && (
              <Field label="Personality file">
                <Select value={personalityFile} onChange={setPersonalityFile}>
                  <option value="">none</option>
                  {qsState.personality_files.map((file) => (
                    <option key={file} value={file}>
                      {file}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </Panel>

          <Panel title="Runtime">
            <ChoiceRow
              mode={riskMode}
              value={riskValue}
              label="Risk profile"
              existing={qsState?.risk_profiles ?? []}
              fresh={riskOptions.map((r) => ({ key: r.key, label: r.label }))}
              onMode={setRiskMode}
              onValue={setRiskValue}
            />
            <ChoiceRow
              mode={runtimeMode}
              value={runtimeValue}
              label="Runtime profile"
              existing={qsState?.runtime_profiles ?? []}
              fresh={runtimeOptions.map((r) => ({ key: r.key, label: r.label }))}
              onMode={setRuntimeMode}
              onValue={setRuntimeValue}
            />
            <ChoiceRow
              mode={memoryMode}
              value={memoryValue}
              label="Memory"
              existing={qsState?.storage ?? []}
              fresh={(qsState?.memory_kinds ?? []).map((m) => ({
                key: m,
                label: m,
              }))}
              onMode={setMemoryMode}
              onValue={(value) => setMemoryValue(value as MemoryChoice)}
            />
          </Panel>

          <Panel
            title="Channels"
            action={
              <button
                type="button"
                onClick={() =>
                  setChannels((current) => [
                    ...current,
                    {
                      channel_type: qsState?.channel_types[0]?.kind ?? "",
                      alias: `channel_${current.length + 1}`,
                      token: "",
                    },
                  ])
                }
                className="rounded border border-white/10 p-1 text-neutral-400 hover:border-cyan-400 hover:text-cyan-300"
              >
                <Plus size={12} />
              </button>
            }
          >
            {channels.length === 0 && (
              <p className="text-xs text-neutral-500">No channels will be created.</p>
            )}
            {channels.map((channel, idx) => (
              <div key={idx} className="mb-3 rounded-md border border-white/10 p-3">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setChannels((current) => current.filter((_, i) => i !== idx))}
                    className="text-neutral-500 hover:text-red-300"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <Field label="Type">
                  <Select
                    value={channel.channel_type}
                    onChange={(value) =>
                      setChannels((current) =>
                        current.map((c, i) => (i === idx ? { ...c, channel_type: value } : c)),
                      )
                    }
                  >
                    {qsState?.channel_types.map((ct) => (
                      <option key={ct.kind} value={ct.kind}>
                        {ct.display_name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Alias">
                  <Input
                    value={channel.alias}
                    onChange={(value) =>
                      setChannels((current) =>
                        current.map((c, i) => (i === idx ? { ...c, alias: value } : c)),
                      )
                    }
                  />
                </Field>
                <Field label="Token">
                  <Input
                    type="password"
                    value={channel.token}
                    onChange={(value) =>
                      setChannels((current) =>
                        current.map((c, i) => (i === idx ? { ...c, token: value } : c)),
                      )
                    }
                    placeholder="optional"
                  />
                </Field>
              </div>
            ))}
          </Panel>

          <Panel
            title="Peer groups"
            action={
              <button
                type="button"
                onClick={() =>
                  setPeerGroups((current) => [
                    ...current,
                    {
                      name: `group_${current.length + 1}`,
                      channel: channels[0]?.alias ?? "",
                      external_peers: "",
                      ignore: "",
                    },
                  ])
                }
                className="rounded border border-white/10 p-1 text-neutral-400 hover:border-cyan-400 hover:text-cyan-300"
              >
                <Plus size={12} />
              </button>
            }
          >
            {peerGroups.length === 0 && (
              <p className="text-xs text-neutral-500">No peer groups will be created.</p>
            )}
            {peerGroups.map((peer, idx) => (
              <div key={idx} className="mb-3 rounded-md border border-white/10 p-3">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setPeerGroups((current) => current.filter((_, i) => i !== idx))}
                    className="text-neutral-500 hover:text-red-300"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <Field label="Name">
                  <Input
                    value={peer.name}
                    onChange={(value) =>
                      setPeerGroups((current) =>
                        current.map((p, i) => (i === idx ? { ...p, name: value } : p)),
                      )
                    }
                  />
                </Field>
                <Field label="Channel alias">
                  <Input
                    value={peer.channel}
                    onChange={(value) =>
                      setPeerGroups((current) =>
                        current.map((p, i) => (i === idx ? { ...p, channel: value } : p)),
                      )
                    }
                  />
                </Field>
                <Field label="External peers" help="Comma or newline separated">
                  <Input
                    value={peer.external_peers}
                    onChange={(value) =>
                      setPeerGroups((current) =>
                        current.map((p, i) => (i === idx ? { ...p, external_peers: value } : p)),
                      )
                    }
                  />
                </Field>
                <Field label="Ignore" help="Comma or newline separated">
                  <Input
                    value={peer.ignore}
                    onChange={(value) =>
                      setPeerGroups((current) =>
                        current.map((p, i) => (i === idx ? { ...p, ignore: value } : p)),
                      )
                    }
                  />
                </Field>
              </div>
            ))}
          </Panel>

          <Panel
            title="Personality files"
            action={
              <button
                type="button"
                onClick={() =>
                  setPersonalityFiles((current) => [
                    ...current,
                    { filename: `personality-${current.length + 1}.md`, content: "" },
                  ])
                }
                className="rounded border border-white/10 p-1 text-neutral-400 hover:border-cyan-400 hover:text-cyan-300"
              >
                <Plus size={12} />
              </button>
            }
          >
            {personalityFiles.length === 0 && (
              <p className="text-xs text-neutral-500">
                Add inline personality files when the gateway supports them.
              </p>
            )}
            {personalityFiles.map((file, idx) => (
              <div key={idx} className="mb-3 rounded-md border border-white/10 p-3">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setPersonalityFiles((current) => current.filter((_, i) => i !== idx))
                    }
                    className="text-neutral-500 hover:text-red-300"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <Field label="Filename">
                  <Input
                    value={file.filename}
                    onChange={(value) =>
                      setPersonalityFiles((current) =>
                        current.map((p, i) => (i === idx ? { ...p, filename: value } : p)),
                      )
                    }
                  />
                </Field>
                <Field label="Content">
                  <textarea
                    value={file.content}
                    onChange={(e) =>
                      setPersonalityFiles((current) =>
                        current.map((p, i) => (i === idx ? { ...p, content: e.target.value } : p)),
                      )
                    }
                    rows={5}
                    className="w-full resize-y rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-xs text-neutral-100 outline-none focus:border-cyan-400"
                  />
                </Field>
              </div>
            ))}
          </Panel>
        </section>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-white/10 bg-[#020818]/95 py-4">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={step === "validating" || step === "applying"}
            className="flex items-center justify-center gap-1.5 rounded-md bg-sky-400 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
          >
            {step === "validating" || step === "applying" ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                {step === "validating" ? "Validating..." : "Applying..."}
              </>
            ) : (
              "Apply Quickstart"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-neutral-100">{title}</h3>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-neutral-400">{label}</span>
      {children}
      {help && <span className="mt-1 block text-[10px] text-neutral-600">{help}</span>}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <span className="relative block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-cyan-400"
      >
        {children}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
      />
    </span>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400 outline-none focus:border-cyan-400"
    />
  );
}

function ChoiceRow({
  label,
  mode,
  value,
  existing,
  fresh,
  onMode,
  onValue,
}: {
  label: string;
  mode: "fresh" | "existing";
  value: string;
  existing: string[];
  fresh: Array<{ key: string; label: string }>;
  onMode: (mode: "fresh" | "existing") => void;
  onValue: (value: string) => void;
}) {
  const options = mode === "existing" ? existing.map((v) => ({ key: v, label: v })) : fresh;
  return (
    <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
      <Field label={`${label} mode`}>
        <Select
          value={mode}
          onChange={(next) => {
            const nextMode = next as "fresh" | "existing";
            onMode(nextMode);
            const nextOptions =
              nextMode === "existing" ? existing.map((v) => ({ key: v, label: v })) : fresh;
            if (nextOptions[0]) onValue(nextOptions[0].key);
          }}
        >
          <option value="fresh">fresh</option>
          <option value="existing" disabled={existing.length === 0}>
            existing
          </option>
        </Select>
      </Field>
      <Field label={label}>
        <Select value={value} onChange={onValue}>
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function splitList(value: string) {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatErrors(errors: Array<{ step: string; field: string; message: string }>) {
  return errors.map((e) => `${e.step}${e.field ? `.${e.field}` : ""}: ${e.message}`).join("; ");
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
