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
    ├── pages/              # Login / Servers / ServerDetail / ConfigEditor / Audit / Users / Settings
    └── canvas/             # 节点式画布核心
        ├── directives.ts   # crossplane 指令树辅助（增删改、块模板）
        ├── nodes.tsx       # Server/Location/Upstream 自定义节点
        ├── Canvas.tsx      # 指令树 → React Flow nodes/edges
        └── PropertyPanel.tsx # 选中块的属性编辑 + 快捷添加 server/location/upstream
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

## 画布说明

- **解析/回写**：走后端 crossplane 接口（`POST /api/nginx/parse`、`/api/nginx/build`），注释与复杂指令保真。
- **双模式**：画布可视化 + 源码直接编辑，保存时统一走 Agent 安全闭环（快照 → 写入 → nginx -t → reload）。
- **快捷添块**：画布左上角可添加顶层 Server/Upstream；属性面板内可按块类型添加 Server/Location/Upstream。
- **快照**：编辑器顶栏「快照」可查看 Agent 本地备份并一键回滚。

## 功能对应页面

| 路由 | 功能 |
|------|------|
| `#/login` | 登录 |
| `#/` | 服务器列表（分组、刷新全部状态、纳管时测试 Agent 连通） |
| `#/servers/:id` | 详情（状态、配置发现、nginx -t、reload、新建子配置） |
| `#/servers/:id/edit?path=` | 配置编辑器（画布/源码、快照回滚） |
| `#/audit` | 操作审计（用户名/服务器名、搜索） |
| `#/users` | 用户管理（admin） |
| `#/settings` | 改密码、中心备份策略（admin）、界面外观 |
