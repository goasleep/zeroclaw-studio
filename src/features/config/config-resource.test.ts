import { describe, expect, it } from "vitest";
import type { ConfigSectionInfo, PickerItem } from "@/api/config";
import { isDeletableResourceItem, resourceRefFromSectionItem } from "./config-resource";

function section(overrides: Partial<ConfigSectionInfo>): ConfigSectionInfo {
  return {
    key: "agents",
    label: "Agents",
    help: "",
    has_picker: true,
    completed: true,
    ready: true,
    group: "Agent",
    is_quickstart: false,
    ...overrides,
  };
}

function item(overrides: Partial<PickerItem>): PickerItem {
  return {
    key: "dev",
    label: "dev",
    ...overrides,
  };
}

describe("config resource delete refs", () => {
  it("targets one-tier aliases at the section map", () => {
    const ref = resourceRefFromSectionItem(
      section({ key: "risk_profiles", shape: "one_tier_alias_map" }),
      item({ key: "local", label: "Local" }),
    );

    expect(ref).toEqual({
      sectionKey: "risk_profiles",
      resourcePath: "risk_profiles.local",
      deleteParentPath: "risk_profiles",
      deleteKey: "local",
      label: "Local",
    });
  });

  it("targets typed-family aliases below their type", () => {
    const ref = resourceRefFromSectionItem(
      section({ key: "providers.models", shape: "typed_family_map" }),
      item({ key: "custom", label: "Custom" }),
      { alias: "default" },
    );

    expect(ref).toEqual({
      sectionKey: "providers.models",
      resourcePath: "providers.models.custom.default",
      deleteParentPath: "providers.models.custom",
      deleteKey: "default",
      label: "Custom / default",
    });
  });

  it("does not treat a typed-family catalog item as a deletable resource without an alias", () => {
    expect(
      isDeletableResourceItem(
        section({ key: "providers.models", shape: "typed_family_map" }),
        item({ key: "openai", label: "OpenAI" }),
      ),
    ).toBe(false);
  });

  it("only allows backend picker deletion for configured items", () => {
    const backend = section({ key: "plugins", shape: "backend_picker" });

    expect(isDeletableResourceItem(backend, item({ key: "github", badge: "recommended" }))).toBe(
      false,
    );
    expect(isDeletableResourceItem(backend, item({ key: "github", badge: "configured" }))).toBe(
      true,
    );
  });
});
