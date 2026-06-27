import { Handle, Position, type NodeProps } from "@xyflow/react";

const base =
  "rounded-lg border bg-white shadow-sm px-3 py-2 min-w-[180px] text-xs";

const kindColor: Record<string, string> = {
  server: "text-brand-700",
  upstream: "text-purple-700",
  location: "text-sky-700",
  http: "text-sky-700",
  events: "text-emerald-700",
  other: "text-slate-700",
};

function ringCls(matched?: boolean, selected?: boolean) {
  if (matched) return "border-amber-500 ring-2 ring-amber-300";
  if (selected) return "border-brand-500 ring-2 ring-brand-200";
  return "border-slate-300";
}

// 通用块节点：server / upstream / http 等。
export function BlockNode({ data, selected }: NodeProps) {
  const d = data as {
    kind: string;
    title: string;
    subtitle?: string;
    badge?: string;
    matched?: boolean;
  };
  return (
    <div className={`${base} max-w-[280px] ${ringCls(d.matched, selected)}`}>
      {/* 左/右：HTTPS 跳转连线的接入/发出口 */}
      <Handle id="redirect-in" type="target" position={Position.Left} />
      <Handle id="redirect-out" type="source" position={Position.Right} />
      {/* 顶/底：与 location 的层级连线 */}
      <Handle type="target" position={Position.Top} />
      <div className={`font-semibold ${kindColor[d.kind] || "text-slate-700"}`}>
        {d.title}
      </div>
      {d.subtitle && (
        <div className="mt-1 truncate text-slate-500">{d.subtitle}</div>
      )}
      {d.badge && (
        <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
          {d.badge}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// location 节点：展示匹配串 + 摘要。
// 普通 location 用 subtitle 单行；引用 location（external）用 lines 多行展示，宽度自适应。
export function LocationNode({ data, selected }: NodeProps) {
  const d = data as {
    title: string;
    subtitle?: string;
    lines?: string[]; // 多行展示（引用节点用）
    external?: boolean;
    matched?: boolean;
  };
  return (
    <div
      className={`${base} ${
        d.lines ? "max-w-[520px]" : "max-w-[280px]"
      } ${ringCls(d.matched, selected)}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="font-mono font-semibold text-sky-700">{d.title}</div>
      {d.lines ? (
        <div className="mt-1 space-y-0.5">
          {d.lines.map((ln, i) => (
            <div
              key={i}
              className="whitespace-nowrap font-mono text-[11px] text-slate-500"
            >
              {ln}
            </div>
          ))}
        </div>
      ) : (
        d.subtitle && (
          <div className="mt-1 truncate text-slate-500">{d.subtitle}</div>
        )
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const nodeTypes = {
  blockNode: BlockNode,
  locationNode: LocationNode,
};
