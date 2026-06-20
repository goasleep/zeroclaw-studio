# AGENTS.md

Project instructions for AI coding assistants working in this repository.

## Project Snapshot

`zeroclaw-workspace` is an early-stage Tauri 2 desktop app with a React/Vite
frontend. It connects to local-managed, local-attached, and remote ZeroClaw
gateways over HTTP, WebSocket, and SSE.

Use `pnpm` for Node tasks. The package manager is pinned in `package.json`
(`pnpm@10.28.0`), Node is pinned by `.nvmrc`, and Rust is pinned by
`rust-toolchain.toml`.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tools** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them. `codegraph_node` returns one symbol's source + callers, or reads a whole file with line numbers. If the tools are listed but deferred, load them by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` and `codegraph node <symbol-or-file>` print the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

## Repository Layout

- `src/` - React + Vite frontend.
- `src/app/` - app shell, connection/workspace providers, and top-level UI.
- `src/features/` - feature panels such as chat, config, memory, setup, and tools.
- `src/workspace/` - workspace integrations: file tree, clipboard, notifications,
  preferences, shortcuts, and deep links.
- `src/api/` - gateway/Tauri API wrappers. `src/api/bindings.ts` is generated.
- `src-tauri/` - Tauri Rust backend, native commands, gateway client, runtime
  supervision, connection storage, and workspace file integration.
- `docs/` - architecture, development guide, gateway protocol notes, and reuse
  attribution.

## Common Commands

- Install dependencies: `pnpm install`
- Start the desktop app: `pnpm desktop:dev`
- Start only the Vite frontend: `pnpm dev`
- Build the frontend: `pnpm build`
- Build packaged desktop app: `pnpm desktop:build`
- Full frontend quality gate: `pnpm check`
- Frontend lint: `pnpm lint`
- TypeScript check: `pnpm typecheck`
- Rust quality gate: `pnpm rust:check`
- Rust checks individually: `pnpm rust:fmt`, `pnpm rust:clippy`,
  `pnpm rust:test`

## Commit Messages

All agent-created commits must use Conventional Commits style:

```text
type(optional-scope): concise imperative summary
```

Use common types such as `feat`, `fix`, `docs`, `style`, `refactor`, `test`,
`chore`, `build`, `ci`, and `perf`. Keep the summary lowercase unless a proper
name requires capitalization. Before committing, inspect recent history and
match the repository's established scope names when one applies.

## Generated Bindings

Rust commands exposed to the frontend are collected through `tauri-specta`.
The generated TypeScript bindings live at `src/api/bindings.ts`.

Do not edit `src/api/bindings.ts` by hand. Regenerate it with a debug Tauri
run (`pnpm desktop:dev`) or without launching the app:

```bash
cd src-tauri
cargo test export_bindings
```

When adding or changing a Tauri command, make sure it is included in the
`specta_builder` command list in `src-tauri/src/lib.rs`, then regenerate the
bindings.

## Coding Notes

- Prefer existing React/Tauri patterns before adding new abstractions.
- Keep Tauri IPC boundaries thin: commands should delegate to backend modules
  and return typed serializable values.
- Put cross-field data shaping, relationship resolution, and other non-trivial
  aggregation in the Rust/Tauri layer when it can be derived from gateway or
  workspace state. Rust is faster for this work and keeps React focused on
  rendering, local UI state, and interaction wiring.
- Use `@/api/tauri` wrappers from frontend code instead of importing generated
  commands directly.
- For frontend work, follow the existing Tailwind/Radix/lucide style and verify
  important UI changes in the app/browser.
- When changing user-visible behavior, update the relevant README or docs in
  the same change. This is especially important for chat/session semantics,
  gateway compatibility, setup flows, native capabilities, release behavior,
  and security/data-boundary changes.
- For Rust work, keep `cargo fmt --all -- --check`, clippy with `-D warnings`,
  and tests green.
- If a change touches the gateway HTTP/WS/SSE contract, update
  `docs/gateway-protocol-notes.md`.
- If code or assets are copied or ported from `zeroclaw-labs/zeroclaw`, update
  `docs/reuse-attribution.md`.

## Working Tree Safety

This repository often has active local changes. Do not revert or overwrite
unrelated user work. Before editing, inspect relevant diffs and keep changes
scoped to the task.

## Migrated Claude Plugins

The previous Claude project settings enabled:

- `playwright@claude-plugins-official`
- `code-review@claude-plugins-official`

Codex equivalents:

- Use the Browser plugin / in-app browser for Playwright-style local web inspection, navigation, screenshots, and frontend verification.
- For review requests, use Codex's code-review posture: lead with findings ordered by severity, include file and line references, call out test gaps and regressions, and keep summaries secondary.
