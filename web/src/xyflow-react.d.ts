// @xyflow/react 类型兜底声明。
//
// 背景：某些 @xyflow/react 版本 + tsc 的 moduleResolution 组合下，
// 该包的类型入口（exports 字段里的 types）可能无法被解析，报 TS7016。
// 这里显式声明我们用到的导出，保证构建通过且保留基本类型。
//
// 若你本地的 @xyflow/react 已能正常解析类型（npm run build 不再报 TS7016），
// 可以删除本文件以使用官方更精确的类型。

declare module "@xyflow/react" {
  import type { ComponentType, ReactNode, CSSProperties, HTMLAttributes } from "react";

  export interface XYPosition {
    x: number;
    y: number;
  }

  export interface Node<T = Record<string, unknown>> {
    id: string;
    position: XYPosition;
    data: T;
    type?: string;
    selected?: boolean;
    [key: string]: unknown;
  }

  export interface Edge {
    id: string;
    source: string;
    target: string;
    type?: string;
    animated?: boolean;
    [key: string]: unknown;
  }

  export interface NodeProps<T = Record<string, unknown>> {
    id: string;
    data: T;
    selected?: boolean;
    type?: string;
    [key: string]: unknown;
  }

  export const Position: {
    Top: "top";
    Right: "right";
    Bottom: "bottom";
    Left: "left";
  };
  export type Position = "top" | "right" | "bottom" | "left";

  export interface HandleProps {
    type: "source" | "target";
    position: Position;
    id?: string;
    style?: CSSProperties;
    [key: string]: unknown;
  }
  export const Handle: ComponentType<HandleProps>;

  export interface ReactFlowProps {
    nodes?: Node[];
    edges?: Edge[];
    nodeTypes?: Record<string, ComponentType<NodeProps<any>>>;
    onNodeClick?: (event: unknown, node: Node) => void;
    onPaneClick?: (event: unknown) => void;
    fitView?: boolean;
    proOptions?: { hideAttribution?: boolean };
    children?: ReactNode;
    [key: string]: unknown;
  }
  export const ReactFlow: ComponentType<ReactFlowProps>;

  export const ReactFlowProvider: ComponentType<{ children?: ReactNode }>;
  export const Background: ComponentType<HTMLAttributes<HTMLDivElement> & { [key: string]: unknown }>;
  export const Controls: ComponentType<{ [key: string]: unknown }>;
  export const MiniMap: ComponentType<{ pannable?: boolean; zoomable?: boolean; [key: string]: unknown }>;
}
