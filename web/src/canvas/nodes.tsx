import { Handle, Position, type NodeProps } from "@xyflow/react";

const base =
  "rounded-lg border bg-white shadow-sm px-3 py-2 min-w-[180px] max-w-[240px] text-xs";

const kindColor: Record<string, string> = {
  server: "text-brand-700",
  upstream: "text-purple-700",
  http: "text-sky-700",
  events: "text-emerald-700",
  other: "text-slate-700",
};

// 通用块节点：展示一个顶层 crossplane 块（server / upstream / http / ...）。
export function BlockNode({ data, selected }: NodeProps) {
  const d = data as {
    kind: string;
    title: string;
    subtitle?: string;
    childCount: number;
    matched?: boolean;
  };
  return (
    <div
      className={`${base} ${
        d.matched
          ? "border-amber-500 ring-2 ring-amber-300"
          : selected
            ? "border-brand-500 ring-2 ring-brand-200"
            : "border-slate-300"
      }`}
    >
      <Handle type="target" position={Position.Top} />
      <div className={`font-semibold ${kindColor[d.kind] || "text-slate-700"}`}>
        {d.title}
      </div>
      {d.subtitle && (
        <div className="mt-1 truncate text-slate-500">{d.subtitle}</div>
      )}
      <div className="mt-1 text-[10px] text-slate-400">
        {d.childCount} 条指令
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const nodeTypes = {
  blockNode: BlockNode,
};
