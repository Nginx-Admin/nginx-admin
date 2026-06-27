import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  api,
  type ConfigFileInfo,
  type Server,
  type ServerStatus,
} from "../api/client";
import { Button, statusBadge } from "../components/ui";
import { useAuth } from "../auth/AuthContext";

// 判定一个逻辑路径是否为主配置：文件名为 nginx.conf 即认为是主配置，
// 不限是否位于子目录（兼容 openresty 等 config_root 较深的布局，
// 如 /usr/local/openresty/nginx/conf/nginx.conf → logical_path 可能是 nginx.conf）。
function isMainConfig(logicalPath: string): boolean {
  return /(^|\/)nginx\.conf$/i.test(logicalPath);
}

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
  const [showCreateConfig, setShowCreateConfig] = useState(false);
  const [statusRefreshing, setStatusRefreshing] = useState(false);

  // 子配置列表容器（用于保持/恢复滚动位置）
  const subListRef = useRef<HTMLDivElement>(null);

  const canEdit = user?.role === "admin" || user?.role === "editor";

  const mainFiles = files.filter((f) => isMainConfig(f.logical_path));
  const subFiles = files.filter((f) => !isMainConfig(f.logical_path));

  // 从已发现的子配置提取去重目录集合（这些目录都是经 include 加载进来的），
  // 供"新建子配置"选择落盘目录。
  const subDirs = useMemo(() => {
    const set = new Set<string>();
    for (const f of subFiles) {
      const idx = f.logical_path.lastIndexOf("/");
      set.add(idx >= 0 ? f.logical_path.slice(0, idx) : ".");
    }
    return Array.from(set).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const loadServer = useCallback(() => {
    api.getServer(id).then(setServer).catch((e) => setErr((e as Error).message));
  }, [id]);

  // 实时拉取状态（打 Agent，1-2s）。手动"刷新状态"按钮调用。
  const loadStatus = useCallback(() => {
    setErr("");
    setStatusRefreshing(true);
    api
      .serverStatus(id)
      .then(setStatus)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setStatusRefreshing(false));
  }, [id]);

  // 进页面：先秒显缓存状态，再后台静默刷新实时状态（stale-while-revalidate）。
  const loadStatusFast = useCallback(() => {
    // 1) 缓存秒显
    api
      .serverStatusCached(id)
      .then((s) => setStatus((prev) => prev ?? s))
      .catch(() => {});
    // 2) 后台实时刷新
    setStatusRefreshing(true);
    api
      .serverStatus(id)
      .then(setStatus)
      .catch(() => {}) // 后台刷新失败不打扰，保留缓存值
      .finally(() => setStatusRefreshing(false));
  }, [id]);

  const loadConfigs = useCallback(() => {
    api
      .listConfigs(id)
      .then((r) => setFiles(r.files || []))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    loadServer();
    loadStatusFast();
    loadConfigs();
  }, [loadServer, loadStatusFast, loadConfigs]);

  // 需求：保持子配置列表滚动位置（打开文件再返回时不回到顶部）。
  const scrollKey = `subListScroll:${id}`;
  // 列表渲染出来后恢复上次滚动位置
  useEffect(() => {
    if (subFiles.length === 0) return;
    const el = subListRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem(scrollKey);
    if (saved) el.scrollTop = parseInt(saved, 10) || 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);
  // 实时记录滚动位置
  const onSubListScroll = () => {
    const el = subListRef.current;
    if (el) sessionStorage.setItem(scrollKey, String(el.scrollTop));
  };

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

  return (
    <div className="p-6">
      <button
        onClick={() => nav("/")}
        className="mb-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      >
        ← 返回服务列表
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            {server?.name || "服务器"}
          </h1>
          <p className="text-sm text-slate-500">{server?.address}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="info"
            onClick={loadStatus}
            disabled={busy || statusRefreshing}
          >
            {statusRefreshing ? "刷新中…" : "刷新状态"}
          </Button>
        </div>
      </div>

      {/* 状态卡片 */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="连接状态" value={statusBadge(server?.status || "unknown")} />
        <StatCard
          label="nginx 进程"
          value={
            !status ? (
              <Skeleton />
            ) : status.nginx_running ? (
              <span className="text-green-600">运行中</span>
            ) : (
              <span className="text-red-600">未运行</span>
            )
          }
        />
        <StatCard
          label="版本"
          value={!status ? <Skeleton /> : status.nginx_version || "-"}
        />
        <StatCard
          label="配置检查"
          value={
            !status ? (
              <Skeleton />
            ) : status.last_test_ok ? (
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
          <div className="flex gap-2">
            <Button variant="warning" onClick={doTest} disabled={busy}>
              nginx -t
            </Button>
            <Button onClick={doReload} disabled={busy}>
              Reload
            </Button>
          </div>
        )}
      </div>

      {files.length === 0 ? (
        <div className="mt-3 flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          <span>暂无配置文件，点击下方按钮扫描。</span>
          {canEdit && (
            <Button variant="info" onClick={doDiscover} disabled={busy}>
              配置发现
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* 主配置 */}
          <div className="mt-3">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-amber-700">主配置</h3>
            </div>
            {mainFiles.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-400">
                未发现主配置（nginx.conf）。
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40">
                <ConfigTable
                  files={mainFiles}
                  id={id}
                  canEdit={canEdit}
                  nav={nav}
                  main
                />
              </div>
            )}
          </div>

          {/* 子配置 */}
          <div className="mt-5">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">子配置</h3>
              {canEdit && (
                <div className="flex gap-2">
                  {subDirs.length > 0 && (
                    <Button
                      variant="success"
                      onClick={() => setShowCreateConfig(true)}
                    >
                      新建配置
                    </Button>
                  )}
                  <Button variant="info" onClick={doDiscover} disabled={busy}>
                    配置发现
                  </Button>
                </div>
              )}
            </div>
            {subFiles.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-400">
                未发现子配置文件。
              </div>
            ) : (
              <div
                ref={subListRef}
                onScroll={onSubListScroll}
                className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200 bg-white"
              >
                <ConfigTable
                  files={subFiles}
                  id={id}
                  canEdit={canEdit}
                  nav={nav}
                />
              </div>
            )}
          </div>
        </>
      )}

      {showCreateConfig && (
        <CreateConfigModal
          dirs={subDirs}
          onClose={() => setShowCreateConfig(false)}
          onCreated={(logicalPath) => {
            setShowCreateConfig(false);
            // 直接进入编辑器编辑新建的文件
            nav(`/servers/${id}/edit?path=${encodeURIComponent(logicalPath)}`);
          }}
          serverId={id}
        />
      )}
    </div>
  );
}

function ConfigTable({
  files,
  id,
  canEdit,
  nav,
  main = false,
}: {
  files: ConfigFileInfo[];
  id: string;
  canEdit: boolean;
  nav: ReturnType<typeof useNavigate>;
  main?: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead
        className={`text-left ${main ? "bg-amber-100/60 text-amber-800" : "bg-slate-50 text-slate-500"}`}
      >
        <tr>
          <th className="px-4 py-2 font-medium">逻辑路径</th>
          <th className="px-4 py-2 font-medium">行数</th>
          <th className="px-4 py-2 font-medium"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {files.map((f) => (
          <tr key={f.logical_path} className="hover:bg-black/[0.02]">
            <td className="px-4 py-2 font-mono text-slate-700">
              {f.logical_path}
            </td>
            <td className="px-4 py-2 text-slate-500">
              {f.lines != null ? `${f.lines} 行` : "—"}
            </td>
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
                {/* 主配置默认只读，进入后由后端控制能否保存 */}
                {main || !canEdit ? "查看" : "编辑"}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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

// 加载占位骨架（状态数据未到时显示）。
function Skeleton() {
  return (
    <span className="inline-block h-4 w-12 animate-pulse rounded bg-slate-200 align-middle" />
  );
}

// 新建子配置弹窗：目录从已发现的子配置目录下拉选择（均为 include 加载的目录），
// 文件名与内容由用户自定义。保存走写入接口（含 nginx -t 校验 + reload + 失败回滚）。
function CreateConfigModal({
  serverId,
  dirs,
  onClose,
  onCreated,
}: {
  serverId: string;
  dirs: string[];
  onClose: () => void;
  onCreated: (logicalPath: string) => void;
}) {
  const [dir, setDir] = useState(dirs[0] || "");
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState(
    "server {\n    listen 80;\n    server_name example.com;\n\n    location / {\n        proxy_pass http://127.0.0.1:8080;\n    }\n}\n"
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = filename.trim();
    if (!name) {
      setErr("请填写文件名");
      return;
    }
    if (!/^[\w.\-]+$/.test(name)) {
      setErr("文件名只能包含字母、数字、点、下划线、连字符");
      return;
    }
    const fname = /\.conf$/i.test(name) ? name : name + ".conf";
    const logicalPath = dir === "." || dir === "" ? fname : `${dir}/${fname}`;

    setBusy(true);
    setErr("");
    try {
      // 新建：expected_checksum 留空。后端写入后会做 nginx -t + reload，失败回滚。
      const r = await api.writeConfig(serverId, logicalPath, content, "");
      if (r.ok) {
        onCreated(logicalPath);
      } else {
        setErr("创建失败（已回滚）：\n" + (r.error || ""));
      }
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
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-slate-800">新建子配置</h2>
        <div className="mt-4 flex gap-3">
          <label className="block text-sm font-medium text-slate-700">
            目录
            <select
              className="mt-1 w-48 rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={dir}
              onChange={(e) => setDir(e.target.value)}
            >
              {dirs.map((d) => (
                <option key={d} value={d}>
                  {d === "." ? "（根目录）" : d}
                </option>
              ))}
            </select>
          </label>
          <label className="block flex-1 text-sm font-medium text-slate-700">
            文件名
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="example.com（自动补 .conf）"
              autoFocus
            />
          </label>
        </div>
        <label className="mt-3 block flex-1 text-sm font-medium text-slate-700">
          配置内容
          <textarea
            className="code mt-1 h-64 w-full resize-none rounded-md border border-slate-300 p-3"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
          />
        </label>

        {err && (
          <pre className="code mt-3 whitespace-pre-wrap rounded-md bg-red-50 p-2 text-xs text-red-700">
            {err}
          </pre>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            取消
          </button>
          <Button type="submit" disabled={busy}>
            {busy ? "创建中..." : "创建并校验"}
          </Button>
        </div>
      </form>
    </div>
  );
}
