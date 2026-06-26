# nginx-admin 前端（React + React Flow）

中心控制台的 Web 前端。技术栈：React 18 + TypeScript + Vite + Tailwind CSS，
画布用 React Flow（`@xyflow/react`）。构建产物输出到 `dist/`，由 Go 通过 `//go:embed` 内嵌进 `nginx-admin` 二进制。

## 目录

```
web/
├── index.html
├── package.json / vite.config.ts / tsconfig.json / tailwind.config.js / postcss.config.js
├── embed.go                # Go 侧：go:embed all:dist
├── dist/                   # 构建产物（占位，build 后覆盖）
└── src/
    ├── main.tsx            # 入口 + 路由（HashRouter）
    ├── index.css           # Tailwind 指令 + 全局样式
    ├── api/client.ts       # 后端 REST API 封装（带 JWT）
    ├── auth/AuthContext.tsx# 登录态 / 路由守卫
    ├── components/         # Layout 侧边栏、通用 UI
    ├── pages/              # Login / Servers / ServerDetail / ConfigEditor / Audit
    └── canvas/             # 节点式画布核心
        ├── nginxParser.ts  # nginx 配置 ↔ 节点模型 双向解析/回写
        ├── nodes.tsx       # Server/Location/Upstream 自定义节点
        ├── Canvas.tsx      # ParsedConfig → React Flow nodes/edges
        ├── PropertyPanel.tsx # 选中节点的属性编辑面板
        └── matcher.ts      # 流量模拟：按 nginx 优先级匹配 location
```

## 开发与构建

```bash
cd web
npm install          # 首次安装依赖
npm run dev          # 开发服务器 :5173，/api 自动代理到后端 :8080
npm run build        # 类型检查 + 构建到 dist/
```

构建完成后回到项目根目录重新编译 Go 即可内嵌前端：

```bash
cd ..
go build -o bin/nginx-admin ./cmd/nginx-admin
```

> 未构建前端时，`dist/` 仅有占位页，后端会返回提示页；不影响后端 API 运行。

## 画布说明（重要）

- **画布是 nginx 配置的可视化投影**：`nginxParser.ts` 把配置文本解析为 server/location/upstream 节点模型，
  保存时再回写为标准配置文本，经后端 `nginx -t` 校验 + reload + 失败自动回滚。
- **已知限制**：当前为前端轻量解析器，对 server/location/upstream 及其常用指令建模；
  其它块/指令作为"原样片段"保留（往返不丢），**注释会被丢弃**。复杂配置请用「源码模式」编辑。
- 设计文档中规划的"后端 crossplane 精确解析"可作为后续增强，替换 `nginxParser.ts` 的解析来源即可，
  画布与属性面板无需改动。

## 功能对应页面

- 登录：`/login`
- 服务器列表 / 新增 / 删除：`/`
- 服务器详情（状态、配置发现、nginx -t、reload）：`/servers/:id`
- 配置编辑器（画布 + 源码双模式 + 流量模拟 + 保存走安全闭环）：`/servers/:id/edit?path=...`
- 操作审计：`/audit`
