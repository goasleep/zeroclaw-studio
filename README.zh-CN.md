# 🦀 zeroclaw-workspace

[English](README.md) | [简体中文](README.zh-CN.md)

> 由 [ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw) 驱动的分布式 AI
> 生产力工作区。它可以把任意本地或远程 `zeroclaw` 节点接入同一个原生桌面工作区，
> 用于文件、聊天、工具、记忆、定时任务、剪贴板、通知和长时间运行的 agent 工作。

## 这是什么

`zeroclaw-workspace` 是一个 Tauri 2 桌面应用，用来把本地文件、远程机器、工具、记忆和自动化任务放到一个可操作的工作区里。桌面应用是生产力层；`zeroclaw` 是底层轻量运行时。

应用可以启动自己内置的 `zeroclaw` gateway，也可以附加到已有本地 gateway，或通过可信网络路径连接远程 gateway。这意味着首次本地使用不需要先安装 `zeroclaw` CLI，同时远程和 homelab 工作流依然是一等场景。

它不是把 AI 当成单个聊天框，而是让你选择工作应该在哪里运行：

- 在笔记本上运行快速本地任务；
- 在 homelab Pi 或 NAS 上保留长时间运行的自动化任务；
- 使用云 VM 处理常驻或更重的任务；
- 通过 SSH、Tailscale、VPN 或内网主机访问私有资源。

这个应用独立于主 `zeroclaw` 仓库。它通过 HTTP/WebSocket 与 `zeroclaw` gateway 通信，每个 gateway 可以是：

- **本地托管**：workspace 启动并监督一个 `zeroclaw` 进程。
- **内置运行时**：全新安装会获得一个应用私有的 bundled `zeroclaw` runtime，与用户级 `~/.zeroclaw/` 和默认 gateway 端口隔离。
- **本地附加**：workspace 连接到你已经启动的 gateway，例如 systemd、launchd 或 `zeroclaw service start`。
- **远程**：指向任意可访问 URL，例如 SSH tunnel、Tailscale、VPN 或公网 TLS。你不需要在本机安装 `zeroclaw`，也可以从笔记本管理 homelab Pi 或云 VM。

ZeroClaw 的低部署成本是这个项目的核心：AI 能力可以运行在工作所在的位置，而桌面应用提供一个统一入口，用来连接、操作、观察和介入。

workspace UI 是跨平台的。内置运行时使用自己的应用数据配置目录，不会修改你的用户级 `~/.zeroclaw/`。

## 特性

- **一个原生工作区**：把本地文件、远程机器、工具、记忆、定时任务和长时间运行的 agent 工作放在一起。
- **内置 `zeroclaw`**：通过 pinned sidecar 提供应用私有的内置运行时。
- **灵活的 gateway 拓扑**：支持 bundled、本地托管、本地附加和远程 gateway。
- **远程优先的网络路径**：支持直接 HTTP(S)、SSH tunnel、Tailscale、VPN 和私有网络路由。
- **按项目隔离的聊天会话**：支持 Markdown 响应、工具调用进度、审批提示、文件附件，以及每个会话稳定的 agent/model 上下文。
- **运维面板**：提供工具、记忆、cron、日志、doctor、设备、集成和配置等面板。
- **原生桌面能力**：文件夹选择器、文件监听、全局快捷键、剪贴板、通知和 `zeroclaw://` 深链接。
- **独立客户端，简单 gateway 合约**：不在 Rust crate 层面耦合主 `zeroclaw` 仓库。

## 这不是什么

- 不是 `zeroclaw-labs/zeroclaw` 中 `apps/tauri/` 的系统托盘启动器。那个应用是 `zeroclaw-desktop`，是 gateway Web UI 的轻量 WebView shell；本项目是独立且更完整的客户端。
- 不是 `zeroclaw` 的 fork。它不在 Rust crate 层面耦合主仓库，只依赖 gateway HTTP/WS 合约，以及在托管本地连接时可选依赖 `zeroclaw` 二进制。

## 安装

预构建桌面产物由 tag 触发的 GitHub Releases 生成：

- macOS arm64：`.dmg` / `.app`
- Linux：`.deb` / AppImage
- Windows：`.msi` / NSIS `.exe`

从 [GitHub Releases](https://github.com/goasleep/zeroclaw-workspace/releases) 下载最新已发布构建。

Release 构建包含 pinned 的 bundled `zeroclaw v0.8.0` sidecar，供应用私有的内置运行时使用。你仍然可以在需要其他 runtime 时，把应用指向自己的本地或远程 gateway。

内置 runtime 的 ZeroClaw 数据存放在应用的每用户 Tauri data 目录下，也就是其中的 `inner-zeroclaw/` 子目录。启动时，workspace 会把 `ZEROCLAW_CONFIG_DIR` 和 `ZEROCLAW_HOME` 都指向这个目录，从而让 bundled runtime 与用户级 `~/.zeroclaw/` 隔离。

当前 release 产物尚未签名。在 macOS 上，Gatekeeper 可能要求安装后移除 quarantine 属性：

```bash
xattr -dr com.apple.quarantine /Applications/ZeroClaw\ Workspace.app
```

签名和 notarization 计划在后续 release 中加入。

## 快速开始

全新安装可以从 bundled 的应用私有 `zeroclaw` gateway 开始，因此不单独安装 `zeroclaw` 也能先尝试本地工作流。你也可以连接同一台机器、另一台主机，或 SSH/Tailscale/VPN 路由后的 gateway。

1. 启动 ZeroClaw Workspace。
2. 使用 bundled 内置运行时，或选择其他连接模式：
   - **本地托管**：让 workspace 查找并监督用户本地安装的 `zeroclaw` 二进制。
   - **本地附加**：连接到你已经启动的 gateway。
   - **远程**：输入可访问 URL，或配置 SSH tunneled target。
3. 按提示将 workspace 与 gateway 配对。
4. 打开 workspace 文件夹，选择 agent，然后开始聊天。

每个聊天会话一旦有消息，就会保持稳定的 agent 上下文。想在同一个 workspace 里切换到另一个 agent 时，请新建会话。

除非你想使用外部本地托管连接，否则桌面应用不要求用户级安装 `zeroclaw`。

## Gateway 兼容性

ZeroClaw Workspace 通过 HTTP、WebSocket 和 SSE 与 gateway 通信。Gateway 兼容性还未稳定；涉及 gateway 合约的改动应使用匹配版本的 `zeroclaw` 构建测试。

## 平台支持

项目面向当前稳定的 Tauri 2 桌面平台：

| 平台 | 架构 | 状态 |
| --- | --- | --- |
| macOS | arm64 | release 构建支持 |
| Linux | x86_64 | release 构建支持 |
| Windows | x86_64 | release 构建支持 |

当 Tauri 和兼容的 `zeroclaw` gateway 可用时，源码构建可能支持更多 target，但这些 target 暂不属于 release matrix。

## 开发

要求：

- Rust stable，由 `rust-toolchain.toml` 固定
- Node 22+，由 `.nvmrc` 固定
- pnpm
- 对应操作系统的 Tauri 2 系统依赖

```bash
pnpm install
pnpm desktop:dev
```

常用检查：

```bash
pnpm check
pnpm rust:check
```

构建桌面安装包：

```bash
pnpm desktop:build
```

格式化、生成的 Tauri command bindings 和 PR 流程见 [`docs/development.md`](docs/development.md)。

## 仓库结构

- `src/`：React + Vite 前端。
- `src-tauri/`：Tauri Rust 后端、原生命令、gateway client、runtime supervision、连接存储和 workspace 文件集成。
- `docs/`：架构、开发指南和 gateway 协议说明。
- `.github/workflows/`：CI 和 release 自动化。

## 文档

- [`docs/architecture.md`](docs/architecture.md)：产品和技术模型。
- [`docs/development.md`](docs/development.md)：本地开发流程。
- [`docs/gateway-protocol-notes.md`](docs/gateway-protocol-notes.md)：gateway 协议说明。
- [`SECURITY.md`](SECURITY.md)：支持版本、漏洞报告、数据边界和安全说明。

## 安全说明

这是一个带原生能力的桌面应用。它可以连接远程 gateway，在每用户 app data 中存储 gateway token，打开 SSH tunnel，读写已选择 workspace 内的文件，通过显式功能访问剪贴板文本，并启动一个托管的本地 `zeroclaw` 进程。

只连接你管理或信任的 gateway。在将应用用于敏感仓库、私有主机或共享诊断日志前，请先阅读 [`SECURITY.md`](SECURITY.md)。

## 数据和隐私速览

- Gateway token 存储在每用户 app data 中，目前还不是 OS keychain。
- 内置 `zeroclaw` 的数据位于 app data 下的 `inner-zeroclaw/` 目录，与用户级 `~/.zeroclaw/` 分离。
- Workspace 文件功能只操作你在应用中打开的文件夹。
- 远程 gateway 可以影响 UI 中展示的数据；只连接你信任的 gateway。
- 分享日志或诊断归档前，请脱敏 token、私有 URL、主机名、文件路径和个人数据。

## 已知限制

- 接口和 gateway 兼容性在稳定 release 前可能变化。
- Release 产物尚未签名或 notarize。
- Gateway bearer token 当前存储在每用户 Tauri store 中，而不是 OS keychain。
- 前端测试覆盖目前比 Rust 覆盖轻；提交 PR 前请运行文档中的检查。
- 在更完整的 OpenAPI 覆盖落地前，部分 gateway schema 来自上游源码推断。

## 贡献

欢迎贡献。项目仍在成形中，请先阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)，运行上述检查，并在改动 gateway 行为、原生能力或复用上游代码时更新相关文档。

npm package 和 Rust crate 暂不发布。桌面 release 通过 GitHub Releases 分发。

## 许可证

本项目使用 MIT 或 Apache-2.0 双许可证，与上游 `zeroclaw` 仓库保持一致。参见 [`LICENSE-MIT`](LICENSE-MIT) 和 [`LICENSE-APACHE`](LICENSE-APACHE)。
