import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Server } from "../api/client";
import { Button, statusBadge } from "../components/ui";
import ServerMigrationModal from "../components/ServerMigrationModal";
import { useAuth } from "../auth/AuthContext";
import { downloadServerBundle } from "../utils/serverExport";

const UNGROUPED = "未分组";

// 从 server.labels（JSON 字符串）解析分组名。
function groupOf(s: Server): string {
  try {
    const obj = JSON.parse(s.labels || "{}");
    const g = (obj.group ?? "").toString().trim();
    return g || UNGROUPED;
  } catch {
    return UNGROUPED;
  }
}

// 把分组名写回 labels JSON（保留其它已有标签）。
function buildLabels(existing: string, group: string): string {
  let obj: Record<string, unknown> = {};
  try {
    obj = JSON.parse(existing || "{}");
  } catch {
    obj = {};
  }
  const g = group.trim();
  if (g) obj.group = g;
  else delete obj.group;
  return JSON.stringify(obj);
}

export default function Servers() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Server | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showMigration, setShowMigration] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .listServers()
      .then((r) => setServers(r.servers || []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const isAdmin = user?.role === "admin";

  // 按分组聚合，分组内按名称排序，分组按名称排序（未分组置底）。
  const groups = useMemo(() => {
    const map = new Map<string, Server[]>();
    for (const s of servers) {
      const g = groupOf(s);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    }
    const names = Array.from(map.keys()).sort((a, b) => {
      if (a === UNGROUPED) return 1;
      if (b === UNGROUPED) return -1;
      return a.localeCompare(b);
    });
    return names.map((name) => ({
      name,
      items: map.get(name)!.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [servers]);

  // 已有分组名（供表单下拉建议）
  const existingGroups = useMemo(
    () =>
      Array.from(new Set(servers.map(groupOf))).filter((g) => g !== UNGROUPED),
    [servers]
  );

  const toggle = (name: string) =>
    setCollapsed((c) => ({ ...c, [name]: !c[name] }));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected =
    servers.length > 0 && servers.every((s) => selected.has(s.id));

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(servers.map((s) => s.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const refreshAllStatus = async () => {
    if (servers.length === 0) return;
    setRefreshingAll(true);
    setErr("");
    try {
      await Promise.allSettled(
        servers.map((s) => api.serverStatus(s.id))
      );
      load();
    } finally {
      setRefreshingAll(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">服务列表</h1>
        <div className="flex flex-wrap items-center gap-2">
          {servers.length > 0 && (
            <Button
              variant="info"
              onClick={refreshAllStatus}
              disabled={refreshingAll || loading}
            >
              {refreshingAll ? "刷新中…" : "刷新全部状态"}
            </Button>
          )}
          {isAdmin && (
            <Button variant="secondary" onClick={() => setShowMigration(true)}>
              迁移
            </Button>
          )}
          {isAdmin && (
            <Button onClick={() => setShowCreate(true)}>+ 新增服务</Button>
          )}
        </div>
      </div>

      {isAdmin && selected.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50/80 px-4 py-2 text-sm dark:border-brand-900 dark:bg-brand-950/40">
          <span className="text-brand-800 dark:text-brand-200">
            已选择 <strong>{selected.size}</strong> 项
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMigration(true)}
              className="font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              迁移导出
            </button>
            <span className="text-brand-300">|</span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-slate-600 hover:underline dark:text-slate-400"
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
      {loading ? (
        <p className="text-slate-400">加载中...</p>
      ) : servers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-400">
          还没有纳管任何服务。{isAdmin && "点击右上角新增。"}
        </div>
      ) : (
        <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
          {groups.map((g) => (
            <section
              key={g.name}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              {/* 分组头 */}
              <button
                onClick={() => toggle(g.name)}
                className="flex w-full items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-left hover:bg-slate-100"
              >
                <span className="text-slate-400">
                  {collapsed[g.name] ? "▸" : "▾"}
                </span>
                <span
                  className={`h-2 w-2 rounded-full ${
                    g.name === UNGROUPED ? "bg-slate-300" : "bg-brand-500"
                  }`}
                />
                <span className="text-sm font-semibold text-slate-700">
                  {g.name}
                </span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                  {g.items.length}
                </span>
              </button>

              {/* 分组内服务表 */}
              {!collapsed[g.name] && (
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      {isAdmin && (
                        <th className="w-10 px-2 py-2">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            aria-label="全选"
                          />
                        </th>
                      )}
                      <th className="px-4 py-2 font-medium">名称</th>
                      <th className="px-4 py-2 font-medium">地址</th>
                      <th className="px-4 py-2 font-medium">状态</th>
                      <th className="px-4 py-2 font-medium">nginx 版本</th>
                      <th className="px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {g.items.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        {isAdmin && (
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(s.id)}
                              onChange={() => toggleSelect(s.id)}
                              aria-label={`选择 ${s.name}`}
                            />
                          </td>
                        )}
                        <td className="px-4 py-2 font-medium text-slate-800">
                          {s.name}
                        </td>
                        <td className="px-4 py-2 text-slate-600">{s.address}</td>
                        <td className="px-4 py-2">{statusBadge(s.status)}</td>
                        <td className="px-4 py-2 text-slate-600">
                          {s.nginx_version || "-"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="inline-flex items-center gap-1 text-sm">
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setEditing(s)}
                                className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                              >
                                编辑
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => nav(`/servers/${s.id}`)}
                              className="rounded px-2 py-1 font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/50"
                            >
                              管理
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
        </div>
      )}

      {(showCreate || editing) && (
        <ServerModal
          server={editing}
          groupSuggestions={existingGroups}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowCreate(false);
            setEditing(null);
            load();
          }}
        />
      )}

      {showMigration && (
        <ServerMigrationModal
          servers={servers}
          selectedIds={selected}
          onClose={() => setShowMigration(false)}
          onImported={() => {
            setShowMigration(false);
            setSelected(new Set());
            load();
          }}
        />
      )}
    </div>
  );
}

function ServerModal({
  server,
  groupSuggestions,
  onClose,
  onSaved,
}: {
  server: Server | null;
  groupSuggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!server;
  const [name, setName] = useState(server?.name ?? "");
  const [address, setAddress] = useState(server?.address ?? "");
  const [group, setGroup] = useState(
    server ? groupOfRaw(server.labels) : ""
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connMsg, setConnMsg] = useState("");

  const testConn = async () => {
    const addr = address.trim();
    if (!/:\d+$/.test(addr)) {
      setErr("地址需包含端口，例如 10.0.0.12:7443");
      return;
    }
    setTesting(true);
    setConnMsg("");
    setErr("");
    try {
      const r = await api.testConnection(addr);
      if (r.ok) {
        setConnMsg(`连通正常 · Agent ${r.agent_version || ""}`);
      } else {
        setConnMsg("");
        setErr(r.error || "无法连接 Agent");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/:\d+$/.test(address.trim())) {
      setErr("地址需包含端口，例如 10.0.0.12:7443");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const labels = buildLabels(server?.labels ?? "{}", group);
      if (isEdit && server) {
        await api.updateServer(server.id, name.trim(), address.trim(), labels);
      } else {
        await api.createServer(name.trim(), address.trim(), labels);
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!server) return;
    if (!confirm("确定删除该服务？仅从中心移除，不影响 Agent 本机。")) return;
    setBusy(true);
    setErr("");
    try {
      await api.deleteServer(server.id);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    if (!server) return;
    setBusy(true);
    setErr("");
    try {
      const bundle = await api.exportServer(server.id);
      downloadServerBundle(
        bundle,
        `nginx-admin-server-${server.name.replace(/[^\w.-]+/g, "_")}.json`
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-slate-800">
          {isEdit ? "编辑服务" : "新增服务"}
        </h2>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          名称
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="web-01"
            autoFocus
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Agent 地址 (host:port)
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="10.0.0.12:7443"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          分组
          <input
            list="group-suggestions"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="如 生产 / 测试 / 华东机房（留空则未分组）"
          />
          <datalist id="group-suggestions">
            {groupSuggestions.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>

        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="info"
            onClick={testConn}
            disabled={testing || !address.trim()}
          >
            {testing ? "测试中…" : "测试连通"}
          </Button>
          {connMsg && (
            <span className="text-sm text-green-600">{connMsg}</span>
          )}
        </div>

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {isEdit && (
            <>
              <button
                type="button"
                onClick={doExport}
                disabled={busy}
                className="text-sm text-slate-500 hover:text-slate-800 hover:underline disabled:opacity-50"
              >
                导出此服务 JSON
              </button>
              <Button
                type="button"
                variant="danger"
                onClick={doDelete}
                disabled={busy}
              >
                删除服务
              </Button>
            </>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              取消
            </button>
            <Button type="submit" disabled={busy}>
              {busy ? "保存中..." : isEdit ? "保存" : "创建"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// 解析 labels 原始 JSON 取分组（空则返回 ""，用于表单初值）。
function groupOfRaw(labels: string): string {
  try {
    const obj = JSON.parse(labels || "{}");
    return (obj.group ?? "").toString();
  } catch {
    return "";
  }
}
