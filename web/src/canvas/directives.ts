// 方案 B 的前端数据层：画布与源码模式共用 crossplane 指令树（Directive[]）。
//
// 与旧的 nginxParser.ts（前端轻量解析、会丢注释）不同，这里所有解析/回写都走后端
// crossplane 接口（api.parseConfig / api.buildConfig），注释与复杂指令全部保真。
//
// 本模块提供：
//  - 树的不可变更新辅助（按路径定位、改参数、增删子节点）
//  - 给画布用的"顶层块"提取（server / upstream / 其它）

import type { Directive } from "../api/client";

export type { Directive };

// 节点路径：从根到目标的索引序列，如 [0,2,1] 表示 root[0].block[2].block[1]。
export type NodePath = number[];

// 特殊选中标记：表示"所有顶层全局指令"（而非某个具体节点）。
// 用一个不可能出现在真实路径中的负数索引。
export const GLOBALS_MARKER = -999;

// 深拷贝整棵树（编辑前用，保持不可变更新）
export function cloneTree(dirs: Directive[]): Directive[] {
  return JSON.parse(JSON.stringify(dirs));
}

// 按路径取节点（只读）
export function getNode(dirs: Directive[], path: NodePath): Directive | null {
  let cur: Directive[] | undefined = dirs;
  let node: Directive | null = null;
  for (const idx of path) {
    if (!cur || idx < 0 || idx >= cur.length) return null;
    node = cur[idx];
    cur = node.block;
  }
  return node;
}

// 在克隆树上按路径取节点（可写）。返回的节点可直接修改。
export function getMutableNode(
  dirs: Directive[],
  path: NodePath
): Directive | null {
  return getNode(dirs, path); // dirs 已是克隆，可直接改
}

// 取某路径节点的父级数组与其在父中的索引
function getParentArray(
  dirs: Directive[],
  path: NodePath
): { arr: Directive[]; idx: number } | null {
  if (path.length === 0) return null;
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];
  if (parentPath.length === 0) return { arr: dirs, idx };
  const parent = getNode(dirs, parentPath);
  if (!parent || !parent.block) return null;
  return { arr: parent.block, idx };
}

// 更新某节点的参数（返回新树）
export function updateArgs(
  dirs: Directive[],
  path: NodePath,
  args: string[]
): Directive[] {
  const next = cloneTree(dirs);
  const node = getMutableNode(next, path);
  if (node) node.args = args;
  return next;
}

// 更新指令名
export function updateDirectiveName(
  dirs: Directive[],
  path: NodePath,
  name: string
): Directive[] {
  const next = cloneTree(dirs);
  const node = getMutableNode(next, path);
  if (node) node.directive = name;
  return next;
}

// 更新注释内容（directive === "#"）
export function updateComment(
  dirs: Directive[],
  path: NodePath,
  comment: string
): Directive[] {
  const next = cloneTree(dirs);
  const node = getMutableNode(next, path);
  if (node) node.comment = comment;
  return next;
}

// 删除某节点
export function removeNode(dirs: Directive[], path: NodePath): Directive[] {
  const next = cloneTree(dirs);
  const loc = getParentArray(next, path);
  if (loc) loc.arr.splice(loc.idx, 1);
  return next;
}

// 在某块节点的 block 末尾追加一个子指令
export function appendChild(
  dirs: Directive[],
  parentPath: NodePath,
  child: Directive
): Directive[] {
  const next = cloneTree(dirs);
  if (parentPath.length === 0) {
    next.push(child);
    return next;
  }
  const parent = getMutableNode(next, parentPath);
  if (parent) {
    if (!parent.block) parent.block = [];
    parent.block.push(child);
  }
  return next;
}

// 新建一个简单指令
export function newDirective(name = "directive", args: string[] = []): Directive {
  return { directive: name, args };
}

// 新建一个块指令（带空 block）
export function newBlock(name = "server", args: string[] = []): Directive {
  return { directive: name, args, block: [] };
}

// 是否块指令
export function isBlock(d: Directive): boolean {
  return Array.isArray(d.block);
}

// 是否注释
export function isComment(d: Directive): boolean {
  return d.directive === "#";
}

// 顶层"块"摘要（给画布用）：提取 server / upstream / 其它块，做粗粒度展示。
export interface TopBlock {
  path: NodePath; // 在根中的路径，如 [2]
  kind: "server" | "upstream" | "http" | "events" | "other";
  title: string; // 展示标题
  node: Directive;
}

export function topBlocks(dirs: Directive[]): TopBlock[] {
  const out: TopBlock[] = [];
  dirs.forEach((d, i) => {
    if (!isBlock(d)) return;
    let kind: TopBlock["kind"] = "other";
    if (d.directive === "server") kind = "server";
    else if (d.directive === "upstream") kind = "upstream";
    else if (d.directive === "http") kind = "http";
    else if (d.directive === "events") kind = "events";
    const title =
      d.args && d.args.length ? `${d.directive} ${d.args.join(" ")}` : d.directive;
    out.push({ path: [i], kind, title, node: d });
  });
  return out;
}

// 从 server 块里提取常用展示信息（listen / server_name）
export function serverSummary(d: Directive): { listen: string; serverName: string } {
  let listen = "";
  let serverName = "";
  for (const c of d.block || []) {
    if (c.directive === "listen") listen = listen ? listen + ", " + c.args.join(" ") : c.args.join(" ");
    if (c.directive === "server_name") serverName = c.args.join(" ");
  }
  return { listen, serverName };
}

// ---- 画布建模：递归收集 server / upstream（不限是否在 http 块内）+ 提取 location ----

export interface FlowServer {
  path: NodePath;
  node: Directive;
  listen: string;
  serverName: string;
  isHttpRedirect: boolean; // 含 return 30x https://
  locations: FlowLocation[];
}

export interface FlowLocation {
  path: NodePath; // 该 location 节点在树中的完整路径
  node: Directive;
  matcher: string; // location 的匹配串，如 "= /502.html"、"~ ^/template"、"/"
  proxyPass: string;
  upstreamName: string; // 若 proxy_pass 指向 upstream 名（非 IP），否则空
  summary: string; // 一行摘要：proxy_pass / root / try_files
}

export interface FlowModel {
  servers: FlowServer[];
  upstreams: { path: NodePath; node: Directive; name: string }[];
  // 结构块：http / events 等外层块（主配置常见），画布作为容器/汇总节点展示
  structureBlocks: {
    path: NodePath;
    node: Directive;
    kind: "http" | "events" | "other";
    title: string;
    childCount: number;
    directiveCount: number; // 块内非块指令数（gzip/proxy_*/log_format 等）
  }[];
  // 顶层全局指令（http/events 之外的简单指令，如 user/worker_processes/pid）
  globals: { path: NodePath; node: Directive; text: string }[];
}

// 递归遍历整棵树，收集所有 server 和 upstream 块（含 http 内部），
// 同时收集顶层的 http/events 结构块与全局指令（用于主配置画布展示）。
export function buildFlowModel(dirs: Directive[]): FlowModel {
  const servers: FlowServer[] = [];
  const upstreams: FlowModel["upstreams"] = [];
  const structureBlocks: FlowModel["structureBlocks"] = [];
  const globals: FlowModel["globals"] = [];

  // 顶层（根）扫描：识别 http/events 结构块与全局指令
  dirs.forEach((d, i) => {
    if (isComment(d)) return;
    if (isBlock(d)) {
      if (d.directive === "http" || d.directive === "events") {
        const block = d.block || [];
        const directiveCount = block.filter(
          (c) => !isBlock(c) && !isComment(c)
        ).length;
        structureBlocks.push({
          path: [i],
          node: d,
          kind: d.directive,
          title: d.directive,
          childCount: block.length,
          directiveCount,
        });
      }
      // server/upstream 顶层块由下面的 walk 统一收集
    } else {
      // 顶层简单指令 = 全局指令
      const text =
        d.args && d.args.length
          ? `${d.directive} ${d.args.join(" ")}`
          : d.directive;
      globals.push({ path: [i], node: d, text });
    }
  });

  const walk = (arr: Directive[], base: NodePath) => {
    arr.forEach((d, i) => {
      const path = [...base, i];
      if (d.directive === "server" && Array.isArray(d.block)) {
        servers.push(extractServer(d, path));
        return; // server 内部的 location 已在 extractServer 处理，不再下钻
      }
      if (d.directive === "upstream" && Array.isArray(d.block)) {
        upstreams.push({ path, node: d, name: d.args[0] || "upstream" });
        return;
      }
      if (Array.isArray(d.block)) walk(d.block, path);
    });
  };
  walk(dirs, []);
  return { servers, upstreams, structureBlocks, globals };
}

function extractServer(node: Directive, path: NodePath): FlowServer {
  const { listen, serverName } = serverSummary(node);
  let isHttpRedirect = false;
  const locations: FlowLocation[] = [];

  (node.block || []).forEach((c, i) => {
    // return 30x https://...
    if (c.directive === "return") {
      const joined = c.args.join(" ");
      if (/https:\/\//i.test(joined)) {
        isHttpRedirect = true;
      }
    }
    // rewrite ... https://... (permanent/redirect)
    if (c.directive === "rewrite") {
      const joined = c.args.join(" ");
      if (/https:\/\//i.test(joined)) {
        isHttpRedirect = true;
      }
    }
    if (c.directive === "location" && Array.isArray(c.block)) {
      locations.push(extractLocation(c, [...path, i]));
    }
  });

  return { path, node, listen, serverName, isHttpRedirect, locations };
}

function extractLocation(node: Directive, path: NodePath): FlowLocation {
  const matcher = node.args.join(" ") || "/";
  let proxyPass = "";
  let root = "";
  let tryFiles = "";
  for (const c of node.block || []) {
    if (c.directive === "proxy_pass") proxyPass = c.args.join(" ");
    if (c.directive === "root") root = c.args.join(" ");
    if (c.directive === "try_files") tryFiles = c.args.join(" ");
  }
  // proxy_pass 指向 upstream 名（http://name，name 非 IP:port）
  let upstreamName = "";
  if (proxyPass) {
    const m = proxyPass.match(/^https?:\/\/([^/;:]+)/);
    if (m && !/^\d+\.\d+\.\d+\.\d+$/.test(m[1]) && m[1] !== "localhost") {
      upstreamName = m[1];
    }
  }
  let summary = "";
  if (proxyPass) summary = "→ " + proxyPass;
  else if (tryFiles) summary = "try_files " + tryFiles;
  else if (root) summary = "root " + root;

  return { path, node, matcher, proxyPass, upstreamName, summary };
}

// 判断两个 server 是否有相同的 server_name（用于 80→443 跳转连线）
export function shareServerName(a: string, b: string): boolean {
  const setA = new Set(a.split(/\s+/).filter(Boolean));
  return b.split(/\s+/).some((n) => n && setA.has(n));
}

// 是否监听 443 / ssl
export function isHttpsListen(listen: string): boolean {
  return /\b443\b/.test(listen) || /\bssl\b/.test(listen);
}

// 是否监听 80（且非 ssl）
export function isHttpListen(listen: string): boolean {
  return /\b80\b/.test(listen) && !/\bssl\b/.test(listen);
}
