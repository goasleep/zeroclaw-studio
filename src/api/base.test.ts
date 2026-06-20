import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection, GatewayHttpRequest } from "./bindings";

const activeConnection: Connection = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "ZeroClaw Studio Test Gateway",
  transport: "local",
  url: "http://127.0.0.1:42618",
  ssh: null,
  auth: { mode: "pairing", token: "token-1" },
  lifecycle: "managed",
  runtime_source: "bundled_inner",
  binary_path: null,
};

const getActiveConnection = vi.fn<() => Promise<Connection | null>>();
const gatewayRequest = vi.fn<(req: GatewayHttpRequest) => Promise<unknown>>();

vi.mock("@/api/tauri", () => ({
  getActiveConnection,
  gatewayRequest,
}));

beforeEach(() => {
  vi.resetModules();
  getActiveConnection.mockReset();
  gatewayRequest.mockReset();
});

describe("apiFetch", () => {
  it("proxies requests through the Tauri gateway command", async () => {
    getActiveConnection.mockResolvedValue(activeConnection);
    gatewayRequest.mockResolvedValue({
      status: 200,
      headers: [],
      body: JSON.stringify({ ok: true }),
    });

    const { apiFetch } = await import("./base");
    await expect(apiFetch("/api/health", { method: "GET" })).resolves.toEqual({ ok: true });

    expect(gatewayRequest).toHaveBeenCalledWith({
      method: "GET",
      url: "http://127.0.0.1:42618/api/health",
      headers: [["Authorization", "Bearer token-1"]],
      body: null,
    });
  });

  it("dispatches unauthorized events on 401", async () => {
    getActiveConnection.mockResolvedValue(activeConnection);
    gatewayRequest.mockResolvedValue({ status: 401, headers: [], body: "" });
    const unauthorized = vi.fn();
    window.addEventListener("zeroclaw-unauthorized", unauthorized);

    const { UnauthorizedError, apiFetch } = await import("./base");
    await expect(apiFetch("/api/health")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(unauthorized).toHaveBeenCalledTimes(1);
    window.removeEventListener("zeroclaw-unauthorized", unauthorized);
  });

  it("returns undefined for 204 responses", async () => {
    getActiveConnection.mockResolvedValue(activeConnection);
    gatewayRequest.mockResolvedValue({ status: 204, headers: [], body: "" });

    const { apiFetch } = await import("./base");
    await expect(apiFetch("/api/empty")).resolves.toBeUndefined();
  });
});
