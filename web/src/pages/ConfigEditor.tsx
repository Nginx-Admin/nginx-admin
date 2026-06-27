import { useCallback, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { api, type Directive } from "../api/client";
import { Button } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import Canvas from "../canvas/Canvas";
import PropertyPanel from "../canvas/PropertyPanel";
import { matchLocation } from "../canvas/matcher";
import type { NodePath } from "../canvas/directives";

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

  // 主配置以 http/events 等块为主，默认进源码模式。
  const [mode, setMode] = useState<Mode>(isMain ? "source" : "canvas");
  const [source, setSource] = useState("");
  const [dirs, setDirs] = useState<Directive[] | null>(null); // crossplane 指令树
  const [checksum, setChecksum] = useState("");
  const [selectedPath, setSelectedPath] = useState<NodePath | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // 流量模拟
  const [simPath, setSimPath] = useState("");
  const [matchedPath, setMatchedPath] = useState<NodePath | null>(null);

  // 全局 upstream 名单（跨文件，供画布连线指向外部文件定义的 upstream）
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
      setMatchedPath(null);
      setMode("canvas");
    } catch (e) {
      setErr("配置解析失败（请检查语法，或留在源码模式）：" + (e as Error).message);
    }
  };

  const runSim = () => {
    if (!dirs || !simPath) {
      setMatchedPath(null);
      return;
    }
    const m = matchLocation(dirs, simPath);
    setMatchedPath(m);
    if (!m) setMsg(`路径 ${simPath} 未匹配到任何 location`);
    else setMsg("");
  };

  const save = async () => {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      // 画布模式：先把指令树 build 成文本
      let content = source;
      if (mode === "canvas" && dirs) {
        const b = await api.buildConfig(dirs);
        content = b.content;
      }
      const r = await api.writeConfig(id, path, content, checksum);
      if (r.ok) {
        setMsg("保存成功：已通过 nginx -t 校验并 reload。");
        if (r.new_checksum) setChecksum(r.new_checksum);
        // 同步源码视图
        setSource(content);
      } else {
        setErr("保存失败（已自动回滚）：\n" + (r.error || ""));
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
          {mode === "canvas" && (
            <div className="flex items-center gap-1">
              <input
                className="w-44 rounded-md border border-slate-300 px-2 py-1 text-sm"
                placeholder="模拟请求路径 /api/users"
                value={simPath}
                onChange={(e) => setSimPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSim()}
              />
              <Button variant="secondary" onClick={runSim}>
                模拟匹配
              </Button>
            </div>
          )}
          {canEdit && (
            <Button onClick={save} disabled={saving}>
              {saving ? "保存中..." : "保存并应用"}
            </Button>
          )}
        </div>
      </div>

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
      <div className="flex flex-1 overflow-hidden">
        {mode === "canvas" ? (
          <>
            <div className="flex-1">
              {dirs && (
                <ReactFlowProvider>
                  <Canvas
                    dirs={dirs}
                    selectedPath={selectedPath}
                    onSelect={setSelectedPath}
                    matchedPath={matchedPath}
                    externalUpstreams={externalUpstreams}
                    upstreamRefs={upstreamRefs}
                  />
                </ReactFlowProvider>
              )}
            </div>
            <div className="w-80 overflow-auto border-l border-slate-200 bg-white">
              {dirs && (
                <PropertyPanel
                  dirs={dirs}
                  selectedPath={selectedPath}
                  onChange={setDirs}
                />
              )}
            </div>
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
