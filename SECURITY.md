# Security Policy

ZeroClaw Workspace is a desktop client that connects local files, native
desktop capabilities, and local or remote ZeroClaw gateways. Please report
security issues privately so we can investigate before details are public.

## Supported versions

The project is in early development. Security fixes are currently made on the
default branch and included in the next tagged release.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Latest tagged release | Best effort |
| Older tagged releases | No |

## Reporting a vulnerability

Use GitHub's private vulnerability reporting flow for this repository when it
is available: open the repository's **Security** tab, then choose **Report a
vulnerability**.

If private reporting is not enabled, open a public issue asking for a private
security contact, but do not include exploit details, secrets, tokens, private
URLs, logs, or screenshots that expose sensitive information.

Please include:

- affected ZeroClaw Workspace version or commit
- operating system and CPU architecture
- whether the target gateway was local, remote, or reached through SSH/Tailscale/VPN
- clear reproduction steps
- expected impact
- whether the issue requires user interaction
- any relevant logs with tokens, URLs, file paths, and personal data redacted

We will acknowledge valid private reports as soon as practical, prioritize the
issue by impact and exploitability, and coordinate disclosure timing with the
reporter when a fix is needed.

## Security boundaries

ZeroClaw Workspace is a Tauri desktop application. It bridges a web frontend
with native Rust commands, so treat its native command surface as security
sensitive.

The app may:

- connect to local or remote ZeroClaw gateway HTTP/WebSocket/SSE endpoints
- store gateway connection metadata and bearer tokens in the per-user Tauri
  app data store
- open SSH tunnels for configured SSH connections
- read, write, list, and watch files in the selected workspace through Rust
  commands
- read and write clipboard text when the user uses clipboard features
- register a global shortcut
- show native notifications
- spawn and supervise a local `zeroclaw` process for managed local connections
- run a small allowlisted set of Setup Center actions after user confirmation

The app should not be treated as a sandbox for untrusted repositories or
untrusted gateways. A gateway you connect to can influence chat/tool data shown
in the UI, and workspace file operations intentionally access files the user has
opened in the app.

## Sensitive data

Connection data is stored under the operating system's per-user app data
location through `tauri-plugin-store`. At the time of writing, gateway bearer
tokens are stored in `connections.json` alongside connection metadata. This is
per-user app data, not an OS keychain.

Until token storage moves to the OS keychain:

- protect your OS user account and disk
- avoid sharing app data directories or diagnostic archives
- redact `connections.json`, gateway tokens, SSH hostnames, private URLs, and
  workspace paths before filing issues

## Remote gateways

Only connect to gateways you administer or trust. Prefer TLS or a trusted
private network path for remote gateways. SSH tunnels, Tailscale, VPNs, and
private network routes reduce exposure, but they do not make an untrusted
gateway safe.

When reporting a remote-gateway issue, clarify whether the weakness is in:

- ZeroClaw Workspace itself
- the remote gateway
- the network transport or tunnel setup
- a configuration mistake

## Local command execution

Managed local connections may spawn the configured `zeroclaw` binary. Setup
Center actions are intended to be explicit, user-confirmed, and allowlisted.
Reports involving command execution should include the exact UI path and action
that led to execution.

Do not report expected behavior such as the app launching a configured managed
local gateway as arbitrary code execution unless there is a way to bypass user
intent, change the executable unexpectedly, inject arguments, or execute
outside the allowlist.

## File access

Workspace file features intentionally read, write, list, and watch local files
for the selected workspace. Security reports in this area are most useful when
they show one of the following:

- access outside the selected workspace without clear user action
- path traversal or symlink behavior that exposes unexpected files
- writes to unexpected locations
- leakage of file contents to an untrusted gateway or log sink
- failure to honor documented ignore rules in a security-relevant way

## Dependency and supply-chain issues

Reports about vulnerable dependencies are welcome when they include:

- the vulnerable package or crate
- affected version range
- reachable impact in this application
- a suggested fixed version, if available

Low-impact reports about unused transitive dependencies may be handled during
normal dependency maintenance.

## Not currently in scope

The following are usually not treated as security vulnerabilities by themselves:

- unsigned development or early release builds, unless they enable a concrete
  update or install attack beyond the documented release state
- a malicious local OS user reading another file owned by the same OS account
- issues that require the user to install and run a malicious replacement
  `zeroclaw` binary by hand
- generic denial-of-service issues without persistence, data exposure, or
  privilege boundary impact
- social engineering reports without a technical vulnerability in this project

## Maintainer checklist

Before publishing a security-sensitive release, maintainers should verify:

- `pnpm check`
- `pnpm rust:check`
- Tauri capabilities stay minimal
- CSP remains restrictive
- Setup Center command execution remains allowlisted and confirmation-gated
- tokens and private URLs are not logged
- release artifacts include checksums
- signed and notarized builds are used once signing infrastructure exists

