# AGENTS.md

Project instructions for AI coding assistants working in this repository.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tools** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them. `codegraph_node` returns one symbol's source + callers, or reads a whole file with line numbers. If the tools are listed but deferred, load them by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` and `codegraph node <symbol-or-file>` print the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

## Migrated Claude Plugins

The previous Claude project settings enabled:

- `playwright@claude-plugins-official`
- `code-review@claude-plugins-official`

Codex equivalents:

- Use the Browser plugin / in-app browser for Playwright-style local web inspection, navigation, screenshots, and frontend verification.
- For review requests, use Codex's code-review posture: lead with findings ordered by severity, include file and line references, call out test gaps and regressions, and keep summaries secondary.
