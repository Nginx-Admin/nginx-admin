/**
 * nginx location 流量模拟（简化版，单 server 块内匹配）。
 * 优先级：精确 = > ^~ 最长前缀 > 正则 ~ / ~*（先定义先匹配）> 普通前缀最长 > 无匹配
 */
import type { FlowLocation, FlowModel, FlowServer } from "./directives";

export interface TrafficMatch {
  server: FlowServer;
  location: FlowLocation;
  matchKind: string;
}

function parseMatcher(matcher: string): { mod: string; path: string } {
  const parts = matcher.trim().split(/\s+/);
  const mods = ["=", "~", "~*", "^~"];
  if (parts.length >= 2 && mods.includes(parts[0])) {
    return { mod: parts[0], path: parts.slice(1).join(" ") };
  }
  return { mod: "", path: matcher.trim() || "/" };
}

function locMatches(loc: FlowLocation, uri: string): {
  ok: boolean;
  kind: string;
  prefixLen: number;
  order: number;
} {
  const { mod, path } = parseMatcher(loc.matcher);
  if (mod === "=") {
    return { ok: uri === path, kind: "exact", prefixLen: path.length, order: 0 };
  }
  if (mod === "^~") {
    return {
      ok: uri.startsWith(path),
      kind: "prefix_noregex",
      prefixLen: path.length,
      order: 0,
    };
  }
  if (mod === "~") {
    try {
      return {
        ok: new RegExp(path).test(uri),
        kind: "regex",
        prefixLen: 0,
        order: 0,
      };
    } catch {
      return { ok: false, kind: "regex", prefixLen: 0, order: 0 };
    }
  }
  if (mod === "~*") {
    try {
      return {
        ok: new RegExp(path, "i").test(uri),
        kind: "regex",
        prefixLen: 0,
        order: 0,
      };
    } catch {
      return { ok: false, kind: "regex", prefixLen: 0, order: 0 };
    }
  }
  return {
    ok: uri.startsWith(path),
    kind: "prefix",
    prefixLen: path.length,
    order: 0,
  };
}

function pickServer(model: FlowModel, host: string): FlowServer | null {
  if (model.servers.length === 0) return null;
  const h = host.trim().toLowerCase();
  if (!h) return model.servers[0];
  for (const s of model.servers) {
    const names = s.serverName.split(/\s+/).filter((n) => n && n !== "_");
    if (names.some((n) => n.toLowerCase() === h)) return s;
  }
  // default / catch-all
  for (const s of model.servers) {
    if (!s.serverName.trim() || /\b_\b/.test(s.serverName)) return s;
  }
  return model.servers[0];
}

export function simulateTraffic(
  model: FlowModel,
  uri: string,
  host = ""
): TrafficMatch | null {
  const path = uri.startsWith("/") ? uri : "/" + uri;
  const server = pickServer(model, host);
  if (!server) return null;

  type Cand = {
    loc: FlowLocation;
    kind: string;
    prefixLen: number;
    order: number;
  };
  const cands: Cand[] = [];
  server.locations.forEach((loc, order) => {
    const m = locMatches(loc, path);
    if (m.ok) cands.push({ loc, kind: m.kind, prefixLen: m.prefixLen, order });
  });
  if (cands.length === 0) return null;

  const exact = cands.find((c) => c.kind === "exact");
  if (exact)
    return { server, location: exact.loc, matchKind: "精确匹配 (=)" };

  const pnr = cands
    .filter((c) => c.kind === "prefix_noregex")
    .sort((a, b) => b.prefixLen - a.prefixLen);
  if (pnr.length)
    return { server, location: pnr[0].loc, matchKind: "前缀 ^~（停止正则）" };

  const regex = cands.filter((c) => c.kind === "regex").sort((a, b) => a.order - b.order);
  if (regex.length)
    return { server, location: regex[0].loc, matchKind: "正则 ~ / ~*" };

  const prefix = cands
    .filter((c) => c.kind === "prefix")
    .sort((a, b) => b.prefixLen - a.prefixLen);
  return { server, location: prefix[0].loc, matchKind: "最长前缀" };
}
