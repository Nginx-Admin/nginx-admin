// 与 nginx-admin 后端 REST API 对接的类型定义与客户端。

export interface User {
  id: string;
  username: string;
  role: "admin" | "editor" | "viewer";
}

export interface Server {
  id: string;
  name: string;
  address: string;
  status: string;
  nginx_version: string;
  last_seen_at: string | null;
  labels: string;
  created_at: string;
}

export interface ServerStatus {
  nginx_running: boolean;
  nginx_version: string;
  master_pid: number;
  config_root: string;
  last_test_ok: boolean;
  last_test_output: string;
}

export interface ConfigFileInfo {
  logical_path: string;
  size: number;
  mtime_unix: number;
  checksum: string;
}

export interface ReadConfigResp {
  path: string;
  content: string;
  checksum: string;
}

export interface WriteConfigResp {
  ok: boolean;
  new_checksum?: string;
  backup_ref?: string;
  error?: string;
}

export interface TestResp {
  ok: boolean;
  output: string;
}

export interface CentralBackup {
  id: string;
  server_id: string;
  logical_path: string;
  snapshot_ref: string;
  checksum: string;
  created_by: string;
  note: string;
  created_at: string;
}

export interface LocalBackup {
  backup_ref: string;
  logical_path: string;
  checksum: string;
  created_at_unix: number;
  note: string;
}

export interface AuditLog {
  id: number;
  actor_id: string;
  server_id: string;
  action: string;
  target: string;
  result: string;
  detail: string;
  created_at: string;
}

const TOKEN_KEY = "nginx_admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const resp = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (resp.status === 401) {
    clearToken();
    if (!path.startsWith("/auth/login")) {
      window.location.hash = "#/login";
    }
  }

  const text = await resp.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!resp.ok) {
    const msg =
      (data as { error?: string })?.error || `请求失败 (${resp.status})`;
    throw new ApiError(resp.status, msg);
  }
  return data as T;
}

export const api = {
  // 认证
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>("POST", "/auth/login", {
      username,
      password,
    }),
  me: () => request<User>("GET", "/auth/me"),
  changePassword: (old_password: string, new_password: string) =>
    request<{ ok: boolean }>("POST", "/auth/change-password", {
      old_password,
      new_password,
    }),

  // 服务器
  listServers: () => request<{ servers: Server[] }>("GET", "/servers"),
  createServer: (name: string, address: string, labels?: string) =>
    request<Server>("POST", "/servers", { name, address, labels }),
  getServer: (id: string) => request<Server>("GET", `/servers/${id}`),
  updateServer: (id: string, name: string, address: string, labels?: string) =>
    request<Server>("PUT", `/servers/${id}`, { name, address, labels }),
  deleteServer: (id: string) =>
    request<{ ok: boolean }>("DELETE", `/servers/${id}`),
  serverStatus: (id: string) =>
    request<ServerStatus>("GET", `/servers/${id}/status`),
  discover: (id: string) =>
    request<{ files: ConfigFileInfo[]; server_names: string[] }>(
      "POST",
      `/servers/${id}/discover`
    ),

  // 配置
  listConfigs: (id: string) =>
    request<{ files: ConfigFileInfo[] }>("GET", `/servers/${id}/configs`),
  readConfig: (id: string, path: string) =>
    request<ReadConfigResp>(
      "GET",
      `/servers/${id}/config?path=${encodeURIComponent(path)}`
    ),
  writeConfig: (
    id: string,
    path: string,
    content: string,
    expected_checksum?: string
  ) =>
    request<WriteConfigResp>("PUT", `/servers/${id}/config`, {
      path,
      content,
      expected_checksum,
    }),
  test: (id: string) => request<TestResp>("POST", `/servers/${id}/test`),
  reload: (id: string) => request<TestResp>("POST", `/servers/${id}/reload`),

  // 备份/回滚
  listBackups: (id: string, path?: string) =>
    request<{ central: CentralBackup[]; local: LocalBackup[] }>(
      "GET",
      `/servers/${id}/backups${path ? `?path=${encodeURIComponent(path)}` : ""}`
    ),
  rollback: (id: string, backup_ref: string) =>
    request<{ ok: boolean; output: string; error: string }>(
      "POST",
      `/servers/${id}/rollback`,
      { backup_ref }
    ),

  // 审计
  listAudit: () => request<{ logs: AuditLog[] }>("GET", "/audit"),
};
