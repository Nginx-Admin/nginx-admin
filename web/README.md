# nginx-admin 前端（React + React Flow）

中心控制台的 Web 前端。技术栈：React 18 + TypeScript + Vite + Tailwind CSS，
画布用 React Flow（`@xyflow/react`）。构建产物输出到 `dist/`，由 Go 通过 `//go:embed` 内嵌进 `nginx-admin` 二进制。

## 目录

```
web/
├── index.html
├── package.json / vite.config.ts / tsconfig.json / tailwind.config.js / postcss.config.js
├── embed.go
├── dist/
└── src/
    ├── main.tsx
    ├── index.css
    ├── api/client.ts
    ├── auth/AuthContext.tsx
    ├── components/         # Layout、SourceEditor、DiffView、ui
    ├── pages/              # Login / Servers / ServerDetail / ConfigEditor / Audit / Users / Settings
    ├── utils/diff.ts       # 行级 diff
    └── canvas/
        ├── directives.ts   # crossplane 指令树辅助
        ├── matcher.ts      # 流量模拟（location 匹配）
        ├── nodes.tsx
        ├── Canvas.tsx
        └── PropertyPanel.tsx
```

## 开发与构建

```bash
cd web
npm install
npm run dev          # :5173，/api 代理到 :8080
npm run build
```

## 画布与编辑器

- **解析/回写**：后端 crossplane（`POST /api/nginx/parse`、`/api/nginx/build`）
- **双模式**：画布 + 源码（语法高亮、行号）
- **流量模拟**：Host + URI → 匹配 location，画布高亮
- **变更对比**：相对上次加载的行级 diff
- **快照/回滚**：Agent 本地备份
- **删除配置**：详情页子配置「删除」（需 Agent 支持 `DeleteConfig`）
- **主题**：设置页切换浅色/深色

## 页面路由

| 路由 | 功能 |
|------|------|
| `#/login` | 登录 |
| `#/` | 服务列表 |
| `#/servers/:id` | 详情（站点名、PID、删除子配置） |
| `#/servers/:id/edit?path=` | 配置编辑器 |
| `#/audit` | 操作审计 |
| `#/users` | 用户管理（admin） |
| `#/settings` | 改密、备份策略、外观与主题 |
