import type { ConfigSectionInfo, PickerItem } from "@/api/config";

export interface ConfigResourceRef {
  sectionKey: string;
  resourcePath: string;
  deleteParentPath: string;
  deleteKey: string;
  label: string;
}

export function resourceRefFromSectionItem(
  section: ConfigSectionInfo,
  item: PickerItem,
  options: {
    alias?: string | null;
    label?: string | null;
    openedPrefix?: string | null;
  } = {},
): ConfigResourceRef | null {
  const shape = section.shape ?? "typed_family_map";
  const label = options.label?.trim() || item.label || item.key;

  if (shape === "one_tier_alias_map") {
    return {
      sectionKey: section.key,
      resourcePath: `${section.key}.${item.key}`,
      deleteParentPath: section.key,
      deleteKey: item.key,
      label,
    };
  }

  if (shape === "typed_family_map") {
    const alias = options.alias?.trim();
    if (!alias) return null;
    return {
      sectionKey: section.key,
      resourcePath: `${section.key}.${item.key}.${alias}`,
      deleteParentPath: `${section.key}.${item.key}`,
      deleteKey: alias,
      label: options.label?.trim() || `${item.label || item.key} / ${alias}`,
    };
  }

  if (shape === "backend_picker") {
    const prefixRef = options.openedPrefix
      ? resourceRefFromOpenedPrefix(section, options.openedPrefix, label)
      : null;
    if (prefixRef) return prefixRef;
    if (!isConfiguredPickerItem(item)) return null;
    return {
      sectionKey: section.key,
      resourcePath: `${section.key}.${item.key}`,
      deleteParentPath: section.key,
      deleteKey: item.key,
      label,
    };
  }

  return null;
}

export function isDeletableResourceItem(
  section: ConfigSectionInfo,
  item: PickerItem,
  options: { alias?: string | null; openedPrefix?: string | null } = {},
) {
  return Boolean(resourceRefFromSectionItem(section, item, options));
}

export function isConfiguredPickerItem(item: PickerItem) {
  const badge = item.badge?.trim().toLowerCase();
  return badge === "configured" || badge === "saved" || badge === "connected";
}

function resourceRefFromOpenedPrefix(
  section: ConfigSectionInfo,
  openedPrefix: string,
  label: string,
): ConfigResourceRef | null {
  if (openedPrefix === section.key || !openedPrefix.startsWith(`${section.key}.`)) return null;
  const tail = openedPrefix
    .slice(section.key.length + 1)
    .split(".")
    .filter(Boolean);
  if (tail.length === 0) return null;
  return {
    sectionKey: section.key,
    resourcePath: `${section.key}.${tail[0]}`,
    deleteParentPath: section.key,
    deleteKey: tail[0],
    label,
  };
}
