# Development guide

This page collects the local workflow and project quality checks for
`zeroclaw-workspace`.

## Local setup

Requirements:

- Rust stable, pinned by `rust-toolchain.toml`
- Node, pinned by `.nvmrc`
- pnpm
- Tauri 2 system dependencies

Install dependencies and start the desktop app:

```bash
pnpm install
pnpm desktop:dev
```

`pnpm tauri dev` remains available through the Tauri CLI wrapper, but the
project-level alias is preferred in docs and scripts.

## Formatting

Editor defaults are defined in `.editorconfig`:

- UTF-8
- LF line endings
- final newline
- trailing whitespace trimmed
- 2-space indentation by default
- 4-space indentation for Rust files

Frontend formatting is handled by Prettier. The configured scope is:

- `src/**/*.{ts,tsx,css}`
- root `*.{html,json,js,ts}` files

Run this before committing frontend or root config changes:

```bash
pnpm format
```

Check formatting without writing files:

```bash
pnpm format:check
```

Generated files, lockfiles, build output, and Tauri target output are excluded
in `.prettierignore`.

## Linting

Frontend linting is handled by ESLint:

```bash
pnpm lint
```

Apply safe automatic fixes:

```bash
pnpm lint:fix
```

The initial rule set focuses on TypeScript/JavaScript correctness, React Hooks
rules, and React Fast Refresh warnings. Generated Tauri command bindings are
excluded from linting.

## TypeScript checks

The frontend uses strict TypeScript settings. Run:

```bash
pnpm typecheck
```

Production frontend build:

```bash
pnpm build
```

Run the full frontend quality gate:

```bash
pnpm check
```

## Rust checks

Run the Rust quality gate:

```bash
pnpm rust:check
```

Individual Rust checks are also available:

```bash
pnpm rust:fmt
pnpm rust:clippy
pnpm rust:test
```

## Desktop builds

Build the packaged Tauri desktop app:

```bash
pnpm desktop:build
```

This first prepares the bundled `zeroclaw v0.8.0` sidecar in
`src-tauri/binaries/`, then runs `pnpm tauri build`. The actual sidecar binary
is a local build input and is ignored by git.

To prepare or verify the sidecar explicitly:

```bash
pnpm fetch:zeroclaw-sidecar
pnpm fetch:zeroclaw-sidecar:offline
```

The offline command only checks an existing
`src-tauri/binaries/zeroclaw-${targetTriple}` file and never downloads.

## Tauri command bindings

Rust commands exposed to the frontend are collected through `tauri-specta`.
The generated TypeScript bindings live at `src/api/bindings.ts`.

Bindings are regenerated automatically in debug builds. To regenerate them
without launching the app:

```bash
cd src-tauri
cargo test export_bindings
```

Do not edit `src/api/bindings.ts` by hand.

## Before opening a PR

Recommended local checklist:

```bash
pnpm check
pnpm rust:check
```

If a change touches the gateway HTTP/WS contract, update
`docs/gateway-protocol-notes.md`. If code or assets are ported from
`zeroclaw-labs/zeroclaw`, update `docs/reuse-attribution.md`.
