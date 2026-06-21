# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-06-21

### Added

- Added a task-centered workspace model, including Studio-owned task metadata,
  task grouping by workspace, task detail views, and a work dashboard for
  recent, running, failed, and approval-blocked work.
- Added runtime observer read models that reconcile reachable ZeroClaw
  runtimes from health, sessions, session state, events, cron jobs, and cron
  run history.
- Added runtime summaries and pending approval projections so the UI can show
  live runtime state, approval counts, failed counts, running counts, and
  automation counts without each React page owning background discovery.
- Added an approvals inbox for live tool approvals, including runtime,
  workspace, task, agent, and argument context plus approve/deny actions.
- Added automations UI for scheduled agent jobs, including refresh, run now,
  pause/resume, delete, and creation flow integration.
- Added a runtime detail surface that brings health, doctor checks, logs,
  tools, memory, cron, devices, integrations, and configuration closer to the
  task workflow.
- Added combined backend and gateway log viewing for easier diagnosis from the
  desktop app.
- Added config resource deletion support.
- Added task and run timeline helpers for deriving task status, visible tasks,
  and timeline entries from chat messages and runtime projections.
- Added product documentation for the ZeroClaw positioning, product data
  boundaries, multi-runtime sync model, and productization roadmap.

### Changed

- Shifted the primary product language from chat sessions and cron panels to
  task runs, workspaces, approvals, and automations.
- Reworked workspace navigation around work dashboards, tasks, approvals,
  automations, runtime detail, and settings instead of the previous
  chat/settings-centered shell.
- Backfilled and reconciled task shells from existing runtime sessions so
  persisted runtime work can appear in Studio task lists.
- Improved chat rendering and task navigation so session history, tool
  results, approval state, and task status stay aligned with the selected
  task.
- Updated gateway protocol notes to document observer endpoint usage and
  approval-response ownership.
- Updated README and Chinese README copy to describe Studio as a ZeroClaw task
  workspace and control plane rather than only a chat workspace.
- Documented `zeroclaw v0.8.0` as the currently tested gateway-compatible
  version for ZeroClaw Studio 0.1.1.
- Added README guidance for reporting issues and starring the project.
- Release workflow now publishes release artifacts directly instead of leaving
  releases as drafts.
- Development setup now provides `pnpm run dev:init`, installs Git hooks during
  package preparation, and formats staged frontend, script, and root config
  files before commit.

### Fixed

- Fixed workspace reconciliation for sessions deleted from the runtime.
- Fixed task status reconciliation so runtime-derived states such as running,
  needs approval, done, failed, and archived remain visible across navigation
  and background updates.

### Removed

- Removed the old workspace chat wrapper in favor of the task workspace flow.
- Removed the Dependabot configuration.

## [0.1.0] - 2026-06-20

### Added

- Initial public release of ZeroClaw Studio, a desktop workspace for
  connecting to local and remote ZeroClaw gateways from one app.
- Connection setup for managed local gateways, attached local gateways, remote
  HTTP gateways, and SSH-tunneled gateways.
- Persistent workspace and connection state, with a title-bar connection picker
  and live gateway health indicators.
- Streaming chat experience with markdown rendering, thinking sections,
  tool-call cards, approval controls, session resume, and workspace file
  attachments.
- Native workspace file browser with folder picking, recursive file watching,
  `.gitignore` support, multi-select, and attachment queuing for chat.
- Workspace panels for memory, tools, cron, integrations, channels, logs,
  doctor, devices, and configuration.
- Configuration browsing and editing for gateway settings, including focused
  single-field updates.
- Setup and diagnostics flows for browser tooling, Python skills, Docker
  runtime, sandbox backends, and MCP stdio commands.
- Desktop integrations for global chat focus shortcut, notifications, clipboard
  paste, and `zeroclaw://` deep-link registration.
