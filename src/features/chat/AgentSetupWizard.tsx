// Agent Setup Wizard — inline quickstart for the Chat panel.
//
// Calls the gateway's /api/quickstart endpoints so users never need the CLI.
// Renders a single-page form (modelled on the web dashboard Agent Setup) that
// submits a BuilderSubmission through /api/quickstart/apply.

import { useEffect, useState, useCallback } from "react";
import {
  apiQuickstartState,
  apiQuickstartFields,
  apiQuickstartValidate,
  apiQuickstartApply,
} from "@/api/client";
import type {
  QuickstartState,
  FieldDescriptor,
  BuilderSubmission,
} from "@/api/client";
import { Bot, Loader2, AlertCircle, CheckCircle2, ChevronDown } from "lucide-react";

type WizardStep = "loading" | "form" | "validating" | "applying" | "done" | "error";

interface AgentSetupWizardProps {
  onAgentCreated?: () => void;
}

export function AgentSetupWizard({ onAgentCreated }: AgentSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>("loading");
  const [qsState, setQsState] = useState<QuickstartState | null>(null);
  const [error, setError] = useState<string>("");
  const [fieldDescs, setFieldDescs] = useState<FieldDescriptor[]>([]);

  // Form state
  const [providerType, setProviderType] = useState("");
  const [model, setModel] = useState("");
  const [agentName, setAgentName] = useState("default");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant.",
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Load quickstart state on mount
  useEffect(() => {
    void apiQuickstartState()
      .then((s) => {
        setQsState(s);
        if (s.model_provider_types.length > 0) {
          const first = s.model_provider_types[0].kind;
          setProviderType(first);
        }
        setStep("form");
      })
      .catch((e) => {
        setError(String(e));
        setStep("error");
      });
  }, []);

  // Poll quickstart state after apply succeeds — gateway reload is async and
  // can take 1-3s. Keep notifying parent until agents appear and the wizard
  // gets unmounted.
  useEffect(() => {
    if (step !== "done") return;
    // immediate first check
    void apiQuickstartState()
      .then((s) => {
        if (s.agents.length > 0) onAgentCreated?.();
      })
      .catch(() => {});
    // then poll every 2s up to 30s
    let checks = 0;
    const id = setInterval(() => {
      checks++;
      if (checks > 15) {
        clearInterval(id);
        return;
      }
      void apiQuickstartState()
        .then((s) => {
          if (s.agents.length > 0) {
            clearInterval(id);
            onAgentCreated?.();
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [step, onAgentCreated]);

  // Fetch field descriptors when provider type changes
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

    const submission: BuilderSubmission = {
      model_provider: {
        mode: "fresh",
        value: {
          provider_type: providerType,
          alias: "default",
          model: model || "default",
          fields,
        },
      },
      risk_profile: { mode: "fresh", value: "locked_down" },
      runtime_profile: { mode: "fresh", value: "balanced" },
      memory: { mode: "fresh", value: "sqlite" },
      channels: [],
      peer_groups: [],
      agent: {
        name: agentName || "default",
        system_prompt: systemPrompt,
      },
    };

    try {
      const validateRes = await apiQuickstartValidate(submission);
      if (validateRes.kind === "errors") {
        const msgs = validateRes.errors.map(
          (e) => `${e.step}${e.field ? `.${e.field}` : ""}: ${e.message}`,
        );
        setError(msgs.join("; "));
        setStep("form");
        return;
      }
    } catch (e) {
      setError(`Validation failed: ${String(e)}`);
      setStep("form");
      return;
    }

    setStep("applying");
    try {
      const applyRes = await apiQuickstartApply(submission);
      if (applyRes.kind === "errors") {
        const msgs = applyRes.errors.map(
          (e) => `${e.step}${e.field ? `.${e.field}` : ""}: ${e.message}`,
        );
        setError(msgs.join("; "));
        setStep("form");
        return;
      }
      setStep("done");
      onAgentCreated?.();
    } catch (e) {
      setError(`Apply failed: ${String(e)}`);
      setStep("form");
    }
  }, [
    fieldDescs,
    fieldValues,
    providerType,
    model,
    agentName,
    systemPrompt,
    onAgentCreated,
  ]);

  if (step === "loading") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-neutral-950">
        <Loader2 size={20} className="animate-spin text-orange-400" />
        <span className="ml-2 text-xs text-neutral-400">Loading setup…</span>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-neutral-950 p-8">
        <div className="max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-400">
            <CheckCircle2 size={20} />
          </div>
          <h3 className="mb-1 text-sm font-semibold text-neutral-100">
            Agent created
          </h3>
          <p className="mb-3 text-xs text-neutral-400">
            Waiting for the gateway to restart and load the new agent…
          </p>
          <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-500">
            <Loader2 size={12} className="animate-spin" />
            <span>Refreshing…</span>
          </div>
        </div>
      </div>
    );
  }

  if (step === "error" && !qsState) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-neutral-950 p-8">
        <div className="max-w-sm rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertCircle size={20} className="mx-auto mb-2 text-red-400" />
          <h3 className="mb-1 text-sm font-semibold text-red-200">
            Setup unavailable
          </h3>
          <p className="text-xs text-red-300/70">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-neutral-950 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-300">
            <Bot size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">
              Agent Setup
            </h2>
            <p className="text-[11px] text-neutral-500">
              Configure your first agent to start chatting
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Provider type */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-neutral-400">
              Provider
            </label>
            <div className="relative">
              <select
                value={providerType}
                onChange={(e) => setProviderType(e.target.value)}
                className="w-full appearance-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-orange-500"
              >
                {qsState?.model_provider_types.map((pt) => (
                  <option key={pt.kind} value={pt.kind}>
                    {pt.display_name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
              />
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-neutral-400">
              Model
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. claude-sonnet-4-6"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-orange-500"
            />
          </div>

          {/* Dynamic provider fields */}
          {fieldDescs.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-[11px] font-medium text-neutral-400">
                {f.label}
                {f.required && (
                  <span className="ml-0.5 text-red-400">*</span>
                )}
              </label>
              {f.enum_variants ? (
                <div className="relative">
                  <select
                    value={fieldValues[f.key] ?? f.default ?? ""}
                    onChange={(e) => updateField(f.key, e.target.value)}
                    className="w-full appearance-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-orange-500"
                  >
                    {f.enum_variants.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={12}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
                  />
                </div>
              ) : (
                <input
                  type={f.is_secret ? "password" : "text"}
                  value={fieldValues[f.key] ?? f.default ?? ""}
                  onChange={(e) => updateField(f.key, e.target.value)}
                  placeholder={f.help || f.default || ""}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-orange-500"
                />
              )}
              {f.help && !f.enum_variants && (
                <p className="mt-1 text-[10px] text-neutral-600">{f.help}</p>
              )}
            </div>
          ))}

          {/* Agent name */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-neutral-400">
              Agent Name
            </label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="default"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-orange-500"
            />
          </div>

          {/* System prompt */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-neutral-400">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-orange-500"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={step === "validating" || step === "applying"}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-neutral-950 hover:bg-orange-400 disabled:opacity-50"
          >
            {step === "validating" || step === "applying" ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                {step === "validating" ? "Validating…" : "Applying…"}
              </>
            ) : (
              "Save Agent"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
