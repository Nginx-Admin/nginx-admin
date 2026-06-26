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
import type { ParsedConfig } from "./nginxParser";
import type { Selection } from "./PropertyPanel";

interface Props {
  parsed: ParsedConfig;
  selection: Selection;
  onSelect: (s: Selection) => void;
  matchedLocationId?: string | null;
}

// 把 ParsedConfig 投影为 React Flow 的 nodes/edges。
function toFlow(
  parsed: ParsedConfig,
  matchedLocationId?: string | null
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // upstream 放在右侧一列
  parsed.upstreams.forEach((u, i) => {
    nodes.push({
      id: u.id,
      type: "upstreamNode",
      position: { x: 640, y: 40 + i * 120 },
      data: { name: u.data.name, method: u.data.method, count: u.data.servers.length },
    });
  });

  let serverY = 40;
  parsed.servers.forEach((s) => {
    nodes.push({
      id: s.id,
      type: "serverNode",
      position: { x: 60, y: serverY },
      data: { serverName: s.data.serverName, listen: s.data.listen, ssl: s.data.ssl },
    });
    const locStartY = serverY;
    s.locations.forEach((loc, li) => {
      const locId = loc.id;
      nodes.push({
        id: locId,
        type: "locationNode",
        position: { x: 340, y: locStartY + li * 110 },
        data: {
          path: loc.data.path,
          modifier: loc.data.modifier,
          proxyPass: loc.data.proxyPass,
          matched: matchedLocationId === locId,
        },
      });
      edges.push({
        id: `${s.id}-${locId}`,
        source: s.id,
        target: locId,
        type: "smoothstep",
      });
      // location → upstream（若 proxy_pass 指向某 upstream 名）
      const pp = loc.data.proxyPass;
      const target = parsed.upstreams.find(
        (u) => pp.includes("://" + u.data.name) || pp.endsWith("/" + u.data.name)
      );
      if (target) {
        edges.push({
          id: `${locId}-${target.id}`,
          source: locId,
          target: target.id,
          type: "smoothstep",
          animated: true,
        });
      }
    });
    const used = Math.max(1, s.locations.length);
    serverY += used * 110 + 60;
  });

  // server → server 的 "HTTPS 跳转" 连线（启发式）：
  // 若某 server 监听 80（非 ssl）且块内有 return 30x https://...，
  // 连到 server_name 相同、且监听 443/ssl 的 server。
  const redirectsToHttps = (s: ParsedConfig["servers"][number]) => {
    const listen = s.data.listen;
    const isHttp = /\b80\b/.test(listen) && !s.data.ssl;
    const hasHttpsRedirect = /return\s+30[12]\s+https:\/\//i.test(
      s.data.extraDirectives
    );
    return isHttp && hasHttpsRedirect;
  };
  const isHttpsServer = (s: ParsedConfig["servers"][number]) =>
    s.data.ssl || /\b443\b/.test(s.data.listen);
  const sameName = (a: string, b: string) => {
    // server_name 可能含多个名字，取交集即可
    const setA = new Set(a.split(/\s+/).filter(Boolean));
    return b.split(/\s+/).some((n) => n && setA.has(n));
  };

  for (const src of parsed.servers) {
    if (!redirectsToHttps(src)) continue;
    const target = parsed.servers.find(
      (t) =>
        t.id !== src.id &&
        isHttpsServer(t) &&
        sameName(src.data.serverName, t.data.serverName)
    );
    if (target) {
      edges.push({
        id: `redirect-${src.id}-${target.id}`,
        source: src.id,
        sourceHandle: "redirect-out",
        target: target.id,
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
  parsed,
  selection,
  onSelect,
  matchedLocationId,
}: Props) {
  const { nodes, edges } = useMemo(
    () => toFlow(parsed, matchedLocationId),
    [parsed, matchedLocationId]
  );

  // 用受控选中态高亮
  const styledNodes = nodes.map((n) => ({
    ...n,
    selected:
      (selection?.kind === "server" && selection.serverId === n.id) ||
      (selection?.kind === "location" && selection.locationId === n.id) ||
      (selection?.kind === "upstream" && selection.upstreamId === n.id),
  }));

  const handleNodeClick = (_: unknown, node: Node) => {
    if (node.type === "serverNode") {
      onSelect({ kind: "server", serverId: node.id });
    } else if (node.type === "upstreamNode") {
      onSelect({ kind: "upstream", upstreamId: node.id });
    } else if (node.type === "locationNode") {
      const owner = parsed.servers.find((s) =>
        s.locations.some((l) => l.id === node.id)
      );
      if (owner)
        onSelect({
          kind: "location",
          serverId: owner.id,
          locationId: node.id,
        });
    }
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
