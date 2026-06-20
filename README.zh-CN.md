# 🦀 ZeroClaw Studio

[English](README.md) | [简体中文](README.zh-CN.md)

> 由 [ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw) 驱动的原生 AI
> 生产力工作区。让 agent 工作运行在文件、机器、工具、记忆和自动化任务本来所在的位置。

ZeroClaw Studio 内置一个固定版本、应用私有的 `zeroclaw` runtime。
全新安装后，不需要先安装 CLI，也可以直接启动本地 gateway。需要把工作放到
其他机器上运行时，同一个桌面应用也可以通过 HTTP、WebSocket 和 SSE 连接本地附加或远程 ZeroClaw gateway。

[下载最新 release](https://github.com/goasleep/zeroclaw-studio/releases)
· [快速开始](#快速开始)
· [运行模式](#运行模式)
· [安全说明](#安全说明)
· [开发](#开发)

## 这是什么

`zeroclaw-studio` 是一个 Tauri 2 桌面应用，用来把本地文件、远程机器、工具、记忆、定时任务和长时间运行的 agent 会话放到一个可操作的工作区里。
它是 ZeroClaw-powered 工作的产品界面：桌面应用提供专注的工作区，`zeroclaw` 提供底层轻量 runtime 和 gateway。

默认路径很简单：启动应用，使用 bundled 的应用私有 runtime，完成配对，打开文件夹，然后开始聊天。同一个应用也可以附加到用户自己管理的本地 gateway，或者通过可信网络路径连接远程 gateway。

它不是把 AI 当成单个聊天框，而是让你选择工作应该在哪里运行：

- 在笔记本上运行快速本地任务；
- 在 homelab Pi 或 NAS 上保留长时间运行的自动化任务；
- 使用云 VM 处理常驻或更重的任务；
- 通过 SSH、Tailscale、VPN 或内网主机访问私有资源。

ZeroClaw 的低部署成本是这个项目的核心：AI 能力可以运行在工作所在的位置，而桌面应用提供一个统一入口，用来连接、操作、观察和介入。

Studio UI 是跨平台的。内置运行时使用自己的应用数据配置目录，不会修改你的用户级 `~/.zeroclaw/`。

## 内置 ZeroClaw

内置 runtime 是这个产品的核心能力之一。Release 构建包含一个固定版本的 `zeroclaw`
sidecar，应用可以把它作为隔离的 inner runtime 启动并监督。这样首次使用时，你不用单独安装 CLI，也能得到一个真正的本地 ZeroClaw gateway。

这种隔离是有意设计的：

- 内置 runtime 使用应用私有的数据目录；
- 子进程会设置自己的 `ZEROCLAW_CONFIG_DIR` 和 `ZEROCLAW_HOME`；
- 它不会使用默认的用户级 `~/.zeroclaw/`；
- 之后你仍然可以连接自己的本地或远程 gateway。

Bundled gateway 会把 ZeroClaw 的 runtime 模型带进桌面应用：在 pinned runtime 支持的范围内，包括 sessions、tools、memory、cron、logs、doctor checks、pairing 和 gateway events。

## 使用场景

- **无需配置，先从本地开始**：下载桌面应用，使用内置 runtime，打开项目文件夹，然后开始工作。
- **跨机器工作**：桌面 UI 留在笔记本上，gateway 可以运行在 homelab Pi、NAS、工作站或云 VM 上。
- **让长任务靠近资源运行**：把定时任务和自动化放在私有文件、内部 API 或常驻主机附近。
- **观察并介入**：在一个原生工作区里查看聊天、工具进度、记忆、cron、日志、doctor checks、配置和审批。
- **选择信任边界**：本地工作可以使用应用私有 runtime；远程工作只连接你管理和信任的 gateway。

## 特性

- **一个原生工作区**：把本地文件、远程机器、工具、记忆、定时任务和长时间运行的 agent 工作放在一起。
- **内置 `zeroclaw`**：通过 pinned sidecar 提供应用私有的内置运行时。
- **灵活的 gateway 拓扑**：支持 bundled、本地托管、本地附加和远程 gateway。
- **远程优先的网络路径**：支持直接 HTTP(S)、SSH tunnel、Tailscale、VPN 和私有网络路由。
- **按项目隔离的聊天会话**：支持 Markdown 响应、工具调用进度、审批提示、文件附件，以及每个会话稳定的 agent/model 上下文。
- **运维面板**：提供工具、记忆、cron、日志、doctor、设备、集成和配置等面板。
- **原生桌面能力**：文件夹选择器、文件监听、全局快捷键、剪贴板、通知和 `zeroclaw://` 深链接。
- **独立客户端，简单 gateway 合约**：不在 Rust crate 层面耦合主 `zeroclaw` 仓库。

## 界面概览

| 区域             | 说明                                                                                                                               | 预览                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 工作区聊天       | 面向项目的聊天会话，连接本地 `zeroclaw` runtime，并在一个桌面窗口里展示运行时状态、workspace 上下文、会话历史、附件和 agent 选择。 | ![ZeroClaw Studio 桌面端工作区聊天界面](images/workspace-chat.png) |
| 运行时和应用设置 | 展示本地 runtime 状态、workspace 文件夹上下文、偏好设置、原生通知、托盘集成、深链接注册，以及运维和能力面板导航。                  | ![ZeroClaw Studio 桌面端设置面板](images/runtime-settings.png)     |

## 运行模式

| 模式               | 是否需要本机安装 `zeroclaw` | 适合场景                                                                           |
| ------------------ | --------------------------- | ---------------------------------------------------------------------------------- |
| 内置 inner runtime | 不需要                      | 首次使用、本地项目工作、不想先配置 CLI 就试用应用                                  |
| 本地托管           | 需要                        | 使用你自己的本地 `zeroclaw` 二进制，同时让 workspace 负责监督进程                  |
| 本地附加           | 本地已运行                  | 连接由 launchd、systemd、`zeroclaw service start` 或其他 supervisor 管理的 gateway |
| 远程               | 不需要                      | 从桌面管理 homelab、服务器、工作站或云 VM                                          |

## 这不是什么

- 不是 `zeroclaw-labs/zeroclaw` 中 `apps/tauri/` 的系统托盘启动器。那个应用是 `zeroclaw-desktop`，是 gateway Web UI 的轻量 WebView shell；本项目是独立且更完整的客户端。
- 不是 `zeroclaw` 的 fork。它不在 Rust crate 层面耦合主仓库，只依赖 gateway HTTP/WS 合约，以及在托管本地连接时可选依赖 `zeroclaw` 二进制。

## 安装

预构建桌面产物由 tag 触发的 GitHub Releases 生成：

- macOS arm64：`.dmg` / `.app`
- Linux：`.deb` / AppImage
- Windows：`.msi` / NSIS `.exe`

从 [GitHub Releases](https://github.com/goasleep/zeroclaw-studio/releases) 下载最新已发布构建。

Release 构建包含 pinned 的 bundled `zeroclaw v0.8.0` sidecar，供应用私有的内置运行时使用。你仍然可以在需要其他 runtime 时，把应用指向自己的本地或远程 gateway。

内置 runtime 的 ZeroClaw 数据存放在应用的每用户 Tauri data 目录下，也就是其中的 `inner-zeroclaw/` 子目录。启动时，workspace 会把 `ZEROCLAW_CONFIG_DIR` 和 `ZEROCLAW_HOME` 都指向这个目录，从而让 bundled runtime 与用户级 `~/.zeroclaw/` 隔离。

当前 release 产物尚未签名。在 macOS 上，Gatekeeper 可能要求安装后移除 quarantine 属性：

```bash
xattr -dr com.apple.quarantine /Applications/ZeroClaw\ Studio.app
```

签名和 notarization 计划在后续 release 中加入。

## 快速开始

全新安装可以从 bundled 的应用私有 `zeroclaw` gateway 开始，因此不单独安装 `zeroclaw` 也能先尝试本地工作流。你也可以连接同一台机器、另一台主机，或 SSH/Tailscale/VPN 路由后的 gateway。

1. 启动 ZeroClaw Studio。
2. 使用 bundled 内置运行时，或选择其他连接模式：
   - **本地托管**：让 workspace 查找并监督用户本地安装的 `zeroclaw` 二进制。
   - **本地附加**：连接到你已经启动的 gateway。
   - **远程**：输入可访问 URL，或配置 SSH tunneled target。
3. 按提示将 workspace 与 gateway 配对。
4. 打开 workspace 文件夹，选择 agent，然后开始聊天。

每个聊天会话一旦有消息，就会保持稳定的 agent 上下文。想在同一个 workspace 里切换到另一个 agent 时，请新建会话。

除非你想使用外部本地托管连接，否则桌面应用不要求用户级安装 `zeroclaw`。

## Gateway 兼容性

ZeroClaw Studio 通过 HTTP、WebSocket 和 SSE 与 gateway 通信。Gateway 兼容性还未稳定；涉及 gateway 合约的改动应使用匹配版本的 `zeroclaw` 构建测试。

## 平台支持

项目面向当前稳定的 Tauri 2 桌面平台：

| 平台    | 架构   | 状态             |
| ------- | ------ | ---------------- |
| macOS   | arm64  | release 构建支持 |
| Linux   | x86_64 | release 构建支持 |
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
- [`docs/product-data-boundaries.md`](docs/product-data-boundaries.md)：Studio、ZeroClaw 和用户资源之间的产品数据归属。
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
