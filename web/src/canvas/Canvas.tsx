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
  isHttpListen,
  type Directive,
  type NodePath,
} from "./directives";

interface Props {
  dirs: Directive[];
  selectedPath: NodePath | null;
  onSelect: (path: NodePath | null) => void;
  matchedPath?: NodePath | null;
}

const samePath = (a: NodePath | null | undefined, b: NodePath | null | undefined) =>
  !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);

const nid = (p: NodePath) => "n-" + p.join("-");

function toFlow(
  dirs: Directive[],
  matchedPath?: NodePath | null
): { nodes: Node[]; edges: Edge[] } {
  const model = buildFlowModel(dirs);
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // upstream 名 → nodeId（右列）
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
        const target = upstreamId.get(loc.upstreamName);
        if (target) {
          edges.push({
            id: `${locId}-${target}`,
            source: locId,
            target,
            type: "smoothstep",
            animated: true,
          });
        }
      }
    });

    serverY += blockH + 30;
  });

  // 80 → 443 跳转连线：HTTP 跳转 server → 同 server_name 的 HTTPS server
  for (const src of model.servers) {
    if (!src.isHttpRedirect || !isHttpListen(src.listen)) continue;
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
}: Props) {
  const { nodes, edges } = useMemo(
    () => toFlow(dirs, matchedPath),
    [dirs, matchedPath]
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
