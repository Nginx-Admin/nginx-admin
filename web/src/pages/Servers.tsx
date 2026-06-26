import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Server } from "../api/client";
import { Button, statusBadge } from "../components/ui";
import { useAuth } from "../auth/AuthContext";

export default function Servers() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Server | null>(null);

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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">服务器</h1>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)}>+ 新增服务器</Button>
        )}
      </div>

      {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
      {loading ? (
        <p className="text-slate-400">加载中...</p>
      ) : servers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-400">
          还没有纳管任何服务器。{isAdmin && "点击右上角新增。"}
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">名称</th>
                <th className="px-4 py-2 font-medium">地址</th>
                <th className="px-4 py-2 font-medium">状态</th>
                <th className="px-4 py-2 font-medium">nginx 版本</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {servers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {s.name}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{s.address}</td>
                  <td className="px-4 py-2">{statusBadge(s.status)}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {s.nginx_version || "-"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-2">
                      {isAdmin && (
                        <Button
                          variant="secondary"
                          onClick={() => setEditing(s)}
                        >
                          编辑
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => nav(`/servers/${s.id}`)}
                      >
                        管理
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showCreate || editing) && (
        <ServerModal
          server={editing}
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
    </div>
  );
}

function ServerModal({
  server,
  onClose,
  onSaved,
}: {
  server: Server | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!server;
  const [name, setName] = useState(server?.name ?? "");
  const [address, setAddress] = useState(server?.address ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 简单校验：地址需含端口
    if (!/:\d+$/.test(address.trim())) {
      setErr("地址需包含端口，例如 10.0.0.12:7443");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      if (isEdit && server) {
        await api.updateServer(server.id, name.trim(), address.trim());
      } else {
        await api.createServer(name.trim(), address.trim());
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
    if (!confirm("确定删除该服务器？仅从中心移除，不影响 Agent 本机。")) return;
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

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-slate-800">
          {isEdit ? "编辑服务器" : "新增服务器"}
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
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
        <div className="mt-5 flex items-center gap-2">
          {isEdit && (
            <Button type="button" variant="danger" onClick={doDelete} disabled={busy}>
              删除服务器
            </Button>
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
