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
