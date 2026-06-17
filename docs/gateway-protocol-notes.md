# Gateway protocol notes

Living protocol map for the ZeroClaw gateway as seen from the workspace
client. The gateway only publishes an OpenAPI schema for `/api/config/*` —
everything else is decoded from `crates/zeroclaw-gateway/src/` handler
signatures. Update this file whenever you wire a new endpoint.

Authoritative source paths (main repo):
- Router/wiring: `crates/zeroclaw-gateway/src/lib.rs:1457-1725`
- Per-area handlers: `src/api.rs`, `src/api_config.rs`, `src/api_sections.rs`,
  `src/api_pairing.rs`, `src/api_personality.rs`, `src/api_quickstart.rs`,
  `src/api_skills.rs`, `src/api_browse.rs`, `src/api_logs.rs`, `src/ws.rs`,
  `src/sse.rs`, `src/canvas.rs`, `src/nodes.rs`, `src/openapi.rs`
- OpenAPI snapshot (config-only): `crates/zeroclaw-gateway/openapi.json`

All `/api/*` paths require `Authorization: Bearer <token>` when pairing is
active. WS endpoints accept the token via header,
`Sec-WebSocket-Protocol: bearer.<token>`, or `?token=<...>`.

## Auth / pairing

| Method | Path | Notes |
|---|---|---|
| POST | `/pair` | `X-Pairing-Code: <code>` → `{paired, persisted, token, message}`. Rate-limited. |
| GET | `/pair/code` | Current short-lived pairing code (admin / UX bootstrap). |
| POST | `/api/pairing/initiate` | Enhanced pairing flow → challenge payload. |
| POST | `/api/pair` | Submit enhanced pairing → `{token, device_id}`. |
| GET | `/api/devices` | List paired devices. |
| POST | `/api/devices/me/capabilities` | Update calling device's capability tags. |
| DELETE | `/api/devices/{id}` | Revoke a device. |
| POST | `/api/devices/{id}/token/rotate` | Rotate a device's token. |
| POST | `/api/webauthn/{register,auth}/{start,finish}` | Hardware-key flows (feature `webauthn`). |

## Admin (localhost-only)

| Method | Path |
|---|---|
| POST | `/admin/shutdown` |
| POST | `/admin/reload` |
| GET | `/admin/paircode` |
| POST | `/admin/paircode/new` |

## Health / status / meta

| Method | Path |
|---|---|
| GET | `/health` |
| GET | `/api/health` |
| GET | `/metrics` |
| GET | `/api/status` |
| GET, POST | `/api/doctor` |
| GET | `/api/logs` |
| GET | `/api/cost` |
| GET | `/api/cli-tools` |
| GET | `/api/tuis` |

## Sessions / chat / agents

| Method | Path |
|---|---|
| GET | `/api/sessions` |
| GET | `/api/sessions/running` |
| GET, POST | `/api/sessions/{id}/messages` |
| DELETE, PUT | `/api/sessions/{id}` |
| GET | `/api/sessions/{id}/state` |
| POST | `/api/sessions/{id}/abort` |

## Personality / quickstart / skills

| Method | Path |
|---|---|
| GET | `/api/personality`, `/api/personality/templates` |
| GET, PUT | `/api/personality/{filename}` |
| GET | `/api/quickstart/state` |
| POST | `/api/quickstart/{fields,validate,apply,dismiss}` |
| GET | `/api/skills/bundles` |
| GET, POST | `/api/skills/bundles/{alias}/skills` |
| GET, PUT, DELETE | `/api/skills/bundles/{alias}/skills/{name}` |

## Config

OpenAPI-documented surface.

| Method | Path |
|---|---|
| GET | `/api/config` |
| PATCH | `/api/config` (RFC-6902 patch; `X-ZeroClaw-Override-Drift: true` to bypass drift guard) |
| GET, PUT, DELETE | `/api/config/prop?path=...` |
| GET | `/api/config/list?prefix=...` |
| GET | `/api/config/drift`, `/api/config/reload-status` |
| GET | `/api/config/templates`, `/api/config/map-keys` |
| POST, DELETE | `/api/config/map-key` |
| POST | `/api/config/rename-map-key` |
| GET | `/api/config/catalog`, `/api/config/catalog/models` |
| GET | `/api/config/status`, `/api/config/agent-options` |
| GET | `/api/config/sections`, `/api/config/sections/{section}` |
| POST | `/api/config/sections/{section}/items/{key}` |
| POST | `/api/config/init?section=...`, `/api/config/migrate` |

## Memory

| Method | Path |
|---|---|
| GET | `/api/memory` |
| POST | `/api/memory` (`{key, value, ...}`) |
| DELETE | `/api/memory/{key}` |

## Tools / channels / integrations

| Method | Path |
|---|---|
| GET | `/api/tools` |
| GET | `/api/channels` |
| GET | `/api/integrations`, `/api/integrations/settings` |

## Cron

| Method | Path |
|---|---|
| GET, POST | `/api/cron` |
| GET, PATCH | `/api/cron/settings` |
| PATCH, DELETE | `/api/cron/{id}` |
| GET | `/api/cron/{id}/runs` |
| POST | `/api/cron/{id}/run` (long-timeout manual trigger) |

## Filesystem / agent workspace

| Method | Path |
|---|---|
| GET | `/api/browse` |
| POST | `/api/browse/mkdir` |
| DELETE | `/api/browse/rmdir` |
| GET | `/api/agents/{alias}/workspace/{list,read}` |
| DELETE | `/api/agents/{alias}/workspace/path` |
| POST | `/api/agents/{alias}/workspace/{move,mkdir}` |

## Canvas (A2UI)

| Method | Path |
|---|---|
| GET | `/api/canvas` |
| GET, POST, DELETE | `/api/canvas/{id}` |
| GET | `/api/canvas/{id}/history` |

## Webhooks (no bearer; per-channel HMAC/secret)

| Method | Path |
|---|---|
| POST | `/webhook` |
| GET, POST | `/whatsapp`, `/wati` |
| POST | `/linq/{alias}`, `/nextcloud-talk`, `/webhook/gmail` (feature-gated) |

## Static

| Method | Path |
|---|---|
| GET | `/_app/*path` — dashboard bundle. SPA fallback on unmatched GET. |

---

## Event streams

### SSE: `GET /api/events` and `GET /api/events/history`

Bearer-protected. Event JSON: `{ "type": <kind>, ... }`. Observed kinds:
`llm_request`, `tool_call`, `tool_call_start`, `tool_result`, `agent_start`,
`agent_end`, `cron_result`, `error`. History endpoint returns a ring buffer
snapshot.

### WS: `GET /ws/chat?session_id=...&agent=...&name=...&token=...`

Bidirectional agent chat. Subprotocols `["zeroclaw.v1", "bearer.<token>"]`.

Optional first frame from client:
`{"type":"connect", session_id?, device_name?, capabilities?, workspace_dir?}`
→ server replies `{"type":"connected", ...}`. Otherwise jumps to
`{"type":"session_start", session_id, name, resumed, message_count}`.

Client → server: `message` (`{content}`), `approval_response`
(`{request_id, decision: approve|deny|always}`), voice events
(`speech_start`, `speech_end`, `barge_in`) when `gateway-voice-duplex` is
on.

Server → client: `session_start`, `chunk`, `thinking`, `tool_call`,
`tool_call_start`, `tool_result`, `approval_request` (`{request_id, tool,
arguments_summary, timeout_secs}`), `done` (`{full_response}`), `aborted`,
`error`. Voice: `tts_chunk` (`{audio_b64, format?}`), `tts_cancel`.

### WS: `GET /ws/canvas/{id}`

Server → client frames: `{"type":"connected"}`, `{"type":"frame", ...}`,
`{"type":"lagged"}`, `{"type":"error"}`. Subscription implicit on connect.

### WS: `GET /ws/nodes`

Node-extension RPC plane. Tagged enums:

- Node → Gateway: `register` (`{node_id, capabilities[]}`), `result`
  (`{call_id, success, output, error?}`).
- Gateway → Node: `registered` (`{node_id, capabilities_count}`), `invoke`
  (`{call_id, capability, args}`).

### WS: `GET /acp`

ACP client bridge (Anthropic-style agent client protocol passthrough). Uses
ACP-defined frame schema.

---

## Bottom line on schemas

Only `/api/config/*` is in OpenAPI. Everything else we model from Rust
source — request/response shapes live alongside each handler (most use
`serde_json::json!` literals or local `Deserialize` structs in the same
file as the handler).

Phase 7 includes an upstream issue + PR to expand OpenAPI coverage to
non-config endpoints so the workspace can generate types instead of hand-
maintaining them.
