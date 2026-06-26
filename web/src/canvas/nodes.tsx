import { Handle, Position, type NodeProps } from "@xyflow/react";

const base =
  "rounded-lg border bg-white shadow-sm px-3 py-2 min-w-[180px] text-xs";

export function ServerNode({ data, selected }: NodeProps) {
  const d = data as { serverName: string; listen: string; ssl: boolean };
  return (
    <div
      className={`${base} ${
        selected ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-300"
      }`}
    >
      <div className="font-semibold text-brand-700">Server</div>
      <div className="mt-1 text-slate-700">
        {d.serverName || "(无 server_name)"}
      </div>
      <div className="text-slate-400">listen {d.listen || "-"}</div>
      {d.ssl && (
        <span className="mt-1 inline-block rounded bg-green-100 px-1.5 text-[10px] text-green-700">
          SSL
        </span>
      )}
      {/* 左侧 target：接收来自 HTTP server 的 "跳转到 HTTPS" 连线 */}
      <Handle id="redirect-in" type="target" position={Position.Left} />
      {/* 右侧 source：HTTP server 发出跳转连线 */}
      <Handle id="redirect-out" type="source" position={Position.Right} />
      {/* 底部 source：连向 location */}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function LocationNode({ data, selected }: NodeProps) {
  const d = data as {
    path: string;
    modifier: string;
    proxyPass: string;
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
      <div className="font-semibold text-sky-700">Location</div>
      <div className="mt-1 font-mono text-slate-700">
        {d.modifier ? `${d.modifier} ` : ""}
        {d.path}
      </div>
      {d.proxyPass && (
        <div className="text-slate-400 truncate">→ {d.proxyPass}</div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function UpstreamNode({ data, selected }: NodeProps) {
  const d = data as { name: string; method: string; count: number };
  return (
    <div
      className={`${base} ${
        selected ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-300"
      }`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-purple-700">Upstream</div>
      <div className="mt-1 font-mono text-slate-700">{d.name}</div>
      <div className="text-slate-400">
        {d.method || "round-robin"} · {d.count} 后端
      </div>
    </div>
  );
}

export const nodeTypes = {
  serverNode: ServerNode,
  locationNode: LocationNode,
  upstreamNode: UpstreamNode,
};
