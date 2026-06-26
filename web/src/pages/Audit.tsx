import { useEffect, useState } from "react";
import { api, type AuditLog } from "../api/client";

export default function Audit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .listAudit()
      .then((r) => setLogs(r.logs || []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-800 mb-4">操作审计</h1>
      {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
      {loading ? (
        <p className="text-slate-400">加载中...</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">时间</th>
                <th className="px-4 py-2 font-medium">动作</th>
                <th className="px-4 py-2 font-medium">目标</th>
                <th className="px-4 py-2 font-medium">结果</th>
                <th className="px-4 py-2 font-medium">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                    {new Date(l.created_at).toLocaleString()}
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
                  <td className="px-4 py-2 text-slate-500 max-w-md truncate">
                    {l.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && (
            <div className="p-8 text-center text-slate-400">暂无审计记录。</div>
          )}
        </div>
      )}
    </div>
  );
}
