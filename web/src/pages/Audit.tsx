import { useEffect, useState } from "react";
import { api, type AuditLog } from "../api/client";

export default function Audit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api
      .listAudit()
      .then((r) => setLogs(r.logs || []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const q = filter.trim().toLowerCase();
  const shown = q
    ? logs.filter(
        (l) =>
          l.action.toLowerCase().includes(q) ||
          l.target.toLowerCase().includes(q) ||
          (l.actor_username || "").toLowerCase().includes(q) ||
          (l.server_name || "").toLowerCase().includes(q) ||
          l.detail.toLowerCase().includes(q)
      )
    : logs;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">操作审计</h1>
        <input
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="搜索动作、用户、服务器、目标…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
      {loading ? (
        <p className="text-slate-400">加载中...</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">时间</th>
                <th className="px-4 py-2 font-medium">操作人</th>
                <th className="px-4 py-2 font-medium">服务器</th>
                <th className="px-4 py-2 font-medium">动作</th>
                <th className="px-4 py-2 font-medium">目标</th>
                <th className="px-4 py-2 font-medium">结果</th>
                <th className="px-4 py-2 font-medium">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    {l.actor_username || "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {l.server_name || (l.server_id ? "—" : "")}
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-700">
                    {l.action}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{l.target}</td>
                  <td className="px-4 py-2">
                    {l.result === "success" ? (
                      <span className="text-green-600">成功</span>
                    ) : (
                      <span className="text-red-600">失败</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-500 max-w-xs break-all">
                    {l.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <div className="p-8 text-center text-slate-400">
              {logs.length === 0 ? "暂无审计记录。" : "无匹配结果。"}
            </div>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400">显示最近 200 条记录</p>
    </div>
  );
}
