import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Button } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import Canvas from "../canvas/Canvas";
import PropertyPanel, { type Selection } from "../canvas/PropertyPanel";
import { buildConfig, parseConfig, type ParsedConfig } from "../canvas/nginxParser";
import { matchLocation } from "../canvas/matcher";

type Mode = "canvas" | "source";

// 主配置判定（与 ServerDetail 一致）：根目录下的 nginx.conf。
function isMainConfig(logicalPath: string): boolean {
  const p = logicalPath.replace(/^\.?\//, "");
  return !p.includes("/") && /nginx\.conf$/i.test(p);
}

export default function ConfigEditor() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const path = sp.get("path") || "";
  const nav = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";
  const isMain = isMainConfig(path);

  // 主配置以 http/events 等块为主，不适合节点画布，默认进源码模式。
  const [mode, setMode] = useState<Mode>(isMain ? "source" : "canvas");
  const [source, setSource] = useState("");
  const [parsed, setParsed] = useState<ParsedConfig | null>(null);
  const [checksum, setChecksum] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // 流量模拟
  const [simPath, setSimPath] = useState("");
  const [matchedLoc, setMatchedLoc] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .readConfig(id, path)
      .then((r) => {
        setSource(r.content);
        setChecksum(r.checksum);
        setParsed(parseConfig(r.content));
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [id, path]);

  useEffect(load, [load]);

  // 切到源码模式：从画布模型回写文本
  const switchToSource = () => {
    if (parsed) setSource(buildConfig(parsed));
    setMode("source");
  };
  // 切到画布模式：从文本重新解析
  const switchToCanvas = () => {
    setParsed(parseConfig(source));
    setSelection(null);
    setMode("canvas");
  };

  const currentContent = useMemo(() => {
    return mode === "source" ? source : parsed ? buildConfig(parsed) : "";
  }, [mode, source, parsed]);

  const runSim = () => {
    if (!parsed || !simPath) {
      setMatchedLoc(null);
      return;
    }
    const m = matchLocation(parsed, simPath);
    setMatchedLoc(m?.locationId || null);
    if (!m) setMsg(`路径 ${simPath} 未匹配到任何 location`);
    else setMsg("");
  };

  const save = async () => {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const r = await api.writeConfig(id, path, currentContent, checksum);
      if (r.ok) {
        setMsg("保存成功：已通过 nginx -t 校验并 reload。");
        if (r.new_checksum) setChecksum(r.new_checksum);
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
            主配置 · 高危
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

      {isMain && (
        <div className="mx-3 mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          这是 nginx 主配置文件，改错会导致整个 nginx 无法启动。保存会经过 nginx -t
          校验、失败自动回滚；但若该节点 Agent 未开启
          <code className="mx-1">nginx.allow_main_config</code>，保存会被拒绝（默认只读）。
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
      <div className="flex flex-1 overflow-hidden">
        {mode === "canvas" ? (
          <>
            <div className="flex-1">
              {parsed && (
                <ReactFlowProvider>
                  <Canvas
                    parsed={parsed}
                    selection={selection}
                    onSelect={setSelection}
                    matchedLocationId={matchedLoc}
                  />
                </ReactFlowProvider>
              )}
            </div>
            <div className="w-72 overflow-auto border-l border-slate-200 bg-white">
              {parsed && (
                <PropertyPanel
                  parsed={parsed}
                  selection={selection}
                  onChange={setParsed}
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
