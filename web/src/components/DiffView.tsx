import type { DiffLine } from "../utils/diff";

export default function DiffView({ lines }: { lines: DiffLine[] }) {
  if (lines.every((l) => l.type === "same")) {
    return <p className="text-sm text-slate-500">无变更</p>;
  }
  return (
    <div className="max-h-[60vh] overflow-auto rounded border border-slate-200 bg-slate-50 font-mono text-xs dark:border-slate-700 dark:bg-slate-900">
      {lines.map((l, i) => (
        <div
          key={i}
          className={`flex gap-2 px-2 py-0.5 ${
            l.type === "add"
              ? "bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200"
              : l.type === "remove"
                ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200"
                : "text-slate-600 dark:text-slate-400"
          }`}
        >
          <span className="w-4 shrink-0 opacity-60">
            {l.type === "add" ? "+" : l.type === "remove" ? "-" : " "}
          </span>
          <span className="w-8 shrink-0 text-right opacity-40">
            {l.oldNo ?? ""}
          </span>
          <span className="w-8 shrink-0 text-right opacity-40">
            {l.newNo ?? ""}
          </span>
          <span className="flex-1 whitespace-pre-wrap break-all">{l.text}</span>
        </div>
      ))}
    </div>
  );
}
