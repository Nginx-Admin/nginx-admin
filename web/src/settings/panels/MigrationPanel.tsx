import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Server, type ServerExportBundle, type ServerImportResult } from "../../api/client";
import { Button, CheckBox, SettingCard } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import {
  bundleToYAML,
  downloadServerYAML,
  parseServerImportFile,
} from "../../utils/serverExport";

const UNGROUPED = "未分组";

function groupOf(s: Server): string {
  try {
    const obj = JSON.parse(s.labels || "{}");
    const g = (obj.group ?? "").toString().trim();
    return g || UNGROUPED;
  } catch {
    return UNGROUPED;
  }
}

export default function MigrationPanel() {
  const { user } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportBusy, setExportBusy] = useState(false);
  const [err, setErr] = useState("");

  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [importErr, setImportErr] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [result, setResult] = useState<ServerImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importBundle, setImportBundle] = useState<ServerExportBundle | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .listServers()
      .then((r) => setServers(r.servers || []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [result]);

  const groups = useMemo(() => {
    const map = new Map<string, Server[]>();
    for (const s of servers) {
      const g = groupOf(s);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === UNGROUPED) return 1;
      if (b === UNGROUPED) return -1;
      return a.localeCompare(b);
    });
  }, [servers]);

  if (user?.role !== "admin") {
    return <p className="text-sm text-slate-500">需要管理员权限。</p>;
  }

  const allSelected =
    servers.length > 0 && servers.every((s) => selected.has(s.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(servers.map((s) => s.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doExport = async (scope: "all" | "selected") => {
    setExportBusy(true);
    setErr("");
    try {
      const ids =
        scope === "selected" ? Array.from(selected) : undefined;
      if (scope === "selected" && ids!.length === 0) {
        setErr("请先勾选要导出的服务");
        return;
      }
      const yaml = await api.exportServers(ids);
      const suffix =
        scope === "selected"
          ? `-selected-${selected.size}`
          : `-all-${servers.length}`;
      downloadServerYAML(
        yaml,
        `nginx-admin-servers${suffix.replace(/[^\w.-]+/g, "_")}.yaml`
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setExportBusy(false);
    }
  };

  const onFile = async (file: File | null) => {
    setImportErr("");
    setResult(null);
    setPreviewCount(null);
    setImportBundle(null);
    if (!file) return;
    try {
      const text = await file.text();
      const bundle = parseServerImportFile(text);
      setImportBundle(bundle);
      setPreviewCount(bundle.servers.length);
    } catch (e) {
      setImportErr((e as Error).message);
    }
  };

  const submitImport = async () => {
    if (!importBundle) {
      setImportErr("请先选择 YAML 文件");
      return;
    }
    setImportBusy(true);
    setImportErr("");
    try {
      const payload = bundleToYAML({ ...importBundle, on_conflict: mode });
      const r = await api.importServers(payload);
      setResult(r);
      if (r.failed === 0) {
        setImportBundle(null);
        setPreviewCount(null);
        setSelected(new Set());
      }
    } catch (e) {
      setImportErr((e as Error).message);
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <SettingCard
        title="导出服务"
        desc="选择要迁移的纳管信息，下载 YAML 文件（不含 Nginx 配置）。"
      >
        <div className="space-y-3 px-5 py-4">
          {loading ? (
            <p className="text-sm text-slate-400">加载服务列表…</p>
          ) : servers.length === 0 ? (
            <p className="text-sm text-slate-500">暂无服务可导出。</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <CheckBox
                  checked={allSelected}
                  onChange={toggleAll}
                  label={`全选（${servers.length}）`}
                />
                {selected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
                  >
                    清空选择
                  </button>
                )}
              </div>

              <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                {groups.map(([name, items]) => (
                  <div key={name}>
                    <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                      {name}
                    </div>
                    <ul className="space-y-1">
                      {items.map((s) => (
                        <li
                          key={s.id}
                          className={`flex items-center gap-3 rounded-lg px-2 py-1.5 transition ${
                            selected.has(s.id)
                              ? "bg-brand-50 dark:bg-brand-950/40"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                          }`}
                        >
                          <CheckBox
                            checked={selected.has(s.id)}
                            onChange={() => toggleOne(s.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                              {s.name}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {s.address}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="secondary"
              disabled={exportBusy || selected.size === 0}
              onClick={() => doExport("selected")}
            >
              {exportBusy ? "导出中…" : `导出已选${selected.size ? ` (${selected.size})` : ""}`}
            </Button>
            <Button
              disabled={exportBusy || servers.length === 0}
              onClick={() => doExport("all")}
            >
              导出全部
            </Button>
          </div>
        </div>
      </SettingCard>

      <SettingCard title="导入服务" desc="上传 YAML 文件，按 Agent 地址迁移纳管信息。">
        <div className="space-y-4 px-5 py-4">
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void onFile(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
              dragOver
                ? "border-brand-400 bg-brand-50 dark:bg-brand-950/30"
                : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".yaml,.yml,application/yaml,application/json,.json"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              点击或拖拽 YAML 文件到此处
            </p>
            <p className="mt-1 text-xs text-slate-400">
              兼容旧版 JSON 导出文件
            </p>
          </div>

          {previewCount !== null && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              已解析 <strong>{previewCount}</strong> 条服务
            </p>
          )}

          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium text-slate-700 dark:text-slate-200">
              地址已存在时
            </legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "skip"}
                onChange={() => setMode("skip")}
              />
              跳过（保留现有）
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "update"}
                onChange={() => setMode("update")}
              />
              更新名称与分组标签
            </label>
          </fieldset>

          {result && (
            <div className="grid grid-cols-4 gap-2 rounded-lg bg-slate-50 p-3 text-center text-sm dark:bg-slate-800">
              {[
                { label: "新建", value: result.created, tone: "text-emerald-600" },
                { label: "更新", value: result.updated, tone: "text-sky-600" },
                { label: "跳过", value: result.skipped, tone: "text-slate-600" },
                {
                  label: "失败",
                  value: result.failed,
                  tone: result.failed ? "text-red-600" : "text-slate-400",
                },
              ].map((s) => (
                <div key={s.label}>
                  <div className={`text-lg font-semibold tabular-nums ${s.tone}`}>
                    {s.value}
                  </div>
                  <div className="text-xs text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>
          )}
          {result && result.errors.length > 0 && (
            <ul className="max-h-24 list-inside list-disc overflow-y-auto text-xs text-red-600">
              {result.errors.slice(0, 8).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {importErr && <p className="text-sm text-red-600">{importErr}</p>}

          <div className="flex justify-end">
            <Button
              onClick={submitImport}
              disabled={importBusy || !importBundle}
            >
              {importBusy ? "导入中…" : "开始导入"}
            </Button>
          </div>
        </div>
      </SettingCard>
    </div>
  );
}
