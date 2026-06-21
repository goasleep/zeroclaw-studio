// Agent Setup Wizard — guided quickstart builder for the workspace surface.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { apiPersonalityTemplates } from "@/api/personality";
import {
  apiQuickstartApply,
  apiQuickstartFields,
  apiQuickstartState,
  apiQuickstartValidate,
  normalizeQuickstartPreset,
  type BuilderSubmission,
  type FieldDescriptor,
  type MemoryChoice,
  type QuickstartPeerGroup,
  type QuickstartState,
} from "@/api/quickstart";
import {
  DraftCard,
  Field,
  Input,
  ModeRow,
  Panel,
  Select,
  Shell,
  StepButton,
} from "./agent-setup-wizard/components";
import {
  ALL_STEPS,
  REQUIRED_STEPS,
  type AgentSetupWizardProps,
  type ChannelDraft,
  type ChoiceMode,
  type PeerDraft,
  type PersonalityDraft,
  type PersonalityMode,
  type StepId,
  type WizardStatus,
} from "./agent-setup-wizard/types";
import { ExistingOrPresetStep } from "./agent-setup-wizard/ExistingOrPresetStep";
import { errorMessage, formatErrors, splitList } from "./agent-setup-wizard/utils";

export function AgentSetupWizard({
  onAgentCreated,
  onCancel,
  surface = "chat",
}: AgentSetupWizardProps) {
  const { t } = useLingui();
  const [status, setStatus] = useState<WizardStatus>("loading");
  const [activeStep, setActiveStep] = useState<StepId>("provider");
  const [qsState, setQsState] = useState<QuickstartState | null>(null);
  const [error, setError] = useState("");
  const [fieldDescs, setFieldDescs] = useState<FieldDescriptor[]>([]);
  const [templates, setTemplates] = useState<Record<string, string>>({});

  const [providerMode, setProviderMode] = useState<ChoiceMode>("fresh");
  const [providerExisting, setProviderExisting] = useState("");
  const [providerType, setProviderType] = useState("");
  const [providerAlias, setProviderAlias] = useState("default");
  const [model, setModel] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const [riskMode, setRiskMode] = useState<ChoiceMode>("fresh");
  const [riskValue, setRiskValue] = useState("");
  const [runtimeMode, setRuntimeMode] = useState<ChoiceMode>("fresh");
  const [runtimeValue, setRuntimeValue] = useState("");
  const [memoryMode, setMemoryMode] = useState<ChoiceMode>("fresh");
  const [memoryValue, setMemoryValue] = useState("");

  const [channelsVisited, setChannelsVisited] = useState(false);
  const [channels, setChannels] = useState<ChannelDraft[]>([]);
  const [peerGroups, setPeerGroups] = useState<PeerDraft[]>([]);

  const [agentName, setAgentName] = useState("default");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.");
  const [personalityFiles, setPersonalityFiles] = useState<Record<string, PersonalityDraft>>({});

  useEffect(() => {
    let cancelled = false;
    void apiQuickstartState()
      .then((s) => {
        if (cancelled) return;
        setQsState(s);

        const firstProviderType = s.model_provider_types[0]?.kind ?? "";
        setProviderType(firstProviderType);
        setProviderExisting(s.model_providers[0] ?? "");
        setProviderMode(s.model_providers.length > 0 ? "existing" : "fresh");

        const riskPresets = s.risk_presets.map(normalizeQuickstartPreset).filter((p) => p.key);
        setRiskMode(riskPresets.length > 0 ? "fresh" : "existing");
        setRiskValue(riskPresets[0]?.key ?? s.risk_profiles[0] ?? "");

        const runtimePresets = s.runtime_presets
          .map(normalizeQuickstartPreset)
          .filter((p) => p.key);
        setRuntimeMode(runtimePresets.length > 0 ? "fresh" : "existing");
        setRuntimeValue(runtimePresets[0]?.key ?? s.runtime_profiles[0] ?? "");

        setMemoryMode(s.storage.length > 0 ? "existing" : "fresh");
        setMemoryValue(s.storage[0] ?? s.memory_kinds[0] ?? "sqlite");
        setPersonalityFiles(
          Object.fromEntries(
            s.personality_files.map((filename) => [filename, { mode: "skip", content: "" }]),
          ),
        );
        setStatus("form");

        void apiPersonalityTemplates({ agent_name: "default" })
          .then((result) => {
            if (cancelled) return;
            setTemplates(
              Object.fromEntries(result.files.map((file) => [file.filename, file.content])),
            );
          })
          .catch(() => {
            if (!cancelled) setTemplates({});
          });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(errorMessage(e));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "done") return;
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
  }, [status, onAgentCreated]);

  useEffect(() => {
    if (providerMode !== "fresh" || !providerType) {
      setFieldDescs([]);
      return;
    }
    let cancelled = false;
    void apiQuickstartFields({
      section: "model_provider",
      type_key: providerType,
    })
      .then((r) => {
        if (cancelled) return;
        setFieldDescs(r.fields);
        const defaults: Record<string, string> = {};
        for (const f of r.fields) {
          if (f.default) defaults[f.key] = f.default;
        }
        setFieldValues((prev) => ({ ...defaults, ...prev }));
      })
      .catch(() => {
        if (!cancelled) setFieldDescs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [providerMode, providerType]);

  const riskOptions = useMemo(
    () => qsState?.risk_presets.map(normalizeQuickstartPreset).filter((p) => p.key) ?? [],
    [qsState],
  );
  const runtimeOptions = useMemo(
    () => qsState?.runtime_presets.map(normalizeQuickstartPreset).filter((p) => p.key) ?? [],
    [qsState],
  );

  const selectedChannelRefs = useMemo(
    () =>
      channels
        .map((channel) => {
          if (channel.mode === "existing") return channel.existingRef.trim();
          if (!channel.channel_type || !channel.alias.trim()) return "";
          return `${channel.channel_type}.${channel.alias.trim()}`;
        })
        .filter(Boolean),
    [channels],
  );

  const stepState = useMemo<Record<StepId, { done: boolean; detail: string }>>(() => {
    const providerDone =
      providerMode === "existing"
        ? Boolean(providerExisting)
        : Boolean(providerType && providerAlias.trim() && model.trim()) &&
          fieldDescs.every(
            (field) => !field.required || Boolean((fieldValues[field.key] ?? "").trim()),
          );
    const riskDone = riskMode === "existing" ? Boolean(riskValue) : Boolean(riskValue);
    const runtimeDone = runtimeMode === "existing" ? Boolean(runtimeValue) : Boolean(runtimeValue);
    const memoryDone = memoryMode === "existing" ? Boolean(memoryValue) : Boolean(memoryValue);
    const channelsValid = channels.every((channel) =>
      channel.mode === "existing"
        ? Boolean(channel.existingRef)
        : Boolean(channel.channel_type && channel.alias.trim()),
    );
    const channelsDone = channelsVisited && channelsValid;
    const agentDone = Boolean(agentName.trim());
    return {
      provider: {
        done: providerDone,
        detail:
          providerMode === "existing"
            ? providerExisting || t`Not selected`
            : providerType
              ? `${providerType}.${providerAlias.trim() || "?"}`
              : t`Not selected`,
      },
      risk: { done: riskDone, detail: riskValue || t`Not selected` },
      runtime: { done: runtimeDone, detail: runtimeValue || t`Not selected` },
      memory: { done: memoryDone, detail: memoryValue || t`Not selected` },
      channels: {
        done: channelsDone,
        detail: channelsVisited
          ? channels.length > 0
            ? t`${channels.length} selected`
            : t`none`
          : t`Not reviewed`,
      },
      agent: { done: agentDone, detail: agentName.trim() || t`Not named` },
      peer_groups: {
        done: true,
        detail: peerGroups.length > 0 ? t`${peerGroups.length} groups` : t`optional`,
      },
    };
  }, [
    agentName,
    channels,
    channelsVisited,
    fieldDescs,
    fieldValues,
    memoryMode,
    memoryValue,
    model,
    peerGroups.length,
    providerAlias,
    providerExisting,
    providerMode,
    providerType,
    riskMode,
    riskValue,
    runtimeMode,
    runtimeValue,
    t,
  ]);

  const canCreate = REQUIRED_STEPS.every((step) => stepState[step].done);
  const busy = status === "validating" || status === "applying";

  const openStep = useCallback((step: StepId) => {
    if (step === "channels") setChannelsVisited(true);
    setActiveStep(step);
  }, []);

  const updateField = useCallback((key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const addChannel = useCallback(() => {
    if (!qsState) return;
    const firstExisting = qsState.unassigned_channels[0] ?? "";
    const firstType = qsState.channel_types[0]?.kind ?? "";
    setChannels((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        mode: firstExisting ? "existing" : "fresh",
        existingRef: firstExisting,
        channel_type: firstType,
        alias: `channel_${current.length + 1}`,
        token: "",
      },
    ]);
    setChannelsVisited(true);
  }, [qsState]);

  const addPeerGroup = useCallback(() => {
    const firstChannel = selectedChannelRefs[0] ?? "";
    setPeerGroups((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        name: `group_${current.length + 1}`,
        channel: firstChannel,
        external_peers: "",
        ignore: "",
      },
    ]);
  }, [selectedChannelRefs]);

  const setPersonalityMode = useCallback(
    (filename: string, mode: PersonalityMode) => {
      setPersonalityFiles((current) => {
        const previous = current[filename] ?? { mode: "skip", content: "" };
        const content =
          mode === "template"
            ? (templates[filename] ?? previous.content)
            : mode === "scratch"
              ? ""
              : "";
        return { ...current, [filename]: { mode, content } };
      });
    },
    [templates],
  );

  const buildSubmission = useCallback((): BuilderSubmission | null => {
    if (!qsState) return null;
    const fields: Record<string, string> = {};
    if (providerMode === "fresh") {
      for (const field of fieldDescs) {
        const value = fieldValues[field.key] ?? "";
        if (field.required && !value.trim()) {
          setError(t`Required field missing: ${field.label}`);
          return null;
        }
        fields[field.key] = value;
      }
    }

    const personalitySubmissions = Object.entries(personalityFiles)
      .filter(([, file]) => file.mode !== "skip")
      .map(([filename, file]) => ({ filename, content: file.content }));

    return {
      model_provider:
        providerMode === "existing"
          ? { mode: "existing", value: providerExisting }
          : {
              mode: "fresh",
              value: {
                provider_type: providerType,
                alias: providerAlias.trim() || "default",
                model: model.trim(),
                fields,
              },
            },
      risk_profile: { mode: riskMode, value: riskValue },
      runtime_profile: { mode: runtimeMode, value: runtimeValue },
      memory: { mode: memoryMode, value: memoryValue as MemoryChoice },
      channels: channels
        .filter((channel) =>
          channel.mode === "existing"
            ? channel.existingRef.trim()
            : channel.channel_type && channel.alias.trim(),
        )
        .map((channel) =>
          channel.mode === "existing"
            ? ({ mode: "existing", value: channel.existingRef.trim() } as const)
            : ({
                mode: "fresh",
                value: {
                  channel_type: channel.channel_type,
                  alias: channel.alias.trim(),
                  token: channel.token.trim() || undefined,
                },
              } as const),
        ),
      peer_groups: peerGroups
        .filter((peer) => peer.name.trim() && peer.channel.trim())
        .map(
          (peer): QuickstartPeerGroup => ({
            name: peer.name.trim(),
            channel: peer.channel.trim(),
            external_peers: splitList(peer.external_peers),
            ignore: splitList(peer.ignore),
          }),
        ),
      agent: {
        name: agentName.trim() || "default",
        system_prompt: systemPrompt,
        personality_files: personalitySubmissions,
      },
    };
  }, [
    agentName,
    channels,
    fieldDescs,
    fieldValues,
    memoryMode,
    memoryValue,
    model,
    peerGroups,
    personalityFiles,
    providerAlias,
    providerExisting,
    providerMode,
    providerType,
    qsState,
    riskMode,
    riskValue,
    runtimeMode,
    runtimeValue,
    systemPrompt,
    t,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!canCreate || busy) return;
    setStatus("validating");
    setError("");
    const submission = buildSubmission();
    if (!submission) {
      setStatus("form");
      return;
    }

    try {
      const validateRes = await apiQuickstartValidate(submission);
      if (validateRes.kind === "errors") {
        setError(formatErrors(validateRes.errors));
        setStatus("form");
        return;
      }
    } catch (e) {
      setError(t`Validation failed: ${errorMessage(e)}`);
      setStatus("form");
      return;
    }

    setStatus("applying");
    try {
      const applyRes = await apiQuickstartApply(submission);
      if (applyRes.kind === "errors") {
        setError(formatErrors(applyRes.errors));
        setStatus("form");
        return;
      }
      setStatus("done");
      onAgentCreated?.();
    } catch (e) {
      setError(t`Apply failed: ${errorMessage(e)}`);
      setStatus("form");
    }
  }, [buildSubmission, busy, canCreate, onAgentCreated, t]);

  if (status === "loading") {
    return (
      <Shell surface={surface}>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Loader2 size={20} className="animate-spin text-cyan-300" />
          <span className="ml-2 text-xs text-neutral-400">{t`Loading setup...`}</span>
        </div>
      </Shell>
    );
  }

  if (status === "done") {
    return (
      <Shell surface={surface}>
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="max-w-sm rounded-lg border border-white/10 bg-white/[0.05]/50 p-6 text-center">
            <CheckCircle2 size={24} className="mx-auto mb-3 text-green-400" />
            <h3 className="mb-1 text-sm font-semibold text-neutral-100">{t`Agent created`}</h3>
            <p className="mb-3 text-xs text-neutral-400">
              {t`Waiting for the gateway to restart and load the new agent.`}
            </p>
            <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-500">
              <Loader2 size={12} className="animate-spin" />
              <span>{t`Refreshing...`}</span>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  if (status === "error" && !qsState) {
    return (
      <Shell surface={surface}>
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="max-w-sm rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
            <AlertCircle size={20} className="mx-auto mb-2 text-red-400" />
            <h3 className="mb-1 text-sm font-semibold text-red-200">{t`Setup unavailable`}</h3>
            <p className="text-xs text-red-300/70">{error}</p>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell surface={surface}>
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-300">
              <Bot size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-neutral-100">{t`Create agent`}</h2>
              <p className="mt-1 text-xs text-neutral-500">
                {t`Complete the same quickstart steps used by the CLI, then apply everything at once.`}
              </p>
            </div>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className={
                surface === "chat"
                  ? "inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-100"
                  : "inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-neutral-400 hover:border-cyan-400/50 hover:text-cyan-100"
              }
              aria-label={surface === "chat" ? t`Back to task` : t`Close`}
            >
              {surface === "chat" ? (
                <>
                  <ArrowLeft size={13} />
                  <span>{t`Back to task`}</span>
                </>
              ) : (
                <X size={14} />
              )}
            </button>
          )}
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {error}
          </div>
        )}
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 p-4 lg:border-b-0 lg:border-r">
          <div className="space-y-2">
            {ALL_STEPS.map((step) => (
              <StepButton
                key={step}
                id={step}
                active={activeStep === step}
                done={stepState[step].done}
                detail={stepState[step].detail}
                optional={step === "peer_groups"}
                onClick={() => openStep(step)}
              />
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-auto p-5 zc-scrollbar">
          <div className="mx-auto max-w-3xl space-y-5">
            {activeStep === "provider" && qsState && (
              <Panel title={t`Provider`}>
                <ModeRow
                  mode={providerMode}
                  existingDisabled={qsState.model_providers.length === 0}
                  freshDisabled={qsState.model_provider_types.length === 0}
                  onMode={(mode) => {
                    setProviderMode(mode);
                    if (mode === "existing") setProviderExisting(qsState.model_providers[0] ?? "");
                  }}
                />
                {providerMode === "existing" ? (
                  <Field label={t`Model provider`}>
                    <Select value={providerExisting} onChange={setProviderExisting}>
                      {qsState.model_providers.map((ref) => (
                        <option key={ref} value={ref}>
                          {ref}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <>
                    <Field label={t`Provider type`}>
                      <Select value={providerType} onChange={setProviderType}>
                        {qsState.model_provider_types.map((pt) => (
                          <option key={pt.kind} value={pt.kind}>
                            {pt.display_name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t`Provider alias`}>
                      <Input value={providerAlias} onChange={setProviderAlias} />
                    </Field>
                    <Field label={t`Model`}>
                      <Input value={model} onChange={setModel} placeholder="e.g. gpt-5.1-code" />
                    </Field>
                    {fieldDescs.map((field) => (
                      <Field
                        key={field.key}
                        label={`${field.label}${field.required ? " *" : ""}`}
                        help={field.help}
                      >
                        {field.enum_variants ? (
                          <Select
                            value={fieldValues[field.key] ?? field.default ?? ""}
                            onChange={(value) => updateField(field.key, value)}
                          >
                            {field.enum_variants.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Input
                            type={field.is_secret ? "password" : "text"}
                            value={fieldValues[field.key] ?? field.default ?? ""}
                            onChange={(value) => updateField(field.key, value)}
                            placeholder={field.default ?? ""}
                          />
                        )}
                      </Field>
                    ))}
                  </>
                )}
              </Panel>
            )}

            {activeStep === "risk" && qsState && (
              <ExistingOrPresetStep
                title={t`Risk profile`}
                mode={riskMode}
                value={riskValue}
                existing={qsState.risk_profiles}
                fresh={riskOptions}
                onMode={setRiskMode}
                onValue={setRiskValue}
              />
            )}

            {activeStep === "runtime" && qsState && (
              <ExistingOrPresetStep
                title={t`Runtime profile`}
                mode={runtimeMode}
                value={runtimeValue}
                existing={qsState.runtime_profiles}
                fresh={runtimeOptions}
                onMode={setRuntimeMode}
                onValue={setRuntimeValue}
              />
            )}

            {activeStep === "memory" && qsState && (
              <ExistingOrPresetStep
                title={t`Memory`}
                mode={memoryMode}
                value={memoryValue}
                existing={qsState.storage}
                fresh={qsState.memory_kinds.map((kind) => ({
                  key: kind,
                  label: kind,
                  description: "",
                }))}
                onMode={setMemoryMode}
                onValue={setMemoryValue}
              />
            )}

            {activeStep === "channels" && qsState && (
              <Panel
                title={t`Channels`}
                action={
                  <button
                    type="button"
                    onClick={addChannel}
                    disabled={
                      qsState.unassigned_channels.length === 0 && qsState.channel_types.length === 0
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus size={12} />
                    {t`Add`}
                  </button>
                }
              >
                {channels.length === 0 && (
                  <p className="rounded-md border border-dashed border-white/10 bg-white/[0.025] p-3 text-xs text-neutral-500">
                    {t`No channels will be created or attached.`}
                  </p>
                )}
                {channels.map((channel) => (
                  <DraftCard
                    key={channel.id}
                    onRemove={() =>
                      setChannels((current) => current.filter((c) => c.id !== channel.id))
                    }
                  >
                    <ModeRow
                      mode={channel.mode}
                      existingDisabled={qsState.unassigned_channels.length === 0}
                      freshDisabled={qsState.channel_types.length === 0}
                      onMode={(mode) =>
                        setChannels((current) =>
                          current.map((item) =>
                            item.id === channel.id
                              ? {
                                  ...item,
                                  mode,
                                  existingRef:
                                    mode === "existing"
                                      ? (qsState.unassigned_channels[0] ?? item.existingRef)
                                      : item.existingRef,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                    {channel.mode === "existing" ? (
                      <Field label={t`Channel`}>
                        <Select
                          value={channel.existingRef}
                          onChange={(value) =>
                            setChannels((current) =>
                              current.map((item) =>
                                item.id === channel.id ? { ...item, existingRef: value } : item,
                              ),
                            )
                          }
                        >
                          {qsState.unassigned_channels.map((ref) => (
                            <option key={ref} value={ref}>
                              {ref}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : (
                      <>
                        <Field label={t`Type`}>
                          <Select
                            value={channel.channel_type}
                            onChange={(value) =>
                              setChannels((current) =>
                                current.map((item) =>
                                  item.id === channel.id ? { ...item, channel_type: value } : item,
                                ),
                              )
                            }
                          >
                            {qsState.channel_types.map((ct) => (
                              <option key={ct.kind} value={ct.kind}>
                                {ct.display_name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label={t`Alias`}>
                          <Input
                            value={channel.alias}
                            onChange={(value) =>
                              setChannels((current) =>
                                current.map((item) =>
                                  item.id === channel.id ? { ...item, alias: value } : item,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label={t`Token`}>
                          <Input
                            type="password"
                            value={channel.token}
                            onChange={(value) =>
                              setChannels((current) =>
                                current.map((item) =>
                                  item.id === channel.id ? { ...item, token: value } : item,
                                ),
                              )
                            }
                            placeholder={t`optional`}
                          />
                        </Field>
                      </>
                    )}
                    <p className="text-[10px] text-neutral-600">
                      {channel.mode === "fresh"
                        ? `${channel.channel_type}.${channel.alias.trim() || "?"}`
                        : channel.existingRef || t`Not selected`}
                    </p>
                  </DraftCard>
                ))}
                {channelsVisited && (
                  <p className="text-[11px] text-green-300">
                    {channels.length > 0 ? t`Channels reviewed.` : t`Channels reviewed: none.`}
                  </p>
                )}
              </Panel>
            )}

            {activeStep === "agent" && qsState && (
              <Panel title={t`Agent identity`}>
                <Field label={t`Agent alias`}>
                  <Input value={agentName} onChange={setAgentName} />
                </Field>
                <Field label={t`System prompt`}>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={8}
                    className="w-full resize-y rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-cyan-400"
                  />
                </Field>
                {qsState.personality_files.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-neutral-300">{t`Personality files`}</div>
                    {qsState.personality_files.map((filename) => {
                      const draft = personalityFiles[filename] ?? { mode: "skip", content: "" };
                      return (
                        <div key={filename} className="rounded-md border border-white/10 p-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs text-neutral-200">{filename}</span>
                            <Select
                              value={draft.mode}
                              onChange={(value) =>
                                setPersonalityMode(filename, value as PersonalityMode)
                              }
                            >
                              <option value="template">{t`Start with template`}</option>
                              <option value="scratch">{t`Start from scratch`}</option>
                              <option value="skip">{t`Skip`}</option>
                            </Select>
                          </div>
                          {draft.mode !== "skip" && (
                            <textarea
                              value={draft.content}
                              onChange={(e) =>
                                setPersonalityFiles((current) => ({
                                  ...current,
                                  [filename]: { ...draft, content: e.target.value },
                                }))
                              }
                              rows={8}
                              className="w-full resize-y rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-xs text-neutral-100 outline-none focus:border-cyan-400"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            )}

            {activeStep === "peer_groups" && (
              <Panel
                title={t`Peer groups`}
                action={
                  <button
                    type="button"
                    onClick={addPeerGroup}
                    disabled={selectedChannelRefs.length === 0}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus size={12} />
                    {t`Add`}
                  </button>
                }
              >
                {selectedChannelRefs.length === 0 && (
                  <p className="rounded-md border border-dashed border-white/10 bg-white/[0.025] p-3 text-xs text-neutral-500">
                    {t`Add or attach a channel before creating peer groups.`}
                  </p>
                )}
                {peerGroups.length === 0 && selectedChannelRefs.length > 0 && (
                  <p className="rounded-md border border-dashed border-white/10 bg-white/[0.025] p-3 text-xs text-neutral-500">
                    {t`Peer groups are optional and will not block agent creation.`}
                  </p>
                )}
                {peerGroups.map((peer) => (
                  <DraftCard
                    key={peer.id}
                    onRemove={() =>
                      setPeerGroups((current) => current.filter((item) => item.id !== peer.id))
                    }
                  >
                    <Field label={t`Name`}>
                      <Input
                        value={peer.name}
                        onChange={(value) =>
                          setPeerGroups((current) =>
                            current.map((item) =>
                              item.id === peer.id ? { ...item, name: value } : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label={t`Channel`}>
                      <Select
                        value={peer.channel}
                        onChange={(value) =>
                          setPeerGroups((current) =>
                            current.map((item) =>
                              item.id === peer.id ? { ...item, channel: value } : item,
                            ),
                          )
                        }
                      >
                        {selectedChannelRefs.map((ref) => (
                          <option key={ref} value={ref}>
                            {ref}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t`External peers`} help={t`Comma or newline separated`}>
                      <Input
                        value={peer.external_peers}
                        onChange={(value) =>
                          setPeerGroups((current) =>
                            current.map((item) =>
                              item.id === peer.id ? { ...item, external_peers: value } : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label={t`Ignore`} help={t`Comma or newline separated`}>
                      <Input
                        value={peer.ignore}
                        onChange={(value) =>
                          setPeerGroups((current) =>
                            current.map((item) =>
                              item.id === peer.id ? { ...item, ignore: value } : item,
                            ),
                          )
                        }
                      />
                    </Field>
                  </DraftCard>
                ))}
              </Panel>
            )}
          </div>
        </main>
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-[#020818]/95 px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-neutral-500">
            {REQUIRED_STEPS.filter((step) => stepState[step].done).length} / {REQUIRED_STEPS.length}{" "}
            {t`required steps ready`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const index = ALL_STEPS.indexOf(activeStep);
                const next = ALL_STEPS[Math.min(index + 1, ALL_STEPS.length - 1)];
                openStep(next);
              }}
              disabled={activeStep === ALL_STEPS[ALL_STEPS.length - 1]}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t`Next`}
              <ChevronRight size={13} />
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canCreate || busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-400 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  {status === "validating" ? t`Validating...` : t`Applying...`}
                </>
              ) : (
                t`Create agent`
              )}
            </button>
          </div>
        </div>
      </footer>
    </Shell>
  );
}
