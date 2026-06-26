// @xyflow/react 类型兜底声明。
//
// 背景：本项目安装到的 @xyflow/react 构建产物缺少 .d.ts 类型声明文件
//（package.json 的 exports 指向 dist/esm/index.d.ts，但该文件实际不存在），
// 导致 TS 报 "Could not find a declaration file for module '@xyflow/react'"。
//
// 这里为项目实际用到的导出提供最小可用的类型声明，保证类型检查通过；
// 运行时仍使用包内真实的 JS 实现。若后续升级到带完整类型的版本，可删除本文件。

declare module "@xyflow/react" {
  import type { ComponentType, CSSProperties, ReactNode } from "react";

  // 节点 / 连线数据模型
  export interface Node<T = Record<string, unknown>> {
    id: string;
    position: { x: number; y: number };
    data: T;
    type?: string;
    selected?: boolean;
    sourcePosition?: Position;
    targetPosition?: Position;
    [key: string]: unknown;
  }

  export interface Edge<T = Record<string, unknown>> {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    type?: string;
    animated?: boolean;
    label?: ReactNode;
    style?: CSSProperties;
    labelStyle?: CSSProperties;
    data?: T;
    [key: string]: unknown;
  }

  // 自定义节点的 props
  export interface NodeProps<T = Record<string, unknown>> {
    id: string;
    data: T;
    selected?: boolean;
    type?: string;
    [key: string]: unknown;
  }

  export enum Position {
    Left = "left",
    Top = "top",
    Right = "right",
    Bottom = "bottom",
  }

  export const Handle: ComponentType<{
    type: "source" | "target";
    position: Position;
    id?: string;
    style?: CSSProperties;
    [key: string]: unknown;
  }>;

  export interface ReactFlowProps {
    nodes?: Node[];
    edges?: Edge[];
    nodeTypes?: Record<string, ComponentType<NodeProps>>;
    onNodeClick?: (event: unknown, node: Node) => void;
    onPaneClick?: (event: unknown) => void;
    fitView?: boolean;
    proOptions?: { hideAttribution?: boolean };
    children?: ReactNode;
    [key: string]: unknown;
  }

  export const ReactFlow: ComponentType<ReactFlowProps>;
  export const ReactFlowProvider: ComponentType<{ children?: ReactNode }>;
  export const Background: ComponentType<Record<string, unknown>>;
  export const Controls: ComponentType<Record<string, unknown>>;
  export const MiniMap: ComponentType<Record<string, unknown>>;
}
