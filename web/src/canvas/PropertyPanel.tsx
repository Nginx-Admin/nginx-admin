import type { ParsedConfig } from "./nginxParser";

type Selection =
  | { kind: "server"; serverId: string }
  | { kind: "location"; serverId: string; locationId: string }
  | { kind: "upstream"; upstreamId: string }
  | null;

interface Props {
  parsed: ParsedConfig;
  selection: Selection;
  onChange: (next: ParsedConfig) => void;
}

function field(
  label: string,
  value: string,
  onChange: (v: string) => void,
  placeholder = ""
) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export default function PropertyPanel({ parsed, selection, onChange }: Props) {
  if (!selection) {
    return (
      <div className="p-4 text-sm text-slate-400">
        在画布上选中一个节点以编辑其属性。
      </div>
    );
  }

  const clone = (): ParsedConfig => JSON.parse(JSON.stringify(parsed));

  if (selection.kind === "server") {
    const s = parsed.servers.find((x) => x.id === selection.serverId);
    if (!s) return null;
    const d = s.data;
    const upd = (patch: Partial<typeof d>) => {
      const next = clone();
      const t = next.servers.find((x) => x.id === selection.serverId)!;
      Object.assign(t.data, patch);
      onChange(next);
    };
    return (
      <div className="space-y-3 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Server 属性</h3>
        {field("listen", d.listen, (v) => upd({ listen: v }), "80 / 443 ssl")}
        {field("server_name", d.serverName, (v) => upd({ serverName: v }), "example.com")}
        {field("root", d.root, (v) => upd({ root: v }), "/var/www/html")}
        {field("index", d.index, (v) => upd({ index: v }), "index.html")}
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={d.ssl}
            onChange={(e) => upd({ ssl: e.target.checked })}
          />
          启用 SSL/HTTPS
        </label>
        {d.ssl && (
          <>
            {field("ssl_certificate", d.sslCertificate, (v) =>
              upd({ sslCertificate: v })
            )}
            {field("ssl_certificate_key", d.sslCertificateKey, (v) =>
              upd({ sslCertificateKey: v })
            )}
          </>
        )}
        <label className="block text-xs font-medium text-slate-600">
          其它指令（原样保留）
          <textarea
            className="code mt-1 h-24 w-full rounded-md border border-slate-300 px-2 py-1.5"
            value={d.extraDirectives}
            onChange={(e) => upd({ extraDirectives: e.target.value })}
          />
        </label>
      </div>
    );
  }

  if (selection.kind === "location") {
    const s = parsed.servers.find((x) => x.id === selection.serverId);
    const loc = s?.locations.find((l) => l.id === selection.locationId);
    if (!s || !loc) return null;
    const d = loc.data;
    const upd = (patch: Partial<typeof d>) => {
      const next = clone();
      const t = next.servers
        .find((x) => x.id === selection.serverId)!
        .locations.find((l) => l.id === selection.locationId)!;
      Object.assign(t.data, patch);
      onChange(next);
    };
    return (
      <div className="space-y-3 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Location 属性</h3>
        <label className="block text-xs font-medium text-slate-600">
          匹配修饰符
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={d.modifier}
            onChange={(e) => upd({ modifier: e.target.value })}
          >
            <option value="">（前缀，无修饰符）</option>
            <option value="=">= 精确匹配</option>
            <option value="^~">^~ 前缀优先</option>
            <option value="~">~ 正则（区分大小写）</option>
            <option value="~*">~* 正则（不区分大小写）</option>
          </select>
        </label>
        {field("path", d.path, (v) => upd({ path: v }), "/api")}
        {field("proxy_pass", d.proxyPass, (v) => upd({ proxyPass: v }), "http://127.0.0.1:8080")}
        {field("try_files", d.tryFiles, (v) => upd({ tryFiles: v }), "$uri $uri/ /index.html")}
        {field("root", d.root, (v) => upd({ root: v }))}
        <label className="block text-xs font-medium text-slate-600">
          其它指令（原样保留）
          <textarea
            className="code mt-1 h-24 w-full rounded-md border border-slate-300 px-2 py-1.5"
            value={d.extraDirectives}
            onChange={(e) => upd({ extraDirectives: e.target.value })}
          />
        </label>
      </div>
    );
  }

  // upstream
  const u = parsed.upstreams.find((x) => x.id === selection.upstreamId);
  if (!u) return null;
  const d = u.data;
  const upd = (patch: Partial<typeof d>) => {
    const next = clone();
    const t = next.upstreams.find((x) => x.id === selection.upstreamId)!;
    Object.assign(t.data, patch);
    onChange(next);
  };
  const updServer = (idx: number, patch: Partial<(typeof d.servers)[number]>) => {
    const next = clone();
    const t = next.upstreams.find((x) => x.id === selection.upstreamId)!;
    Object.assign(t.data.servers[idx], patch);
    onChange(next);
  };
  return (
    <div className="space-y-3 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Upstream 属性</h3>
      {field("name", d.name, (v) => upd({ name: v }), "backend")}
      <label className="block text-xs font-medium text-slate-600">
        负载均衡策略
        <select
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          value={d.method}
          onChange={(e) => upd({ method: e.target.value })}
        >
          <option value="">轮询（默认）</option>
          <option value="least_conn">least_conn 最少连接</option>
          <option value="ip_hash">ip_hash</option>
        </select>
      </label>
      <div className="text-xs font-medium text-slate-600">后端服务器</div>
      {d.servers.map((srv, idx) => (
        <div key={idx} className="rounded-md border border-slate-200 p-2">
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            value={srv.address}
            placeholder="127.0.0.1:8081"
            onChange={(e) => updServer(idx, { address: e.target.value })}
          />
          <div className="mt-1 flex items-center gap-2 text-xs">
            <input
              className="w-20 rounded border border-slate-300 px-2 py-1"
              value={srv.weight || ""}
              placeholder="weight"
              onChange={(e) => updServer(idx, { weight: e.target.value })}
            />
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!srv.backup}
                onChange={(e) => updServer(idx, { backup: e.target.checked })}
              />
              backup
            </label>
            <button
              className="ml-auto text-red-500"
              onClick={() => {
                const next = clone();
                next.upstreams
                  .find((x) => x.id === selection.upstreamId)!
                  .data.servers.splice(idx, 1);
                onChange(next);
              }}
            >
              删除
            </button>
          </div>
        </div>
      ))}
      <button
        className="text-xs text-brand-600"
        onClick={() => {
          const next = clone();
          next.upstreams
            .find((x) => x.id === selection.upstreamId)!
            .data.servers.push({ address: "" });
          onChange(next);
        }}
      >
        + 添加后端
      </button>
    </div>
  );
}

export type { Selection };
