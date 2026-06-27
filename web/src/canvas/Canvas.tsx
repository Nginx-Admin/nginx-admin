import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
} from "@xyflow/react";
import { nodeTypes } from "./nodes";
import {
  buildFlowModel,
  shareServerName,
  isHttpsListen,
  type Directive,
  type NodePath,
} from "./directives";

interface UpstreamRef {
  upstream: string;
  logical_path: string;
  server_name: string;
  location: string;
  proxy_pass: string;
}

interface Props {
  dirs: Directive[];
  selectedPath: NodePath | null;
  onSelect: (path: NodePath | null) => void;
  matchedPath?: NodePath | null;
  externalUpstreams?: { name: string; logical_path: string }[];
  upstreamRefs?: UpstreamRef[];
}

const samePath = (a: NodePath | null | undefined, b: NodePath | null | undefined) =>
  !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);

const nid = (p: NodePath) => "n-" + p.join("-");

function toFlow(
  dirs: Directive[],
  matchedPath?: NodePath | null,
  externalUpstreams: { name: string; logical_path: string }[] = [],
  upstreamRefs: UpstreamRef[] = []
): { nodes: Node[]; edges: Edge[] } {
  const model = buildFlowModel(dirs);
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // upstream 名 → nodeId（右列）。本文件内定义的 upstream。
  const upstreamId = new Map<string, string>();
  model.upstreams.forEach((u, i) => {
    const id = nid(u.path);
    upstreamId.set(u.name, id);
    nodes.push({
      id,
      type: "blockNode",
      position: { x: 980, y: 40 + i * 130 },
      data: {
        kind: "upstream",
        title: `upstream ${u.name}`,
        subtitle: `${(u.node.block || []).length} 条指令`,
        matched: samePath(matchedPath, u.path),
        path: u.path,
      },
    });
  });

  // 反向引用：对本文件内定义的每个 upstream，把"引用了它的 server/location"
  // （来自其它文件）也画出来，连线表示引用关系。
  // 典型场景：打开 upstream.conf 时，展示哪些 server/location 用了这些 upstream。
  if (model.upstreams.length > 0 && upstreamRefs.length > 0) {
    const localUpstreamNames = new Set(model.upstreams.map((u) => u.name));
    let refIdx = 0;
    // 去重：同一 (文件,server,location,upstream) 只画一个引用节点
    const seen = new Set<string>();
    for (const ref of upstreamRefs) {
      if (!localUpstreamNames.has(ref.upstream)) continue;
      const key = `${ref.logical_path}|${ref.server_name}|${ref.location}|${ref.upstream}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const refNodeId = `ref-${refIdx}`;
      const targetUpstream = upstreamId.get(ref.upstream)!;
      const title = ref.location
        ? `location ${ref.location}`
        : ref.server_name
          ? `server ${ref.server_name}`
          : "引用方";
      const subtitle = [
        ref.server_name && `server ${ref.server_name}`,
        `来自 ${ref.logical_path}`,
      ]
        .filter(Boolean)
        .join(" · ");

      nodes.push({
        id: refNodeId,
        type: "locationNode",
        position: { x: 60, y: 40 + refIdx * 110 },
        data: {
          kind: "location",
          title,
          subtitle,
          external: true,
        },
      });
      edges.push({
        id: `${refNodeId}-${targetUpstream}`,
        source: refNodeId,
        target: targetUpstream,
        type: "smoothstep",
        animated: true,
        label: "引用",
        style: { strokeDasharray: "4 4", stroke: "#0ea5e9" },
        labelStyle: { fill: "#0369a1", fontSize: 10 },
      });
      refIdx++;
    }
  }

  // 外部文件定义的 upstream：名字 → 定义所在文件。用于跨文件连线。
  const externalMap = new Map<string, string>();
  for (const u of externalUpstreams) {
    if (!upstreamId.has(u.name)) externalMap.set(u.name, u.logical_path);
  }
  // 外部 upstream 节点（按需创建）：名字 → nodeId
  const externalNodeId = new Map<string, string>();
  let externalIdx = model.upstreams.length;

  // server（左列）+ 其下 location（中列）
  let serverY = 40;
  model.servers.forEach((s) => {
    const sId = nid(s.path);
    const locCount = s.locations.length;
    // 该 server 纵向占用高度，保证 location 不重叠
    const blockH = Math.max(1, locCount) * 96 + 40;

    nodes.push({
      id: sId,
      type: "blockNode",
      position: { x: 60, y: serverY + (blockH - 70) / 2 },
      data: {
        kind: "server",
        title: s.serverName ? `server ${s.serverName}` : "server",
        subtitle: s.listen ? `listen ${s.listen}` : undefined,
        badge: s.isHttpRedirect ? "→ HTTPS 跳转" : undefined,
        matched: samePath(matchedPath, s.path),
        path: s.path,
      },
    });

    s.locations.forEach((loc, li) => {
      const locId = nid(loc.path);
      nodes.push({
        id: locId,
        type: "locationNode",
        position: { x: 480, y: serverY + li * 96 },
        data: {
          kind: "location",
          title: `location ${loc.matcher}`,
          subtitle: loc.summary || undefined,
          matched: samePath(matchedPath, loc.path),
          path: loc.path,
        },
      });
      // server → location
      edges.push({
        id: `${sId}-${locId}`,
        source: sId,
        target: locId,
        type: "smoothstep",
      });
      // location → upstream（proxy_pass 指向 upstream 名）
      if (loc.upstreamName) {
        const name = loc.upstreamName;
        const local = upstreamId.get(name);
        if (local) {
          // 1) 本文件内定义的 upstream：直接连
          edges.push({
            id: `${locId}-${local}`,
            source: locId,
            target: local,
            type: "smoothstep",
            animated: true,
          });
        } else if (externalMap.has(name)) {
          // 2) 定义在其它文件（如 conf.d/upstream.conf）的 upstream：
          //    按需补一个"外部 upstream"节点并连线，标注来源文件。
          let extId = externalNodeId.get(name);
          if (!extId) {
            extId = `ext-upstream-${name}`;
            externalNodeId.set(name, extId);
            nodes.push({
              id: extId,
              type: "blockNode",
              position: { x: 980, y: 40 + externalIdx * 130 },
              data: {
                kind: "upstream",
                title: `upstream ${name}`,
                subtitle: `外部文件：${externalMap.get(name)}`,
                external: true,
              },
            });
            externalIdx++;
          }
          edges.push({
            id: `${locId}-${extId}`,
            source: locId,
            target: extId,
            type: "smoothstep",
            animated: true,
            style: { strokeDasharray: "4 4" },
          });
        }
        // 3) 哪都找不到（直连 ip:port 或 upstream 未发现）：
        //    不连线，location 节点的 subtitle 已含 proxy_pass 目标地址。
      }
    });

    serverY += blockH + 30;
  });

  // 80 → 443 跳转连线：HTTP 跳转 server → 同 server_name 的 HTTPS server。
  // 跳转源判定：含 return/rewrite 到 https 即可；不强求显式写 listen 80
  // （未写 listen 默认即 80），但源自身不能是 https 块。
  for (const src of model.servers) {
    if (!src.isHttpRedirect || isHttpsListen(src.listen)) continue;
    const target = model.servers.find(
      (t) =>
        t.path !== src.path &&
        isHttpsListen(t.listen) &&
        shareServerName(src.serverName, t.serverName)
    );
    if (target) {
      edges.push({
        id: `redirect-${nid(src.path)}-${nid(target.path)}`,
        source: nid(src.path),
        target: nid(target.path),
        sourceHandle: "redirect-out",
        targetHandle: "redirect-in",
        type: "smoothstep",
        animated: true,
        label: "301 → HTTPS",
        style: { stroke: "#f59e0b", strokeDasharray: "5 5" },
        labelStyle: { fill: "#b45309", fontSize: 10 },
      });
    }
  }

  return { nodes, edges };
}

export default function Canvas({
  dirs,
  selectedPath,
  onSelect,
  matchedPath,
  externalUpstreams,
  upstreamRefs,
}: Props) {
  const { nodes, edges } = useMemo(
    () => toFlow(dirs, matchedPath, externalUpstreams, upstreamRefs),
    [dirs, matchedPath, externalUpstreams, upstreamRefs]
  );

  const styledNodes = nodes.map((n) => ({
    ...n,
    selected: samePath(selectedPath, (n.data as { path?: NodePath }).path),
  }));

  const handleNodeClick = (_: unknown, node: Node) => {
    const p = (node.data as { path?: NodePath }).path;
    if (p) onSelect(p);
  };

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={() => onSelect(null)}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}
