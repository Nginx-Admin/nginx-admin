// 与 nginx-admin 后端 REST API 对接的类型定义与客户端。

export interface User {
  id: string;
  username: string;
  role: "admin" | "editor" | "viewer";
  disabled?: boolean;
  created_at?: string;
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
  lines?: number;
  mtime_unix: number;
  checksum: string;
}

export interface ReadConfigResp {
  path: string;
  content: string;
  checksum: string;
}

export interface Directive {
  directive: string;
  line?: number;
  args: string[];
  block?: Directive[];
  comment?: string;
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
  actor_username?: string;
  server_id: string;
  server_name?: string;
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

  listUsers: () => request<{ users: User[] }>("GET", "/users"),
  createUser: (username: string, password: string, role: User["role"]) =>
    request<User>("POST", "/users", { username, password, role }),
  updateUser: (
    id: string,
    patch: { role?: User["role"]; disabled?: boolean; password?: string }
  ) => request<User>("PUT", `/users/${id}`, patch),
  deleteUser: (id: string) =>
    request<{ ok: boolean }>("DELETE", `/users/${id}`),

  getSettings: () =>
    request<{ retain_per_file: number }>("GET", "/settings"),
  updateSettings: (retain_per_file: number) =>
    request<{ retain_per_file: number }>("PUT", "/settings", {
      retain_per_file,
    }),

  listServers: () => request<{ servers: Server[] }>("GET", "/servers"),
  testConnection: (address: string) =>
    request<{ ok: boolean; agent_version?: string; error?: string }>(
      "POST",
      "/servers/test-connection",
      { address }
    ),
  createServer: (name: string, address: string, labels?: string) =>
    request<Server>("POST", "/servers", { name, address, labels }),
  getServer: (id: string) => request<Server>("GET", `/servers/${id}`),
  updateServer: (id: string, name: string, address: string, labels?: string) =>
    request<Server>("PUT", `/servers/${id}`, { name, address, labels }),
  deleteServer: (id: string) =>
    request<{ ok: boolean }>("DELETE", `/servers/${id}`),
  serverStatus: (id: string) =>
    request<ServerStatus>("GET", `/servers/${id}/status`),
  serverStatusCached: (id: string) =>
    request<ServerStatus>("GET", `/servers/${id}/status/cached`),
  discover: (id: string) =>
    request<{ files: ConfigFileInfo[]; server_names: string[] }>(
      "POST",
      `/servers/${id}/discover`
    ),

  listConfigs: (id: string) =>
    request<{ files: ConfigFileInfo[] }>("GET", `/servers/${id}/configs`),
  listUpstreams: (id: string) =>
    request<{ upstreams: { name: string; logical_path: string }[] }>(
      "GET",
      `/servers/${id}/upstreams`
    ),
  listUpstreamRefs: (id: string) =>
    request<{
      refs: {
        upstream: string;
        logical_path: string;
        server_name: string;
        location: string;
        proxy_pass: string;
      }[];
    }>("GET", `/servers/${id}/upstream-refs`),
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

  listBackups: (id: string, path?: string) =>
    request<{ local: LocalBackup[] }>(
      "GET",
      `/servers/${id}/backups${path ? `?path=${encodeURIComponent(path)}` : ""}`
    ),
  rollback: (id: string, backup_ref: string) =>
    request<{ ok: boolean; output: string; error: string }>(
      "POST",
      `/servers/${id}/rollback`,
      { backup_ref }
    ),

  deleteConfig: (id: string, path: string) =>
    request<{ ok: boolean; backup_ref?: string; error?: string }>(
      "DELETE",
      `/servers/${id}/config?path=${encodeURIComponent(path)}`
    ),

  listAudit: () => request<{ logs: AuditLog[] }>("GET", "/audit"),

  parseConfig: (content: string) =>
    request<{ directives: Directive[] }>("POST", "/nginx/parse", { content }),
  buildConfig: (directives: Directive[]) =>
    request<{ content: string }>("POST", "/nginx/build", { directives }),
};
