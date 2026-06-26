import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  api,
  type ConfigFileInfo,
  type Server,
  type ServerStatus,
} from "../api/client";
import { Button, statusBadge } from "../components/ui";
import { useAuth } from "../auth/AuthContext";

export default function ServerDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [server, setServer] = useState<Server | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [files, setFiles] = useState<ConfigFileInfo[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const canEdit = user?.role === "admin" || user?.role === "editor";
  const isAdmin = user?.role === "admin";

  const loadServer = useCallback(() => {
    api.getServer(id).then(setServer).catch((e) => setErr((e as Error).message));
  }, [id]);

  const loadStatus = useCallback(() => {
    setErr("");
    api
      .serverStatus(id)
      .then(setStatus)
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  const loadConfigs = useCallback(() => {
    api
      .listConfigs(id)
      .then((r) => setFiles(r.files || []))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    loadServer();
    loadStatus();
    loadConfigs();
  }, [loadServer, loadStatus, loadConfigs]);

  const doDiscover = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await api.discover(id);
      setFiles(r.files || []);
      setMsg(`发现 ${r.files?.length || 0} 个配置文件，站点：${r.server_names?.join(", ") || "—"}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doReload = async () => {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const r = await api.reload(id);
      if (r.ok) setMsg("reload 成功");
      else setErr("reload 失败：" + r.output);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doTest = async () => {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const r = await api.test(id);
      if (r.ok) setMsg("nginx -t 通过\n" + r.output);
      else setErr("nginx -t 失败：\n" + r.output);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!confirm("确定删除该服务器？仅从中心移除，不影响 Agent 本机。")) return;
    await api.deleteServer(id);
    nav("/");
  };

  return (
    <div className="p-6">
      <button
        onClick={() => nav("/")}
        className="mb-3 text-sm text-slate-500 hover:text-slate-700"
      >
        ← 返回服务器列表
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            {server?.name || "服务器"}
          </h1>
          <p className="text-sm text-slate-500">{server?.address}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadStatus} disabled={busy}>
            刷新状态
          </Button>
          {canEdit && (
            <Button variant="secondary" onClick={doTest} disabled={busy}>
              nginx -t
            </Button>
          )}
          {canEdit && (
            <Button onClick={doReload} disabled={busy}>
              Reload
            </Button>
          )}
          {isAdmin && (
            <Button variant="danger" onClick={doDelete}>
              删除
            </Button>
          )}
        </div>
      </div>

      {/* 状态卡片 */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="连接状态" value={statusBadge(server?.status || "unknown")} />
        <StatCard
          label="nginx 进程"
          value={
            status?.nginx_running ? (
              <span className="text-green-600">运行中</span>
            ) : (
              <span className="text-red-600">未运行</span>
            )
          }
        />
        <StatCard label="版本" value={status?.nginx_version || "-"} />
        <StatCard
          label="配置检查"
          value={
            status?.last_test_ok ? (
              <span className="text-green-600">通过</span>
            ) : (
              <span className="text-amber-600">异常</span>
            )
          }
        />
      </div>

      {msg && (
        <pre className="code mt-3 whitespace-pre-wrap rounded-md bg-green-50 p-3 text-xs text-green-800">
          {msg}
        </pre>
      )}
      {err && (
        <pre className="code mt-3 whitespace-pre-wrap rounded-md bg-red-50 p-3 text-xs text-red-700">
          {err}
        </pre>
      )}

      {/* 配置文件 */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-lg font-medium text-slate-800">配置文件</h2>
        {canEdit && (
          <Button variant="secondary" onClick={doDiscover} disabled={busy}>
            配置发现
          </Button>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {files.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            暂无配置文件，点击「配置发现」扫描。
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">逻辑路径</th>
                <th className="px-4 py-2 font-medium">大小</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {files.map((f) => (
                <tr key={f.logical_path} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-slate-700">
                    {f.logical_path}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{f.size} B</td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        nav(
                          `/servers/${id}/edit?path=${encodeURIComponent(
                            f.logical_path
                          )}`
                        )
                      }
                    >
                      {canEdit ? "编辑" : "查看"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}
