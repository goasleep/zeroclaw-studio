# Contributing to zeroclaw-studio

Thanks for considering a contribution.

## Quick start

```bash
git clone https://github.com/<you>/zeroclaw-studio
cd zeroclaw-studio
pnpm install
pnpm desktop:dev
```

You will need a running ZeroClaw gateway to connect to. See the
[main repo](https://github.com/zeroclaw-labs/zeroclaw) for setup. The
workspace supports local-managed, local-attached, and remote
(URL/SSH/Tailscale) connections — pick whichever is convenient.

## Before opening a PR

```bash
# Frontend
pnpm check

# Rust
pnpm rust:check
```

See [`docs/development.md`](docs/development.md) for local setup, formatting,
linting, type checking, Rust checks, desktop builds, and generated Tauri command
bindings.

## Code organisation

- `src-tauri/src/` — Rust backend
  - `connection/` — Connection model, persistence, local discovery, SSH
  - `runtime/` — Local zeroclaw binary detection + managed-process supervisor
  - `gateway/` — HTTP/WS client + pairing + health
  - `workspace/` — Native capabilities (fs watcher; future: more)
  - `commands/` — Tauri command surface exposed to the frontend
- `src/` — React + Vite + TS frontend
  - `app/` — Top-level shell, providers, router, connection picker
  - `api/` — Gateway HTTP/WS/SSE clients + tauri command wrappers
  - `features/` — One folder per gateway feature (chat, memory, config, …)
  - `workspace/` — Native-capability React glue (shortcuts, clipboard,
    notifications, protocol)
- `docs/` — development, architecture, gateway protocol notes,
  and reuse attribution

## Conventions

- Match existing comment density and idiom — don't over-comment new code.
- Run `pnpm format` for frontend and root config changes; `.editorconfig`
  defines shared editor defaults.
- `pnpm install` configures the repo's Git hooks. The pre-commit hook formats
  staged frontend and root config files with Prettier and re-stages them.
- Reused code from the main `zeroclaw-labs/zeroclaw` repo gets logged in
  `docs/reuse-attribution.md` with its origin path.
- New gateway endpoints get noted in `docs/gateway-protocol-notes.md` so
  later contributors know what's documented vs. inferred from source.
- Frontend stays on the hand-rolled `apiFetch` pattern until we have ≥5
  features and feel actual pain (matches `web/` from the main repo).

## License

By contributing you agree your work is dual-licensed under MIT or
Apache-2.0, matching the rest of the project.
