import { describe, expect, it } from "vitest";
import { normalizeSettingsSection, settingsSectionForConfigTarget } from "./settings-routing";

describe("settings routing", () => {
  it("normalizes legacy cron settings to automations", () => {
    expect(normalizeSettingsSection("cron")).toBe("automations");
    expect(settingsSectionForConfigTarget("cron")).toBe("automations");
    expect(settingsSectionForConfigTarget("cron.jobs")).toBe("automations");
  });
});
