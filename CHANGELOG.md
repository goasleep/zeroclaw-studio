# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
