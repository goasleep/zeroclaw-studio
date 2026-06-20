import type {
  ChatCloseRequest,
  ChatConnectRequest,
  ChatFileEntry,
  ChatSendRequest,
  ConfigSummaries,
  Connection,
  ConnectionProbeResult,
  GatewayHttpRequest,
  GatewayHttpResponse,
  PrepareChatAttachmentsRequest,
  SetupActionRequest,
  SetupContext,
  SetupStatus,
  WorkspaceGitStatus,
  WorkspaceLocalState,
} from "@/api/bindings";

export type {
  AgentSummary,
  AgentWorkspaceAgent,
  AgentWorkspaceEntry,
  AuthConfig,
  AuthMode,
  ChatCapabilities,
  ChatCloseRequest,
  ChatConnectRequest,
  ChatError,
  ChatFileEntry,
  ChatMode,
  ChatSendRequest,
  ChatSessionInfo,
  ConfigSummaries,
  ConfigSummaryError,
  Connection,
  ConnectionProbeResult,
  DetectedBinary,
  DirEntry,
  DiscoveredLocal,
  GatewayHttpError,
  GatewayHttpRequest,
  GatewayHttpResponse,
  InstallInstructions,
  Lifecycle,
  PairResult,
  PrepareChatAttachmentsRequest,
  RiskProfileSummary,
  RuntimeProfileSummary,
  SessionWorkspaceBinding,
  SetupAction,
  SetupActionId,
  SetupActionRequest,
  SetupActionResult,
  SetupCapabilityId,
  SetupCheck,
  SetupCheckStatus,
  SetupConfigRecommendation,
  SetupConfigValue,
  SetupContext,
  SetupOverallStatus,
  SetupRemediation,
  SetupStatus,
  SshConfig,
  SupervisorStatus,
  Transport,
  WorkspaceGitStatus,
  WorkspaceLocalState,
} from "@/api/bindings";

export interface HealthEvent {
  connection_id: string | null;
  url: string | null;
  healthy: boolean;
}

export type ActivationStep =
  | { type: "started"; connection_id: string }
  | { type: "probing" }
  | { type: "starting_gateway"; binary_path: string }
  | { type: "awaiting_healthy" }
  | { type: "pairing" }
  | { type: "ready" }
  | { type: "binary_missing" }
  | { type: "needs_manual_pairing" }
  | { type: "failed"; message: string };

export interface FileEvent {
  path: string;
  kind: "created" | "modified" | "removed" | "other";
}

const connectionId = import.meta.env.VITE_E2E_ACTIVE_CONNECTION_ID ?? crypto.randomUUID();

function browserBaseUrl() {
  return window.location.origin;
}

function activeConnection(): Connection {
  return {
    id: connectionId,
    name: "ZeroClaw Studio Test Gateway",
    transport: "local",
    url: browserBaseUrl(),
    ssh: null,
    auth: { mode: "pairing", token: null },
    lifecycle: "managed",
    runtime_source: "bundled_inner",
    binary_path: null,
  };
}

function emptyWorkspaceState(): WorkspaceLocalState {
  return {
    current_root: null,
    recent_roots: [],
  };
}

export const listConnections = async () => [activeConnection()];

export const getActiveConnection = async () => activeConnection();

export const upsertConnection = async (_conn: Connection) => {};

export const removeConnection = async (_id: string) => {};

export const setActiveConnection = async (_id: string | null) => {};

export const reactivate = async () => {};

export const connectionProbe = async (id: string): Promise<ConnectionProbeResult> => ({
  connection_id: id,
  reachable: true,
  latency_ms: 1,
  status: "ok",
  error: null,
  checked_at: new Date().toISOString(),
});

export const discoverLocalGateway = async () => ({
  url: browserBaseUrl(),
  healthy: true,
  require_pairing: false,
});

export const ensureToken = async (_id: string) => ({ outcome: "not_required", token: null });

export const pairWithCode = async (_id: string, _code: string) => ({
  outcome: "issued",
  token: null,
});

export const chatConnect = async (_req: ChatConnectRequest) => ({
  session_id: crypto.randomUUID(),
});

export const chatSend = async (_req: ChatSendRequest) => {};

export const chatDisconnect = async (_req: ChatCloseRequest) => {};

export const chatCapabilities = async () => ({
  max_attachment_bytes: 1_000_000,
  max_attachment_request_bytes: 5_000_000,
});

export const prepareChatAttachments = async (
  _req: PrepareChatAttachmentsRequest,
): Promise<ChatFileEntry[]> => [];

export const detectLocalBinary = async () => null;

export const installInstructions = async () => ({
  command: "zeroclaw is bundled in ZeroClaw Studio tests",
  notes: [],
  docs_url: "https://github.com/zeroclaw-labs/zeroclaw",
});

export const runtimeStart = async (_id: string) => {};

export const runtimeStop = async () => {};

export const runtimeStatus = async () => "Running";

export const setupGetStatus = async (_context: SetupContext): Promise<SetupStatus> => ({
  capability_id: "mcp_stdio",
  title: "ZeroClaw Studio browser e2e",
  summary: "Browser e2e mode uses a mocked Tauri shell.",
  overall: "ready",
  checks: [],
  actions: [],
  remediations: [],
  config_recommendations: [],
});

export const setupRunAction = async (_req: SetupActionRequest) => ({
  success: true,
  exit_code: 0,
  stdout: "",
  stderr: "",
});

export const sshOpenTunnel = async (_id: string) => "";

export const sshCloseTunnel = async (_id: string) => {};

export async function gatewayRequest(req: GatewayHttpRequest): Promise<GatewayHttpResponse> {
  const target = new URL(req.url);
  const response = await fetch(`${target.pathname}${target.search}`, {
    method: req.method,
    headers: req.headers,
    body: req.body ?? undefined,
  });
  return {
    status: response.status,
    headers: Array.from(response.headers.entries()),
    body: await response.text(),
  };
}

export const configGetSummaries = async (): Promise<ConfigSummaries> => ({
  agents: [],
  risk_profiles: [],
  runtime_profiles: [],
});

export const agentWorkspaceListAgents = async () => [];

export const agentWorkspaceListDir = async (_alias: string, _path: string | null = null) => [];

export const agentWorkspaceReadFile = async (_alias: string, _path: string) => "";

export const agentWorkspaceWriteFile = async (
  _alias: string,
  _path: string,
  _content: string,
) => {};

export const agentWorkspaceCreateFile = async (_alias: string, _path: string, _content = "") => {};

export const agentWorkspaceCreateDir = async (_alias: string, _path: string) => {};

export const agentWorkspaceDelete = async (_alias: string, _path: string) => {};

export const workspaceOpenRoot = async (
  _connectionId: string,
  path: string,
): Promise<WorkspaceLocalState> => ({
  ...emptyWorkspaceState(),
  current_root: path,
  recent_roots: [path],
});

export const workspaceGetState = async (_connectionId: string) => emptyWorkspaceState();

export const workspaceImportLegacyState = async (
  _connectionId: string,
  _currentRoot: string | null,
  _recentRoots: string[],
) => emptyWorkspaceState();

export const workspaceGetRoot = async () => null;

export const workspaceListDir = async (_path: string) => [];

export const workspaceReadFile = async (_path: string) => "";

export const workspaceWriteFile = async (_path: string, _content: string) => {};

export const workspaceWatchStart = async (_path: string | null = null) => {};

export const workspaceWatchStop = async () => {};

export const workspaceGitStatus = async (_root: string): Promise<WorkspaceGitStatus> => ({
  root: _root,
  is_repo: false,
  branch: null,
  changed_count: 0,
  diff_stat: null,
});

export const chatLocalGetSelectedSession = async (
  _connectionId: string,
  _workspaceRoot: string | null,
  _mode: string,
  _agentAlias: string,
) => null;

export const chatLocalSetSelectedSession = async (
  _connectionId: string,
  _workspaceRoot: string | null,
  _mode: string,
  _agentAlias: string,
  _sessionId: string | null,
) => {};

export const chatLocalListSessionWorkspaces = async (_connectionId: string) => [];

export const chatLocalAssignSessionWorkspace = async (
  _connectionId: string,
  _sessionId: string,
  _workspaceRoot: string,
) => {};
