import { useMemo, useState } from "react";
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

  // 反向引用模式：当本文件定义了 upstream 且存在引用数据时，
  // 按「每个 upstream 一组」布局——该 upstream 居右，引用它的 location 居左同高，
  // 形成一束短平连线，清晰对应（解决多 upstream 连线糊成一团的问题）。
  const localUpstreamNames = new Set(model.upstreams.map((u) => u.name));
  const refModeOn =
    model.upstreams.length > 0 &&
    upstreamRefs.some((r) => localUpstreamNames.has(r.upstream));

  if (refModeOn) {
    // 收集每个 upstream 的去重引用方
    const refsByUpstream = new Map<string, UpstreamRef[]>();
    const seen = new Set<string>();
    for (const ref of upstreamRefs) {
      if (!localUpstreamNames.has(ref.upstream)) continue;
      const key = `${ref.logical_path}|${ref.server_name}|${ref.location}|${ref.upstream}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!refsByUpstream.has(ref.upstream)) refsByUpstream.set(ref.upstream, []);
      refsByUpstream.get(ref.upstream)!.push(ref);
    }

    const ROW_H = 96; // 每个引用方行高
    const GROUP_GAP = 64; // 组间距（拉大让分组更分明）
    const UPSTREAM_X = 720; // upstream 列 X（refMode 下拉近，缩短连线跨度）
    const palette = [
      "#0ea5e9",
      "#8b5cf6",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#ec4899",
      "#14b8a6",
      "#6366f1",
    ];
    let cursorY = 40;
    let refIdx = 0;

    model.upstreams.forEach((u, gi) => {
      const refs = refsByUpstream.get(u.name) || [];
      const groupRows = Math.max(1, refs.length);
      const groupH = groupRows * ROW_H;
      const upstreamNodeId = nid(u.path);
      upstreamId.set(u.name, upstreamNodeId);
      const color = palette[gi % palette.length];

      // upstream 节点：放在该组纵向中心
      nodes.push({
        id: upstreamNodeId,
        type: "blockNode",
        position: { x: UPSTREAM_X, y: cursorY + (groupH - 70) / 2 },
        data: {
          kind: "upstream",
          title: `upstream ${u.name}`,
          subtitle: `被 ${refs.length} 处引用`,
          matched: samePath(matchedPath, u.path),
          path: u.path,
          accent: color,
        },
      });

      // 引用方节点：在该组高度区间内逐行排列
      refs.forEach((ref, ri) => {
        const refNodeId = `ref-${refIdx++}`;
        const title = ref.location
          ? `location ${ref.location}`
          : ref.server_name
            ? `server ${ref.server_name}`
            : "引用方";
        // 多行展示：proxy_pass / server / 来源文件，宽度自适应不截断
        const lines = [
          ref.proxy_pass && `proxy_pass ${ref.proxy_pass}`,
          ref.server_name && `server ${ref.server_name}`,
          `来自 ${ref.logical_path}`,
        ].filter(Boolean) as string[];

        nodes.push({
          id: refNodeId,
          type: "locationNode",
          position: { x: 60, y: cursorY + ri * ROW_H },
          data: { kind: "location", title, lines, external: true },
        });
        // 连线风格与 location → upstream 统一（smoothstep + animated）
        edges.push({
          id: `${refNodeId}-${upstreamNodeId}`,
          source: refNodeId,
          target: upstreamNodeId,
          type: "smoothstep",
          animated: true,
        });
      });

      cursorY += groupH + GROUP_GAP;
    });
  } else {
    // 普通模式：upstream 右列依序排列
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
  onSelect,
  matchedPath,
  externalUpstreams,
  upstreamRefs,
}: Props) {
  const { nodes, edges } = useMemo(
    () => toFlow(dirs, matchedPath, externalUpstreams, upstreamRefs),
    [dirs, matchedPath, externalUpstreams, upstreamRefs]
  );

  // hover 高亮：悬停某节点时，只突出与它相连的边，其余淡化
  const [hoverId, setHoverId] = useState<string | null>(null);
  // 选中节点 id：点击即记录，用于画选中边框（自管，稳定不丢）。
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 据 selectedId 给节点设 selected。不依赖 hoverId，hover 不会重建节点、不打断点击。
  const styledNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [nodes, selectedId]
  );

  // 边样式随 hoverId 变化（只影响边，不影响节点点击）。
  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        if (!hoverId) return e;
        const related = e.source === hoverId || e.target === hoverId;
        return {
          ...e,
          style: {
            ...e.style,
            opacity: related ? 1 : 0.12,
            strokeWidth: related ? 2.5 : (e.style?.strokeWidth ?? 1.5),
          },
        };
      }),
    [edges, hoverId]
  );

  const handleNodeClick = (_: unknown, node: Node) => {
    setSelectedId(node.id); // 选中高亮（所有节点都生效，含引用节点）
    const p = (node.data as { path?: NodePath }).path;
    // 有 path（当前文件的真实块）→ 打开右侧编辑面板；
    // 无 path（引用节点 / 外部 upstream，不可编辑）→ 关闭面板，避免残留上一个节点的编辑框。
    onSelect(p ?? null);
  };

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={styledEdges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onNodeMouseEnter={(_: unknown, n: Node) => setHoverId(n.id)}
      onNodeMouseLeave={() => setHoverId(null)}
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
