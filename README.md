# nginx-admin

Nginx 可视化管理平台的**中心控制台**（Web 端）。单 Go 二进制，内置前端（`web/dist` 经 `go:embed`），提供用户认证、RBAC、服务器（Agent）管理、配置浏览/编辑、语法检测、reload、备份/回滚与操作审计。通过 gRPC（可选 mTLS）调度各台 [nginx-agent](https://github.com/Nginx-Admin/nginx-agent)。

> 配套节点代理：[nginx-agent](https://github.com/Nginx-Admin/nginx-agent)（每台 nginx 主机部署一个）。  
> 详细部署步骤见 [deploy/README.md](deploy/README.md)。  
> 当前版本：**v0.13.0**（删除子配置需 Agent **v0.5.0+**）。

## 架构定位

```
浏览器 ──HTTP/HTTPS──► nginx-admin (:8080)
                              │
                              ├── PostgreSQL（用户/服务器/审计/配置索引）
                              │
                              └── gRPC (mTLS) ──► nginx-agent (:7443) × N
                                                        │
                                                   本机 nginx
```

- **单点部署**：全平台只需一个 nginx-admin；每台 nginx 主机部署一个 nginx-agent。
- **连接方向**：中心主动连接 Agent，Agent 地址在「服务器管理」中登记（`host:7443`）。
- **前端路由**：Hash 模式（`http://host:8080/#/servers/...`），便于静态托管。

## 功能概览

| 模块 | 说明 |
|------|------|
| 认证 | JWT 登录；argon2id 密码哈希；连续失败锁定（IP 维度） |
| RBAC | `viewer` 只读 / `editor` 编辑与 reload / `admin` 服务器管理 |
| 服务器管理 | 增删改查 Agent 连接；纳管前测试连通；列表批量刷新状态；导出/导入 JSON 便于迁移 |
| 用户管理 | admin 在 Web 端增删用户、分配角色、禁用账号 |
| 状态监控 | 实时拉取 Agent 状态；数据库缓存快照，详情页秒显后后台刷新 |
| 配置发现 | 触发 Agent 扫描；索引 checksum；按主配置/子配置分组展示 |
| 配置编辑 | **画布模式**（React Flow 节点化）+ **源码模式**（语法高亮）；流量模拟、变更对比 |
| 精确解析 | 后端 [nginx-go-crossplane](https://github.com/nginxinc/nginx-go-crossplane) 解析/回写，注释与复杂指令保真 |
| 安全闭环 | 写入/删除走 Agent：快照 → 变更 → `nginx -t` → reload；失败自动回滚 |
| 备份/回滚 | Agent 本地快照列表与回滚；编辑器内一键回滚 |
| 外观 | 浅色/深色主题、字号缩放（浏览器 localStorage） |
| 操作审计 | 登录、配置保存、reload、回滚等操作留痕 |

## Web 页面

| 路由 | 页面 | 权限 |
|------|------|------|
| `#/login` | 登录 | 公开 |
| `#/` | 服务器列表 | 已登录 |
| `#/servers/:id` | 服务器详情（PID、站点名、状态、配置列表、发现、新建/删除子配置） | 已登录 |
| `#/servers/:id/edit?path=` | 配置编辑器（画布/源码、Agent 快照回滚） | editor+ |
| `#/audit` | 操作审计（用户名/服务器名、搜索） | 已登录 |
| `#/users` | 用户管理（增删改、角色、禁用） | admin |
| `#/settings` | 修改密码、界面外观与**深色主题** | 已登录 |

## 目录结构

```
nginx-admin/
├── api/proto/agent.proto         # gRPC 接口（与 nginx-agent 同步）
├── cmd/nginx-admin/main.go       # 程序入口（-config / -version）
├── internal/
│   ├── config/                   # 配置加载
│   ├── pb/                       # protoc 生成代码
│   ├── model/                    # GORM 模型 + 自动迁移
│   ├── store/                    # 数据访问（PostgreSQL）
│   ├── auth/                     # argon2id + JWT
│   ├── agentclient/              # Agent gRPC 客户端（mTLS）
│   ├── bootstrap/                # 首次启动创建默认 admin
│   ├── nginxconf/                # crossplane 解析/回写
│   └── httpapi/                  # Gin HTTP 服务
│       ├── server.go             # 路由注册 + 前端挂载
│       ├── middleware.go
│       ├── helpers.go
│       ├── handlers_auth.go
│       ├── handlers_users.go
│       ├── handlers_servers.go
│       ├── handlers_upstreams.go
│       ├── handlers_agent_config.go
│       ├── handlers_backups.go
│       ├── handlers_audit.go
│       ├── handlers_nginx_parse.go
│       └── version.go
├── web/                          # 前端（React 18 + TypeScript + Vite + Tailwind）
│   ├── src/
│   │   ├── app/routes.tsx        # 路由定义
│   │   ├── pages/                # 页面
│   │   ├── canvas/               # 配置画布
│   │   ├── components/           # 通用组件
│   │   ├── api/                  # REST 客户端
│   │   ├── auth/ / settings/     # Context
│   │   └── utils/
│   ├── dist/                     # 构建产物（go:embed 内嵌）
│   └── embed.go
├── configs/
│   └── config.example.yaml       # 配置示例
├── deploy/
│   ├── nginx-admin.service
│   ├── install.sh
│   └── README.md
├── config.yaml                   # 本地开发配置
└── Makefile
```

## 依赖与前置

- **PostgreSQL**（DSN 配在 `config.yaml` 的 `database.dsn`）。
- 后端：Go 1.26.2、Gin + GORM + gRPC + crossplane。
- 前端构建：Node 18+ / npm。

## 快速开始

```bash
# 1) 构建前端（产物输出到 web/dist，供 Go 内嵌）
cd web && npm install && npm run build && cd ..

# 2) 编译（含前端 embed）
make build

# 或分步：
# cd web && npm install && npm run build && cd ..
# go build -o nginx-admin ./cmd/nginx-admin

# 3) 准备 PostgreSQL，填好 config.yaml 的 database.dsn

# 4) 启动（首次自动建表 + 创建默认管理员 admin）
./nginx-admin -config ./config.yaml
```

浏览器访问 `http://<host>:8080`，默认管理员 `admin` / 配置项 `auth.default_admin_password`（默认 `admin`，**登录后请立即修改**）。

> 未构建前端时，后端仍可启动：根路径返回占位页，API 正常可用。

## 部署（systemd）

```bash
install -D nginx-admin            /data/nginx-admin/nginx-admin
install -D config.yaml            /data/nginx-admin/config.yaml
install -D deploy/nginx-admin.service /usr/lib/systemd/system/nginx-admin.service

systemctl daemon-reload
systemctl enable --now nginx-admin
journalctl -u nginx-admin -f
```

详见 [deploy/README.md](deploy/README.md)（含 PostgreSQL 初始化 SQL）。

## 配置要点（config.yaml）

```yaml
http:
  listen: "0.0.0.0:8080"
  # 生产 HTTPS：
  # tls_cert: /data/nginx-admin/tls/server.crt
  # tls_key:  /data/nginx-admin/tls/server.key

database:
  dsn: "host=127.0.0.1 port=5432 user=nginx_admin password=xxx dbname=nginx_admin sslmode=disable TimeZone=Asia/Shanghai"

auth:
  jwt_secret: "please-change-this-to-a-long-random-secret"
  token_ttl_hours: 24
  max_login_fails: 5            # 同 IP 连续失败阈值
  lock_minutes: 30              # 锁定时长
  default_admin_password: "admin"

agent:
  tls_enabled: false            # 连接 Agent 是否 mTLS（生产开启）
  dial_timeout_seconds: 15
```

## REST API

### 公开

```
GET  /api/health                       # 健康检查（含 version）
POST /api/auth/login                   # 登录，返回 JWT
```

### 需登录（Bearer Token）

```
GET  /api/auth/me
POST /api/auth/change-password

GET  /api/users                       # 用户列表（admin）
POST /api/users                       # 新增用户（admin）
PUT  /api/users/:id                   # 更新角色/禁用/密码（admin）
DELETE /api/users/:id                 # 删除用户（admin）

GET  /api/servers                      # 服务器列表
POST /api/servers/test-connection      # 测试 Agent 连通（admin，纳管前）
POST /api/servers                      # 新增（admin）
POST /api/servers/export               # 批量导出（admin，body: { ids? }，空则全部）
POST /api/servers/import               # 批量导入（admin，on_conflict: skip|update）
GET  /api/servers/:id/export           # 导出单个服务（admin，迁移用 JSON）
GET  /api/servers/:id
PUT  /api/servers/:id                  # 更新名称/地址/标签（admin）
DELETE /api/servers/:id                # 删除（admin）
GET  /api/servers/:id/status           # 实时状态（连 Agent）
GET  /api/servers/:id/status/cached    # 缓存状态（秒返回，不打 Agent）
POST /api/servers/:id/discover         # 配置发现（editor）

GET  /api/servers/:id/configs          # 配置文件列表
GET  /api/servers/:id/upstreams        # 全局 upstream 汇总（跨文件，供画布连线）
GET  /api/servers/:id/upstream-refs    # upstream 反向引用（谁用了某 upstream）
GET  /api/servers/:id/config?path=     # 读取配置
PUT  /api/servers/:id/config           # 写入（editor，走 Agent 安全闭环 + 乐观锁）
DELETE /api/servers/:id/config?path=   # 删除子配置（editor，走 Agent 安全闭环）
POST /api/servers/:id/test             # nginx -t（editor）
POST /api/servers/:id/reload           # reload（editor）

POST /api/nginx/parse                  # crossplane 解析配置文本 → 指令树
POST /api/nginx/build                  # 指令树 → 配置文本

GET  /api/servers/:id/backups?path=    # Agent 本地快照列表
POST /api/servers/:id/rollback         # 回滚到 Agent 快照（editor）

GET  /api/audit                        # 操作审计（最近 200 条）
```

## 角色（RBAC）

| 角色 | 权限 |
|------|------|
| `viewer` | 查看服务器、状态、配置、备份、审计 |
| `editor` | 在 viewer 基础上：发现、编辑/删除配置、test、reload、回滚 |
| `admin` | 在 editor 基础上：服务器的增删改、用户管理 |

用户管理在 Web「用户管理」页完成；首次启动仍会自动创建 `admin` 账号。

## 配置编辑器

### 画布模式

- 基于 **React Flow**，将 server / location / upstream 节点化展示；
- 后端 **crossplane** 解析/回写，注释与 map 等复杂指令保真往返；
- 跨文件 upstream 自动连线（`listUpstreams` 汇总全局 upstream）；
- HTTP→HTTPS 跳转虚线；
- 画布/属性面板支持快捷添加 Server、Location、Upstream 块；
- **流量模拟**：按 Host + URI 匹配 location，高亮对应节点；
- 编辑器顶栏「快照」可查看 Agent 本地备份并一键回滚；
- **源码模式**：nginx 语法高亮、行号；
- **对比变更**：保存前 diff（相对上次加载）；
- **仅测试**：`nginx -t` 不写入变更；
- **未保存提示**：有未保存变更时离开页面会二次确认。

### 源码模式

- 直接编辑配置文本，适合画布未建模的复杂指令；
- 与画布共用同一套保存流程与安全闭环。

### 保存流程

```
PUT /config（带 expected_checksum 乐观锁）
    ↓
Agent：快照 → 写入 → nginx -t → reload
    ↓
失败：Agent 自动回滚，中心返回 error
成功：返回 new_checksum
```

### 删除子配置

```
DELETE /config?path=（editor）
    ↓
Agent：快照 → 删除 → nginx -t → reload
    ↓
失败：Agent 自动恢复文件，中心返回 error
成功：从配置列表移除
```

> 需 Agent **v0.5.0+** 提供 `DeleteConfig` RPC；主配置文件默认不可删。

## 备份策略

备份与回滚**仅使用 Agent 本地快照**（中心不再保存配置副本）：

- 每次写入/删除前由 Agent 自动创建快照（保留份数由 Agent 端 `backup.retain` 控制，默认 50）
- Admin 通过 `/api/servers/:id/backups` 列出 Agent 快照，通过 `/rollback` 回滚
- 回滚前 Agent 会再快照一次当前内容，便于撤销回滚

> 调整保留份数请修改各 Agent 的 `config.yaml` 中 `backup.retain` 并重启 Agent。

## 版本配套

| 功能 | nginx-admin | nginx-agent |
|------|-------------|-------------|
| 基础纳管、编辑、reload | v0.12.0+ | v0.4.0+ |
| 删除子配置 | **v0.13.0+** | **v0.5.0+** |

升级时建议两边同步更新；仅升 Admin 而 Agent 过旧时，详情页「删除」会报错。

## 开发

```bash
make proto       # 重新生成 protobuf
make frontend    # 构建 web/dist
make build       # 构建 bin/nginx-admin
make run
make vet

cd web && npm run dev   # 前端 :5173，/api 代理到 :8080
```

> 后端：gin v1.10.0、gorm v1.25.12、grpc v1.67.1、crossplane v0.4.89  
> 前端：react 18、@xyflow/react、vite、tailwindcss

## 许可证

MIT
