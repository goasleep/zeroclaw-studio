import { apiFetch } from "./base";

export type ConfigSectionShape =
  | "direct_form"
  | "one_tier_alias_map"
  | "typed_family_map"
  | "backend_picker";

export interface ConfigSectionInfo {
  key: string;
  label: string;
  help: string;
  has_picker: boolean;
  completed: boolean;
  ready: boolean;
  group: string;
  is_quickstart: boolean;
  shape?: ConfigSectionShape | null;
}

export interface ConfigListEntry {
  path: string;
  category: string;
  kind: string;
  type_hint: string;
  value?: unknown;
  populated: boolean;
  is_secret: boolean;
  is_env_overridden?: boolean;
  enum_variants?: string[];
  section?: string;
  tab?: string;
}

export interface PickerItem {
  key: string;
  label: string;
  description?: string;
  badge?: string;
}

export interface ConfigListResponse {
  entries: ConfigListEntry[];
  drifted?: Array<{ path: string; [k: string]: unknown }>;
}

export interface SelectItemResponse {
  fields_prefix: string;
  created: boolean;
}

export interface PatchOp {
  op: "add" | "replace" | "remove" | "test" | "comment";
  path: string;
  value?: unknown;
  comment?: string;
}

export interface ConfigTemplate {
  key?: string;
  name?: string;
  label?: string;
  description?: string;
  section?: string;
  family?: string;
  type?: string;
  values?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface ConfigMapKey {
  key: string;
  label?: string;
  type?: string;
  path?: string;
  [k: string]: unknown;
}

export interface SkillBundle {
  id?: string;
  name?: string;
  bundles?: SkillBundle[];
  skills?: Array<{ id?: string; name?: string; enabled?: boolean; [k: string]: unknown }>;
  [k: string]: unknown;
}

export const apiConfigSections = () =>
  apiFetch<{ sections: ConfigSectionInfo[] }>("/api/config/sections");

export const apiConfigPicker = (section: string) =>
  apiFetch<{ section: string; items: PickerItem[]; help: string }>(
    `/api/config/sections/${encodeURIComponent(section)}`,
  );

export const apiConfigSelectItem = (section: string, key: string, alias?: string) =>
  apiFetch<SelectItemResponse>(
    `/api/config/sections/${encodeURIComponent(section)}/items/${encodeURIComponent(key)}`,
    {
      method: "POST",
      body: alias ? JSON.stringify({ alias }) : undefined,
    },
  );

export const apiConfigList = (prefix?: string) =>
  apiFetch<ConfigListResponse>(
    `/api/config/list${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`,
  );

export const apiConfigPatch = (ops: PatchOp[]) =>
  apiFetch<{ saved: boolean; results: unknown[]; warnings?: unknown[] }>("/api/config", {
    method: "PATCH",
    body: JSON.stringify(ops),
  });

export const apiConfigProp = (path: string, reveal = false) =>
  apiFetch<{ value?: unknown; populated?: boolean; is_secret?: boolean }>(
    `/api/config/prop?path=${encodeURIComponent(path)}${reveal ? "&reveal=true" : ""}`,
  );

export const apiConfigPutProp = (path: string, value: unknown) =>
  apiFetch<{ saved?: boolean }>(`/api/config/prop?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({ path, value }),
  });

export const apiConfigDeleteProp = (path: string) =>
  apiFetch<{ saved?: boolean }>(`/api/config/prop?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  });

export const apiConfigTemplates = (section?: string) =>
  apiFetch<{ templates: ConfigTemplate[] }>(
    `/api/config/templates${section ? `?section=${encodeURIComponent(section)}` : ""}`,
  );

export const apiConfigMapKeys = (path: string) =>
  apiFetch<{ keys: ConfigMapKey[] }>(`/api/config/map-key?path=${encodeURIComponent(path)}`);

export const apiConfigCreateMapKey = (path: string, key: string, template?: string) =>
  apiFetch<{ path?: string; created?: boolean; fields_prefix?: string }>("/api/config/map-key", {
    method: "POST",
    body: JSON.stringify({ path, key, template }),
  });

export const apiConfigDeleteMapKey = (path: string, key: string) =>
  apiFetch<{ deleted?: boolean }>(
    `/api/config/map-key?path=${encodeURIComponent(path)}&key=${encodeURIComponent(key)}`,
    { method: "DELETE" },
  );

export const apiConfigCatalog = (path?: string) =>
  apiFetch<unknown>(`/api/config/catalog${path ? `?path=${encodeURIComponent(path)}` : ""}`);

export const apiConfigDrift = () =>
  apiFetch<{ drifted?: unknown[]; [k: string]: unknown }>("/api/config/drift");

export const apiConfigReloadStatus = () =>
  apiFetch<{
    status?: string;
    pending_reload?: boolean;
    pendingReload?: boolean;
    last_reload_at?: string;
    [k: string]: unknown;
  }>("/api/config/reload-status");

export const apiAdminReload = () =>
  apiFetch<{ ok?: boolean; [k: string]: unknown }>("/admin/reload", { method: "POST" });

export const apiGatewayHealth = () => apiFetch<{ ok?: boolean; [k: string]: unknown }>("/health");

export const apiSkillBundles = () => apiFetch<{ bundles: SkillBundle[] }>("/api/skills/bundles");

export const apiSkillBundle = (bundleId: string) =>
  apiFetch<SkillBundle>(`/api/skills/bundles/${encodeURIComponent(bundleId)}`);

export const apiSkillBundlePatch = (bundleId: string, body: unknown) =>
  apiFetch<SkillBundle>(`/api/skills/bundles/${encodeURIComponent(bundleId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
