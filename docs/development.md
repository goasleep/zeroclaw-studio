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
pnpm tauri dev
```

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
- root `*.{html,json,ts}` files

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

## TypeScript checks

The frontend uses strict TypeScript settings. Run:

```bash
pnpm typecheck
```

Production frontend build:

```bash
pnpm build
```

## Rust checks

Run Rust checks from `src-tauri/`:

```bash
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

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
pnpm format:check
pnpm typecheck
pnpm build

cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

If a change touches the gateway HTTP/WS contract, update
`docs/gateway-protocol-notes.md`. If code or assets are ported from
`zeroclaw-labs/zeroclaw`, update `docs/reuse-attribution.md`.
