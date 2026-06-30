import { useRef, useState } from "react";
import {
  api,
  type Server,
  type ServerExportBundle,
  type ServerImportResult,
} from "../api/client";
import { downloadServerBundle, parseServerImportFile } from "../utils/serverExport";
import { Button } from "./ui";

type Tab = "export" | "import";

export default function ServerMigrationModal({
  servers,
  selectedIds,
  onClose,
  onImported,
}: {
  servers: Server[];
  selectedIds: Set<string>;
  onClose: () => void;
  onImported: () => void;
}) {
  const [tab, setTab] = useState<Tab>(selectedIds.size > 0 ? "export" : "export");
  const [exportScope, setExportScope] = useState<"all" | "selected">(
    selectedIds.size > 0 ? "selected" : "all"
  );
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [preview, setPreview] = useState<ServerExportBundle | null>(null);
  const [result, setResult] = useState<ServerImportResult | null>(null);
  const [importErr, setImportErr] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const selectedCount = selectedIds.size;
  const totalCount = servers.length;

  const doExport = async () => {
    setExportBusy(true);
    setExportErr("");
    try {
      const ids =
        exportScope === "selected" ? Array.from(selectedIds) : undefined;
      if (exportScope === "selected" && ids!.length === 0) {
        setExportErr("请先在列表中勾选要导出的服务");
        return;
      }
      const bundle = await api.exportServers(ids);
      const suffix =
        exportScope === "selected"
          ? `-selected-${bundle.servers.length}`
          : `-all-${bundle.servers.length}`;
      downloadServerBundle(
        bundle,
        `nginx-admin-servers${suffix.replace(/[^\w.-]+/g, "_")}.json`
      );
    } catch (e) {
      setExportErr((e as Error).message);
    } finally {
      setExportBusy(false);
    }
  };

  const onFile = async (file: File | null) => {
    setImportErr("");
    setResult(null);
    setPreview(null);
    if (!file) return;
    try {
      const text = await file.text();
      setPreview(parseServerImportFile(text));
    } catch (e) {
      setImportErr((e as Error).message);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void onFile(file);
  };

  const submitImport = async () => {
    if (!preview) {
      setImportErr("请先选择 JSON 文件");
      return;
    }
    setImportBusy(true);
    setImportErr("");
    try {
      const r = await api.importServers(preview, mode);
      setResult(r);
      if (r.failed === 0) onImported();
    } catch (e) {
      setImportErr((e as Error).message);
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            服务迁移
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            导出或导入纳管信息（名称、地址、分组），不含 Nginx 配置内容。
          </p>
          <div className="mt-4 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                { id: "export" as const, label: "导出" },
                { id: "import" as const, label: "导入" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === t.id
                    ? "bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-800 dark:text-slate-400"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5">
          {tab === "export" ? (
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  导出范围
                </legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 transition hover:border-brand-300 dark:border-slate-700">
                  <input
                    type="radio"
                    name="export-scope"
                    className="mt-0.5"
                    checked={exportScope === "all"}
                    onChange={() => setExportScope("all")}
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                      全部服务
                    </span>
                    <span className="text-xs text-slate-500">
                      共 {totalCount} 条
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                    selectedCount === 0
                      ? "cursor-not-allowed border-slate-100 opacity-60 dark:border-slate-800"
                      : "border-slate-200 hover:border-brand-300 dark:border-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="export-scope"
                    className="mt-0.5"
                    checked={exportScope === "selected"}
                    disabled={selectedCount === 0}
                    onChange={() => setExportScope("selected")}
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                      列表已选
                    </span>
                    <span className="text-xs text-slate-500">
                      {selectedCount > 0
                        ? `已勾选 ${selectedCount} 条`
                        : "请先在列表中勾选服务"}
                    </span>
                  </span>
                </label>
              </fieldset>
              {exportErr && (
                <p className="text-sm text-red-600">{exportErr}</p>
              )}
              <div className="flex justify-end">
                <Button onClick={doExport} disabled={exportBusy}>
                  {exportBusy ? "导出中…" : "下载 JSON"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                role="button"
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
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
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  点击或拖拽 JSON 文件到此处
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  支持 nginx-admin 导出的服务清单
                </p>
              </div>

              {preview && (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  已解析 <strong>{preview.servers.length}</strong> 条服务
                  {preview.exported_at && (
                    <span className="text-slate-500">
                      {" "}
                      · 导出于 {preview.exported_at}
                    </span>
                  )}
                </div>
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

              <div className="flex justify-end gap-2">
                <Button
                  onClick={submitImport}
                  disabled={importBusy || !preview}
                >
                  {importBusy ? "导入中…" : "开始导入"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-6 py-3 dark:border-slate-800">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
