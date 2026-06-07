# Reuse attribution

`zeroclaw-workspace` reuses assets and code from
[`zeroclaw-labs/zeroclaw`](https://github.com/zeroclaw-labs/zeroclaw),
which is dual-licensed under MIT and Apache-2.0. This repo is published
under the same dual license, so the reuse is license-compatible without
additional notices in source headers.

This file is the canonical record of what was copied or ported, when,
and for which phase. Update it whenever new code lands.

## Files copied verbatim

### Icons (Phase 0)

Copied from `apps/tauri/icons/` to `src-tauri/icons/` and `public/`:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns`
- `icon.ico`
- `icon.png`
- `icon.svg`

### Licenses (Phase 0)

- `LICENSE-MIT` ← `LICENSE-MIT`
- `LICENSE-APACHE` ← `LICENSE-APACHE`

## Files ported with adaptation

_None yet — Phase 1 will port `gateway_client.rs`, `state.rs`,
`health.rs`, and the `auto_pair` / `inject_token_into_webview`
utilities from `apps/tauri/src/`._

## Files we intentionally did NOT copy

- `apps/tauri/src/tray/` — workspace is a real window app, not a tray.
- `apps/tauri/src/lib.rs::set_dock_icon()` — dev-mode hack for tray-only apps.
- The hardcoded `http://127.0.0.1:42617/_app/` main-window URL — workspace
  ships its own React frontend.
- `apps/tauri/src/commands/permissions.rs`,
  `apps/tauri/src/capabilities/screenshot.rs`,
  `apps/tauri/src/capabilities/applescript.rs` — those are agent-host
  capabilities (`zeroclaw` granting itself OS permissions). A workspace
  client doesn't need them.
- `single_instance` plugin block in `apps/tauri/src/lib.rs` focused on
  onboarding window — different window model.
