# Product Data Boundaries

This document defines the ownership boundary between ZeroClaw Studio, the
ZeroClaw runtime, and user-controlled resources. It is a product and
architecture guide for deciding where new features should store state, which
API surface should own behavior, and what the UI should make explicit.

## Principle

Studio owns the control plane. ZeroClaw owns the runtime state. Users own the
resources.

In product terms:

- Studio connects, organizes, presents, approves, and coordinates work.
- ZeroClaw executes agent work and owns the durable runtime records behind that
  work.
- User resources remain owned by the user, workspace, or machine where they
  live.

When a new feature is designed, first identify its source of truth:

1. Studio data
2. ZeroClaw data
3. User or machine data

If the feature spans more than one owner, keep each owner's state in its own
system and link records by stable identifiers.

## Studio Data

Studio data is product-level state owned by the desktop application. It exists
so the app can connect to runtimes, remember user preferences, and provide a
coherent product experience across gateways.

| Data                       | Owner  | Notes                                                                                                |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| Saved connections          | Studio | Local, bundled, attached, SSH-tunneled, and remote gateway targets.                                  |
| Active connection          | Studio | The currently selected runtime location.                                                             |
| Gateway bearer token cache | Studio | Stored so Studio can access a paired gateway. The token itself is minted by ZeroClaw.                |
| SSH tunnel configuration   | Studio | How Studio reaches a remote gateway.                                                                 |
| UI preferences             | Studio | Theme, language, layout, panel state, notifications, shortcut preferences, and similar app settings. |
| Recent workspace roots     | Studio | Remembered per connection so users can return to project contexts.                                   |
| Current file selection     | Studio | Transient chat or task context selected in the UI.                                                   |
| Local window state         | Studio | Sidebar width, selected page, filters, and other local presentation state.                           |
| Product task metadata      | Studio | Future task/run shells, labels, pins, grouping, and user-facing organization.                        |

Studio may create, update, migrate, import, export, or delete this data without
requiring ZeroClaw to treat it as runtime state.

### Product Task Metadata

If Studio introduces a higher-level `Task` or `Run` concept, the product shell
should be Studio-owned metadata. It can link to ZeroClaw records, but should not
duplicate the source runtime history.

Example Studio-owned task fields:

```text
Task:
- title
- target connection id
- workspace root
- linked ZeroClaw session id
- linked ZeroClaw cron id
- user-facing status
- pinned artifacts
- local notes or tags
```

The corresponding messages, tool calls, approvals, cron execution records,
logs, and memory changes remain ZeroClaw runtime data.

## ZeroClaw Data

ZeroClaw data is runtime state owned by the selected gateway. Studio accesses
and mutates it through gateway APIs. Studio should not directly edit ZeroClaw's
runtime files or config storage behind the gateway.

| Data                                      | Owner    | Studio role                                                                      |
| ----------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| Sessions and messages                     | ZeroClaw | List, create, continue, rename, delete, and display through gateway APIs.        |
| Agent state and personality               | ZeroClaw | Configure through ZeroClaw APIs.                                                 |
| Tool catalog                              | ZeroClaw | Display available tools, schemas, and runtime capabilities.                      |
| Tool calls and results                    | ZeroClaw | Present progress, results, failures, and approval requests.                      |
| Memory                                    | ZeroClaw | Search, create, update, and delete through memory APIs.                          |
| Cron jobs and cron runs                   | ZeroClaw | Productize as automations, but persist execution schedules and runs in ZeroClaw. |
| Logs and event history                    | ZeroClaw | Observe, filter, diagnose, and attach to support workflows.                      |
| Doctor, status, cost, and health          | ZeroClaw | Present as runtime health and diagnostics.                                       |
| Integrations and channels                 | ZeroClaw | Show configured capabilities and route users to gateway-backed configuration.    |
| Devices, pairing, and token rotation      | ZeroClaw | Initiate pairing or revocation flows through gateway APIs.                       |
| Skills, config, quickstart, and templates | ZeroClaw | Manage through the gateway as runtime configuration.                             |

Product rule:

> If a setting changes how agents execute, remember, call tools, authenticate
> to channels, or run on a schedule, it is ZeroClaw runtime data by default.

## Bundled Inner Runtime

The bundled inner runtime is a special case:

- Studio creates and supervises it.
- Studio stores it in an app-private data directory.
- Studio sets its `ZEROCLAW_CONFIG_DIR` and `ZEROCLAW_HOME`.
- It does not use the user's default `~/.zeroclaw/`.

However, the data inside that app-private inner runtime is still logically
ZeroClaw data.

That means sessions, memory, cron jobs, tools, logs, config, pairing records,
and runtime artifacts inside the inner runtime should be managed through
ZeroClaw APIs. Studio may provide product operations such as reset, backup,
export, reveal data directory, or upgrade checks, but it should not treat inner
runtime files as ordinary Studio preferences.

## User And Machine Data

User and machine data belongs to the user, the selected workspace, or the
machine where the selected runtime is running. Studio and ZeroClaw may access it
only through explicit user action, selected workspace roots, configured tools,
or gateway-scoped APIs.

| Data                               | Owner                        | Notes                                                                                                   |
| ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Workspace files                    | User or selected machine     | Local runtime files are on the desktop machine. Remote runtime files are on the remote gateway machine. |
| Git repositories                   | User or selected machine     | Read and write operations happen in the selected workspace context.                                     |
| Private APIs and internal services | User environment             | Accessed through configured tools, channels, or network routes.                                         |
| Shell command results              | Selected runtime environment | Results belong to the machine where the tool or agent ran.                                              |
| Clipboard content                  | User desktop session         | Access only when the user invokes clipboard features.                                                   |
| Webhook payloads                   | Sender and receiving gateway | Studio may show resulting runs, but receipt and validation belong to ZeroClaw.                          |
| Artifacts                          | Depends on write location    | May live in a workspace, shared directory, agent workspace, or runtime-specific storage.                |

Workspace roots are authorization scopes, not blanket machine access. The UI
should make the active runtime and workspace explicit whenever files may be read
or written.

Examples:

```text
Running on: MacBook Local Runtime
Workspace: /Users/you/project
```

```text
Running on: Homelab NAS
Workspace: /srv/projects/docs
```

Remote workspace paths refer to the gateway machine, not the desktop machine.

## Product Operation Layers

Studio product features should be classified by operation layer.

### App Layer

Owned by Studio:

- connection management
- app preferences
- product task metadata
- local notifications
- global shortcuts
- recent projects
- connection grouping and naming
- trust labels and safety prompts

### Runtime Layer

Controlled by Studio, executed through ZeroClaw or native supervision:

- start or stop a managed runtime spawned by Studio
- pair a gateway
- check gateway health
- show logs and doctor results
- switch active runtime
- manage cached gateway tokens
- guide SSH, Tailscale, VPN, or private-network connection setup

Studio is the control plane here, not the agent execution engine.

### Agent Work Layer

Executed by ZeroClaw, productized by Studio:

- chat sessions
- task runs
- tool calls
- approval flows
- memory operations
- scheduled work
- artifacts
- run history

Studio may present this layer as tasks, automations, timelines, approvals, and
results, but the durable runtime events should remain in ZeroClaw.

### Resource Layer

Owned by users and machines:

- folders
- repositories
- remote host directories
- internal services
- clipboard data
- webhook senders
- third-party accounts and integrations

Studio should communicate scope, location, and trust boundaries before actions
touch this layer.

## Feature Design Checklist

Before adding a feature, answer these questions:

1. What is the source of truth: Studio, ZeroClaw, or user resources?
2. If the feature spans multiple owners, what stable IDs link the records?
3. Which machine does execution happen on?
4. Which workspace or resource scope can be read or written?
5. Does the feature change runtime behavior, memory, tools, schedules, or
   credentials?
6. Should the operation go through a ZeroClaw API instead of local file edits?
7. What should happen when the active connection changes?
8. What should happen when the gateway is remote, offline, or untrusted?
9. What data must be redacted from logs, screenshots, exports, or diagnostics?
10. What user-facing label explains the active runtime and trust boundary?

## Examples

### Automation Template

| Part                                      | Owner                                |
| ----------------------------------------- | ------------------------------------ |
| Template gallery card                     | Studio                               |
| User's local label, grouping, or favorite | Studio                               |
| Actual schedule                           | ZeroClaw cron                        |
| Run history                               | ZeroClaw cron/events/logs            |
| Files touched by the automation           | User or selected machine             |
| Tool credentials used by the automation   | ZeroClaw config or external provider |

### Task Run

| Part                          | Owner                                               |
| ----------------------------- | --------------------------------------------------- |
| Task title and product status | Studio                                              |
| Linked session id             | Studio reference to ZeroClaw                        |
| Messages                      | ZeroClaw session                                    |
| Tool calls                    | ZeroClaw runtime                                    |
| Approval decisions            | ZeroClaw session/runtime event                      |
| Pinned final report           | Studio reference or user file, depending on storage |
| Generated workspace files     | User or selected machine                            |

### Inner Runtime Reset

| Part                                             | Owner                                    |
| ------------------------------------------------ | ---------------------------------------- |
| Reset confirmation UI                            | Studio                                   |
| Process shutdown and restart                     | Studio supervision                       |
| Sessions, memory, cron, and config being removed | ZeroClaw data inside app-private runtime |
| Warning about irreversible data loss             | Studio product responsibility            |

## Non-Goals

- Studio should not become a second ZeroClaw persistence layer.
- Studio should not directly patch ZeroClaw runtime files when a gateway API
  exists.
- Studio should not hide which machine is executing work.
- Studio should not imply that a selected workspace grants access to the whole
  machine.
- Studio should not treat remote gateway files as local desktop files.
