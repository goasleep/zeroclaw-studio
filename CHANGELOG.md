# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Phase 0
- Initial Tauri 2 + React 19 + Vite 8 + Tailwind 4 scaffold.
- Dual MIT/Apache-2.0 license, matching the main repo.
- GitHub Actions CI: typecheck, fmt, clippy, test, build across macOS/Linux/Windows.

### Added — Phase 1: connection management
- `Connection` model with `managed | attach | remote` lifecycles and
  `local | http | ssh | tailscale` transports.
- Local zeroclaw binary detection (`$PATH`, `~/.cargo/bin`, XDG bin home,
  `/usr/local/bin`, `/opt/homebrew/bin`). Never required to succeed —
  remote-only users are a first-class case.
- `Supervisor` for managed connections (spawn / health / restart with
  exponential backoff / graceful shutdown on app exit). Tracks spawn
  ownership — never kills externally-managed processes.
- `TunnelRegistry` orchestrating system `ssh -L` port forwards for
  ssh-tunneled connections.
- Persistence via `tauri-plugin-store` (one JSON file per app config dir).
- Welcome screen with 3 entry points: remote / local-attach / install-and-manage.
- Add-connection wizard with URL or SSH subforms.
- Title-bar connection picker with health indicator.
- 24 Rust tests.

### Added — Phase 2: auth + REST plumbing
- `apiFetch` wrapper with bearer header, 401 dispatch, `ApiError` envelope.
- Reconnecting WS chat client with full frame taxonomy (`chunk`,
  `thinking`, `tool_call`, `approval_request`, `done`, etc.).
- Fetch-stream SSE events client (`EventSource` can't carry Authorization).
- `docs/gateway-protocol-notes.md` — complete HTTP/WS/SSE endpoint map.

### Added — Phase 3: workspace shell + file system pane
- `notify`-based recursive file watcher with `.gitignore` + default ignore.
- Native folder picker via `tauri-plugin-dialog`.
- 3-pane resizable shell (sidebar / center tabs / inspector).
- File tree with multi-select; selection queues as chat attachments.
- Live `workspace://fs-changed` event drives re-render.

### Added — Phase 4: chat parity
- Streaming chat with markdown rendering, tool-call cards, thinking
  details, approval banner (approve / always / deny).
- Per-agent `session_id` persisted in localStorage; auto-resume on
  reconnect.
- File attachments from workspace tree prefix the next message.

### Added — Phase 5: native quick-interaction
- Global `Cmd/Ctrl+Shift+Space` shortcut focuses chat composer.
- Native notifications when window is hidden and an approval lands or a
  long turn completes.
- Clipboard paste button on composer.
- `zeroclaw://` deep-link scheme registered (handler dispatch is a
  Phase 7 follow-up — currently logs).

### Added — Phase 6: web/ feature parity (reader mode)
- Memory / Tools / Cron / Integrations + Channels / Logs / Doctor /
  Devices / Config panels wired into the workspace tabs.
- Config supports single-field view + edit via PUT
  `/api/config/prop?path=...`. Full schema-driven form generator is a
  follow-up.

### Added — Phase 7: distribution
- `.github/workflows/release.yml` for tag-triggered multi-OS builds
  (macOS aarch64 + x86_64 dmg/app; Linux deb + AppImage; Windows
  msi + nsis exe) producing a draft GitHub release.
- `CONTRIBUTING.md` for contributor onboarding.
- `CHANGELOG.md` (this file).
