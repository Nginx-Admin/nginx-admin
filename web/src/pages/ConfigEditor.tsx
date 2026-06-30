import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { api, type Directive, type LocalBackup } from "../api/client";
import { Button } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import SourceEditor from "../components/SourceEditor";
import DiffView from "../components/DiffView";
import Canvas from "../canvas/Canvas";
import PropertyPanel from "../canvas/PropertyPanel";
import { simulateTraffic } from "../canvas/matcher";
import {
  appendChild,
  buildFlowModel,
  templateServerBlock,
  templateUpstreamBlock,
  type NodePath,
} from "../canvas/directives";
import { hasDiff, lineDiff } from "../utils/diff";

type Mode = "canvas" | "source";

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

  const [mode, setMode] = useState<Mode>("canvas");
  const [source, setSource] = useState("");
  const [baseline, setBaseline] = useState("");
  /** 画布是否被用户编辑过（parse/build 往返不算） */
  const [canvasTouched, setCanvasTouched] = useState(false);
  const [dirs, setDirs] = useState<Directive[] | null>(null);
  const [checksum, setChecksum] = useState("");
  const [selectedPath, setSelectedPath] = useState<NodePath | null>(null);
  const [matchedPath, setMatchedPath] = useState<NodePath | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [stages, setStages] = useState<
    { label: string; ok: boolean; detail?: string }[] | null
  >(null);
  const [err, setErr] = useState("");

  const [showBackups, setShowBackups] = useState(false);
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [rollbackBusy, setRollbackBusy] = useState(false);

  const [showDiff, setShowDiff] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [trafficUri, setTrafficUri] = useState("/");
  const [trafficHost, setTrafficHost] = useState("");
  const [trafficResult, setTrafficResult] = useState("");

  const [externalUpstreams, setExternalUpstreams] = useState<
    { name: string; logical_path: string }[]
  >([]);
  const [upstreamRefs, setUpstreamRefs] = useState<
    {
      upstream: string;
      logical_path: string;
      server_name: string;
      location: string;
      proxy_pass: string;
    }[]
  >([]);

  const flowModel = useMemo(
    () => (dirs ? buildFlowModel(dirs) : null),
    [dirs]
  );

  useEffect(() => {
    api.listUpstreams(id).then((r) => setExternalUpstreams(r.upstreams || [])).catch(() => {});
    api.listUpstreamRefs(id).then((r) => setUpstreamRefs(r.refs || [])).catch(() => {});
  }, [id]);

  const resolveContent = useCallback(async (): Promise<string> => {
    if (mode === "canvas" && dirs) {
      const b = await api.buildConfig(dirs);
      return b.content;
    }
    return source;
  }, [mode, dirs, source]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    setCanvasTouched(false);
    try {
      const r = await api.readConfig(id, path);
      setSource(r.content);
      setBaseline(r.content);
      setChecksum(r.checksum);
      if (mode === "canvas") {
        try {
          const p = await api.parseConfig(r.content);
          setDirs(p.directives);
        } catch (e) {
          setMode("source");
          setErr("配置解析失败，已切换到源码模式：" + (e as Error).message);
        }
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, path, mode]);

  const updateDirs = useCallback((next: Directive[]) => {
    setCanvasTouched(true);
    setDirs(next);
  }, []);

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

  useEffect(() => {
    load();
  }, [id, path]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => {
    if (mode === "source") return source !== baseline;
    return canvasTouched;
  }, [mode, source, baseline, canvasTouched]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

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

  const switchToSource = async () => {
    setErr("");
    // 仅画布有真实编辑时才 rebuild；否则保留磁盘原文，避免 crossplane 往返产生假 diff
    if (dirs && canvasTouched) {
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

  const switchToCanvas = async () => {
    setErr("");
    try {
      const p = await api.parseConfig(source);
      setDirs(p.directives);
      setSelectedPath(null);
      setMatchedPath(null);
      setCanvasTouched(source !== baseline);
      setMode("canvas");
    } catch (e) {
      setErr("配置解析失败：" + (e as Error).message);
    }
  };

  const doTest = async () => {
    setErr("");
    setMsg("");
    try {
      const r = await api.test(id);
      if (r.ok) setMsg("nginx -t 通过（未写入变更）\n" + r.output);
      else setErr("nginx -t 失败：\n" + r.output);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const runTraffic = () => {
    if (!flowModel) return;
    const m = simulateTraffic(flowModel, trafficUri, trafficHost);
    if (!m) {
      setTrafficResult("无匹配的 location");
      setMatchedPath(null);
      return;
    }
    setMatchedPath(m.location.path);
    setSelectedPath(m.location.path);
    setTrafficResult(
      `${m.matchKind} → ${m.location.matcher} ${m.location.summary || ""}`.trim()
    );
  };

  const openDiff = async () => {
    if (!dirty) {
      setMsg("相对上次加载无变更");
      return;
    }
    const cur = await resolveContent();
    if (!hasDiff(baseline, cur)) {
      setMsg("相对上次加载无变更");
      return;
    }
    setShowDiff(true);
  };

  const [diffLines, setDiffLines] = useState<ReturnType<typeof lineDiff>>([]);
  useEffect(() => {
    if (!showDiff) return;
    resolveContent().then((cur) => setDiffLines(lineDiff(baseline, cur)));
  }, [showDiff, baseline, resolveContent]);

  const save = async () => {
    setSaving(true);
    setMsg("");
    setErr("");
    setStages(null);
    try {
      const content = await resolveContent();
      const r = await api.writeConfig(id, path, content, checksum);
      if (r.ok) {
        setStages([
          { label: "nginx -t 校验通过", ok: true },
          { label: "reload 成功，配置已生效", ok: true },
        ]);
        if (r.new_checksum) setChecksum(r.new_checksum);
        setSource(content);
        setBaseline(content);
        setCanvasTouched(false);
        setShowDiff(false);
      } else {
        const errText = r.error || "";
        const reloadFailed = /reload/i.test(errText);
        setStages(
          reloadFailed
            ? [
                { label: "nginx -t 校验通过", ok: true },
                { label: "reload 失败（已自动回滚）", ok: false, detail: errText },
              ]
            : [{ label: "nginx -t 校验失败（已自动回滚）", ok: false, detail: errText }]
        );
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-slate-400">加载配置中...</div>;

  return (
    <div className="flex h-full flex-col">
      {!canEdit && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          只读模式（viewer 角色不可保存）
        </div>
      )}
      {isMain && canEdit && (
        <div className="border-b border-amber-200 bg-amber-50/80 px-4 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/80 dark:text-amber-200">
          主配置文件默认受 Agent 保护；若无法保存请在 Agent 端设置 nginx.allow_main_config=true
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
        <button
          onClick={() => {
            if (dirty && !confirm("有未保存变更，确定离开？")) return;
            nav(`/servers/${id}`);
          }}
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          ← 返回
        </button>
        <span className="font-mono text-sm text-slate-700 dark:text-slate-200">{path}</span>
        {dirty && (
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
            未保存
          </span>
        )}
        <div className="inline-flex rounded-md border border-slate-300 text-sm dark:border-slate-600">
          <button
            className={`px-3 py-1 ${mode === "canvas" ? "bg-brand-50 text-brand-700 dark:bg-brand-950" : "text-slate-600 dark:text-slate-300"}`}
            onClick={switchToCanvas}
          >
            画布
          </button>
          <button
            className={`px-3 py-1 ${mode === "source" ? "bg-brand-50 text-brand-700 dark:bg-brand-950" : "text-slate-600 dark:text-slate-300"}`}
            onClick={switchToSource}
          >
            源码
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={openDiff}>
            对比变更
          </Button>
          {mode === "canvas" && (
            <Button variant="secondary" onClick={() => setShowTraffic((v) => !v)}>
              {showTraffic ? "关闭模拟" : "流量模拟"}
            </Button>
          )}
          {canEdit && (
            <>
              <Button variant="warning" onClick={doTest}>
                nginx -t
              </Button>
              <Button variant="secondary" onClick={() => setShowBackups((v) => !v)}>
                {showBackups ? "关闭快照" : "快照"}
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "保存中..." : "保存并应用"}
              </Button>
            </>
          )}
        </div>
      </div>

      {showBackups && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Agent 本地快照 · {path}
            </span>
            <button type="button" onClick={loadBackups} className="text-xs text-brand-600 hover:underline">
              刷新
            </button>
          </div>
          {backupLoading ? (
            <p className="text-sm text-slate-400">加载中…</p>
          ) : backups.length === 0 ? (
            <p className="text-sm text-slate-400">暂无快照</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {backups.map((b) => (
                <li
                  key={b.backup_ref}
                  className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  <div>
                    <div className="font-mono text-slate-600 dark:text-slate-300">
                      {new Date(b.created_at_unix * 1000).toLocaleString()}
                    </div>
                    <div className="text-slate-400">{b.note || b.backup_ref}</div>
                  </div>
                  {canEdit && (
                    <Button variant="warning" disabled={rollbackBusy} onClick={() => doRollback(b.backup_ref)}>
                      回滚
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showTraffic && flowModel && (
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-sky-50 px-4 py-3 dark:border-slate-700 dark:bg-sky-950/40">
          <label className="text-xs text-slate-600 dark:text-slate-300">
            Host
            <input
              className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={trafficHost}
              onChange={(e) => setTrafficHost(e.target.value)}
              placeholder="example.com"
            />
          </label>
          <label className="text-xs text-slate-600 dark:text-slate-300">
            URI
            <input
              className="mt-1 block w-48 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={trafficUri}
              onChange={(e) => setTrafficUri(e.target.value)}
            />
          </label>
          <Button variant="info" onClick={runTraffic}>
            模拟
          </Button>
          {trafficResult && (
            <span className="text-sm text-sky-800 dark:text-sky-200">{trafficResult}</span>
          )}
        </div>
      )}

      {showDiff && (
        <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">变更对比（相对上次加载）</span>
            <button type="button" onClick={() => setShowDiff(false)} className="text-xs text-slate-500 hover:underline">
              关闭
            </button>
          </div>
          <DiffView lines={diffLines} />
        </div>
      )}

      {stages && (
        <div className="m-3 space-y-1 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          {stages.map((s, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 text-sm">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs text-white ${s.ok ? "bg-green-500" : "bg-red-500"}`}>
                  {s.ok ? "✓" : "✕"}
                </span>
                <span className={s.ok ? "text-slate-700 dark:text-slate-200" : "text-red-700"}>
                  第 {i + 1} 步 · {s.label}
                </span>
              </div>
              {s.detail && (
                <pre className="code mt-1 ml-7 whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-200">
                  {s.detail}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {(msg || err) && (
        <pre className={`code m-3 whitespace-pre-wrap rounded-md p-3 text-xs ${err ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200" : "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"}`}>
          {err || msg}
        </pre>
      )}

      <div className="relative flex flex-1 overflow-hidden">
        {mode === "canvas" ? (
          <>
            {canEdit && dirs && (
              <div className="absolute left-3 top-3 z-10 flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  onClick={() => updateDirs(appendChild(dirs, [], templateServerBlock()))}
                >
                  + Server
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  onClick={() => updateDirs(appendChild(dirs, [], templateUpstreamBlock()))}
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
                    matchedPath={matchedPath}
                    onSelect={setSelectedPath}
                    externalUpstreams={externalUpstreams}
                    upstreamRefs={upstreamRefs}
                  />
                </ReactFlowProvider>
              )}
            </div>
            {dirs && selectedPath && (
              <div className="absolute right-0 top-0 z-10 flex h-full w-[420px] max-w-[90%] flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 dark:border-slate-800">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">属性编辑</span>
                  <button onClick={() => setSelectedPath(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="关闭">
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-auto">
                  <PropertyPanel dirs={dirs} selectedPath={selectedPath} onChange={updateDirs} />
                </div>
              </div>
            )}
          </>
        ) : (
          <SourceEditor value={source} onChange={setSource} readOnly={!canEdit} />
        )}
      </div>
    </div>
  );
}
