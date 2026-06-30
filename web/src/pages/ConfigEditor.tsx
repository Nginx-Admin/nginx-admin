import { useCallback, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { api, type Directive, type LocalBackup } from "../api/client";
import { Button } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import Canvas from "../canvas/Canvas";
import PropertyPanel from "../canvas/PropertyPanel";
import {
  appendChild,
  templateServerBlock,
  templateUpstreamBlock,
  type NodePath,
} from "../canvas/directives";

type Mode = "canvas" | "source";

// 主配置判定（与 ServerDetail 一致）：文件名为 nginx.conf 即可，不限目录层级。
function isMainConfig(logicalPath: string): boolean {
  return /(^|\/)nginx\.conf$/i.test(logicalPath);
}

export default function ConfigEditor() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const path = sp.get("path") || "";
  const nav = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";
  const isMain = isMainConfig(path);

  // 主配置含 http/events 结构块，画布会以结构概览 + 内部 server 展示；
  // 解析失败时自动回退源码模式（见 load）。
  const [mode, setMode] = useState<Mode>("canvas");
  const [source, setSource] = useState("");
  const [dirs, setDirs] = useState<Directive[] | null>(null); // crossplane 指令树
  const [checksum, setChecksum] = useState("");
  const [selectedPath, setSelectedPath] = useState<NodePath | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  // 保存的分阶段结果（nginx -t / reload），分别展示
  const [stages, setStages] = useState<
    { label: string; ok: boolean; detail?: string }[] | null
  >(null);
  const [err, setErr] = useState("");

  const [showBackups, setShowBackups] = useState(false);
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [rollbackBusy, setRollbackBusy] = useState(false);

  // 全局 upstream 名单
  const [externalUpstreams, setExternalUpstreams] = useState<
    { name: string; logical_path: string }[]
  >([]);

  // upstream 反向引用（谁用了某 upstream），供打开 upstream 文件时展示引用方
  const [upstreamRefs, setUpstreamRefs] = useState<
    {
      upstream: string;
      logical_path: string;
      server_name: string;
      location: string;
      proxy_pass: string;
    }[]
  >([]);

  // 拉取全局 upstream 名单 + 反向引用（失败不阻塞画布）
  useEffect(() => {
    api
      .listUpstreams(id)
      .then((r) => setExternalUpstreams(r.upstreams || []))
      .catch(() => setExternalUpstreams([]));
    api
      .listUpstreamRefs(id)
      .then((r) => setUpstreamRefs(r.refs || []))
      .catch(() => setUpstreamRefs([]));
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await api.readConfig(id, path);
      setSource(r.content);
      setChecksum(r.checksum);
      // 画布模式下解析为指令树
      if (mode === "canvas") {
        try {
          const p = await api.parseConfig(r.content);
          setDirs(p.directives);
        } catch (e) {
          // 解析失败（语法错误等）→ 退回源码模式
          setMode("source");
          setErr("配置解析失败，已切换到源码模式：" + (e as Error).message);
        }
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, path]);

  const loadBackups = useCallback(async () => {
    setBackupLoading(true);
    try {
      const r = await api.listBackups(id, path);
      setBackups(r.local || []);
    } catch {
      setBackups([]);
    } finally {
      setBackupLoading(false);
    }
  }, [id, path]);

  useEffect(() => {
    if (showBackups) loadBackups();
  }, [showBackups, loadBackups]);

  const doRollback = async (backupRef: string) => {
    if (!confirm("确定回滚到此快照？将覆盖当前文件并 reload。")) return;
    setRollbackBusy(true);
    setErr("");
    setMsg("");
    try {
      const r = await api.rollback(id, backupRef);
      if (r.ok) {
        setMsg("回滚成功\n" + (r.output || ""));
        setShowBackups(false);
        await load();
      } else {
        setErr(r.error || "回滚失败");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRollbackBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, path]);

  // 切到源码模式：把当前指令树回写为文本
  const switchToSource = async () => {
    setErr("");
    if (dirs) {
      try {
        const r = await api.buildConfig(dirs);
        setSource(r.content);
      } catch (e) {
        setErr("生成配置文本失败：" + (e as Error).message);
        return;
      }
    }
    setMode("source");
  };

  // 切到画布模式：把当前文本重新解析为指令树
  const switchToCanvas = async () => {
    setErr("");
    try {
      const p = await api.parseConfig(source);
      setDirs(p.directives);
      setSelectedPath(null);
      setMode("canvas");
    } catch (e) {
      setErr("配置解析失败（请检查语法，或留在源码模式）：" + (e as Error).message);
    }
  };

  const save = async () => {
    setSaving(true);
    setMsg("");
    setErr("");
    setStages(null);
    try {
      // 画布模式：先把指令树 build 成文本
      let content = source;
      if (mode === "canvas" && dirs) {
        const b = await api.buildConfig(dirs);
        content = b.content;
      }
      const r = await api.writeConfig(id, path, content, checksum);
      if (r.ok) {
        // 成功：两个阶段都通过（安全闭环保证 nginx -t 通过才会 reload）
        setStages([
          { label: "nginx -t 校验通过", ok: true },
          { label: "reload 成功，配置已生效", ok: true },
        ]);
        if (r.new_checksum) setChecksum(r.new_checksum);
        setSource(content); // 同步源码视图
      } else {
        // 失败：根据错误信息判断卡在哪一步
        const errText = r.error || "";
        const reloadFailed = /reload/i.test(errText);
        if (reloadFailed) {
          // nginx -t 过了但 reload 失败
          setStages([
            { label: "nginx -t 校验通过", ok: true },
            { label: "reload 失败（已自动回滚）", ok: false, detail: errText },
          ]);
        } else {
          // nginx -t 未通过
          setStages([
            { label: "nginx -t 校验失败（已自动回滚）", ok: false, detail: errText },
          ]);
        }
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return <div className="p-6 text-slate-400">加载配置中...</div>;

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <button
          onClick={() => nav(`/servers/${id}`)}
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← 返回
        </button>
        <span className="font-mono text-sm text-slate-700">{path}</span>
        {isMain && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            主配置
          </span>
        )}
        <div className="ml-4 inline-flex rounded-md border border-slate-300 text-sm">
          <button
            className={`px-3 py-1 ${
              mode === "canvas" ? "bg-brand-50 text-brand-700" : "text-slate-600"
            }`}
            onClick={switchToCanvas}
          >
            画布
          </button>
          <button
            className={`px-3 py-1 ${
              mode === "source" ? "bg-brand-50 text-brand-700" : "text-slate-600"
            }`}
            onClick={switchToSource}
          >
            源码
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <>
              <Button
                variant="secondary"
                onClick={() => setShowBackups((v) => !v)}
              >
                {showBackups ? "关闭快照" : "快照"}
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "保存中..." : "保存并应用"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Agent 本地快照列表 */}
      {showBackups && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              Agent 本地快照 · {path}
            </span>
            <button
              type="button"
              onClick={loadBackups}
              className="text-xs text-brand-600 hover:underline"
            >
              刷新
            </button>
          </div>
          {backupLoading ? (
            <p className="text-sm text-slate-400">加载中…</p>
          ) : backups.length === 0 ? (
            <p className="text-sm text-slate-400">暂无快照（保存配置时会自动创建）</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {backups.map((b) => (
                <li
                  key={b.backup_ref}
                  className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-mono text-slate-600">
                      {new Date(b.created_at_unix * 1000).toLocaleString()}
                    </div>
                    <div className="text-slate-400">{b.note || b.backup_ref}</div>
                  </div>
                  {canEdit && (
                    <Button
                      variant="warning"
                      disabled={rollbackBusy}
                      onClick={() => doRollback(b.backup_ref)}
                    >
                      回滚
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 保存的分阶段结果：nginx -t / reload 分两步展示 */}
      {stages && (
        <div className="m-3 space-y-1 rounded-md border border-slate-200 bg-white p-3">
          {stages.map((s, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs text-white ${
                    s.ok ? "bg-green-500" : "bg-red-500"
                  }`}
                >
                  {s.ok ? "✓" : "✕"}
                </span>
                <span className={s.ok ? "text-slate-700" : "text-red-700"}>
                  第 {i + 1} 步 · {s.label}
                </span>
              </div>
              {s.detail && (
                <pre className="code mt-1 ml-7 whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700">
                  {s.detail}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {(msg || err) && (
        <pre
          className={`code m-3 whitespace-pre-wrap rounded-md p-3 text-xs ${
            err ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"
          }`}
        >
          {err || msg}
        </pre>
      )}

      {/* 主体 */}
      <div className="relative flex flex-1 overflow-hidden">
        {mode === "canvas" ? (
          <>
            {canEdit && dirs && (
              <div className="absolute left-3 top-3 z-10 flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm hover:bg-slate-50"
                  onClick={() =>
                    setDirs(appendChild(dirs, [], templateServerBlock()))
                  }
                >
                  + Server
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm hover:bg-slate-50"
                  onClick={() =>
                    setDirs(appendChild(dirs, [], templateUpstreamBlock()))
                  }
                >
                  + Upstream
                </button>
              </div>
            )}
            <div className="flex-1">
              {dirs && (
                <ReactFlowProvider>
                  <Canvas
                    dirs={dirs}
                    selectedPath={selectedPath}
                    onSelect={setSelectedPath}
                    externalUpstreams={externalUpstreams}
                    upstreamRefs={upstreamRefs}
                  />
                </ReactFlowProvider>
              )}
            </div>

            {/* 属性面板：浮层抽屉，盖在画布上层，不压缩画布宽度 */}
            {dirs && selectedPath && (
              <div className="absolute right-0 top-0 z-10 flex h-full w-[420px] max-w-[90%] flex-col border-l border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                  <span className="text-sm font-medium text-slate-700">
                    属性编辑
                  </span>
                  <button
                    onClick={() => setSelectedPath(null)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    title="关闭"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-auto">
                  <PropertyPanel
                    dirs={dirs}
                    selectedPath={selectedPath}
                    onChange={setDirs}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <textarea
            className="code h-full w-full resize-none border-0 p-4 focus:outline-none"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            readOnly={!canEdit}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
