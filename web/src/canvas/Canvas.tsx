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
  topBlocks,
  serverSummary,
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

// 收集一个 server 块里 proxy_pass 引用的 upstream 名
function referencedUpstreams(server: Directive): string[] {
  const names: string[] = [];
  const walk = (dirs: Directive[]) => {
    for (const d of dirs) {
      if (d.directive === "proxy_pass" && d.args[0]) {
        // proxy_pass http://backend; → backend
        const m = d.args[0].match(/^https?:\/\/([^/;]+)/);
        if (m) names.push(m[1]);
      }
      if (d.block) walk(d.block);
    }
  };
  walk(server.block || []);
  return names;
}

function toFlow(
  dirs: Directive[],
  matchedPath?: NodePath | null
): { nodes: Node[]; edges: Edge[] } {
  const blocks = topBlocks(dirs);
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 按类型分列：upstream 右列，server 左列，其它块中列
  const upstreams = blocks.filter((b) => b.kind === "upstream");
  const servers = blocks.filter((b) => b.kind === "server");
  const others = blocks.filter((b) => b.kind !== "upstream" && b.kind !== "server");

  // upstream 名 → nodeId
  const upstreamId = new Map<string, string>();

  upstreams.forEach((b, i) => {
    const id = "n-" + b.path.join("-");
    const name = b.node.args[0] || "upstream";
    upstreamId.set(name, id);
    nodes.push({
      id,
      type: "blockNode",
      position: { x: 680, y: 40 + i * 130 },
      data: {
        kind: "upstream",
        title: `upstream ${name}`,
        childCount: (b.node.block || []).length,
        matched: samePath(matchedPath, b.path),
        path: b.path,
      },
    });
  });

  servers.forEach((b, i) => {
    const id = "n-" + b.path.join("-");
    const s = serverSummary(b.node);
    nodes.push({
      id,
      type: "blockNode",
      position: { x: 80, y: 40 + i * 150 },
      data: {
        kind: "server",
        title: s.serverName ? `server ${s.serverName}` : "server",
        subtitle: s.listen ? `listen ${s.listen}` : undefined,
        childCount: (b.node.block || []).length,
        matched: samePath(matchedPath, b.path),
        path: b.path,
      },
    });
    // server → upstream 连线
    for (const up of referencedUpstreams(b.node)) {
      const targetId = upstreamId.get(up);
      if (targetId) {
        edges.push({
          id: `${id}-${targetId}`,
          source: id,
          target: targetId,
          type: "smoothstep",
          animated: true,
        });
      }
    }
  });

  others.forEach((b, i) => {
    const id = "n-" + b.path.join("-");
    nodes.push({
      id,
      type: "blockNode",
      position: { x: 380, y: 40 + i * 110 },
      data: {
        kind: b.kind,
        title: b.title,
        childCount: (b.node.block || []).length,
        matched: samePath(matchedPath, b.path),
        path: b.path,
      },
    });
  });

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
