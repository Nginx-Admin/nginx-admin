# nginx-admin

Nginx 可视化管理平台的**中心控制台**（Web 端）。单 Go 二进制，内置前端（`web/dist` 经 `go:embed`），
提供用户认证、RBAC、服务器（Agent）管理、配置浏览/编辑、语法检测、reload、备份/回滚、操作审计。
通过 gRPC（over mTLS）调度各台 `nginx-agent`。

## 目录结构

```
nginx-admin/
├── api/proto/agent.proto         # gRPC 接口定义（与 nginx-agent 同步）
├── cmd/nginx-admin/main.go       # 程序入口
├── internal/
│   ├── config/                   # 配置加载（config.yaml）
│   ├── pb/                       # protoc 生成代码（gRPC client）
│   ├── model/                    # GORM 模型 + 自动迁移
│   ├── store/                    # 数据访问层（GORM/PostgreSQL，含备份保留=5）
│   ├── auth/                     # argon2id 密码哈希 + JWT
│   ├── agentclient/              # 到各 Agent 的 gRPC 客户端（连接池 + mTLS）
│   ├── bootstrap/                # 首次启动创建默认管理员
│   └── httpapi/                  # Gin HTTP 服务：路由、中间件、handlers
├── web/                          # 前端（dist 经 embed 内嵌）
│   ├── embed.go
│   └── dist/                     # 前端构建产物（占位，待 React 工程接入）
├── config.yaml                   # 配置示例
└── Makefile
```

## 依赖与前置

- PostgreSQL（连接串配在 `config.yaml` 的 `database.dsn`）。
- 后端：Gin + GORM + gRPC。

## 运行

```bash
# 1) 准备 PostgreSQL，填好 config.yaml 的 database.dsn
# 2) 启动（首次会自动建表 + 创建默认管理员 admin）
./nginx-admin -config ./config.yaml
```

默认管理员：`admin` / 配置项 `auth.default_admin_password`（默认 `admin`，登录后请立即修改）。

## 主要 API

```
POST   /api/auth/login                 # 登录，返回 JWT
GET    /api/auth/me
POST   /api/auth/change-password

GET    /api/servers                    # 服务器列表
POST   /api/servers                    # 新增（admin）
GET    /api/servers/:id
DELETE /api/servers/:id                # 删除（admin）
GET    /api/servers/:id/status         # 实时状态（连 Agent）
POST   /api/servers/:id/discover       # 配置发现（editor）

GET    /api/servers/:id/configs        # 配置文件列表
GET    /api/servers/:id/config?path=   # 读取配置
PUT    /api/servers/:id/config         # 写入（editor，走安全闭环 + 中心副本）
POST   /api/servers/:id/test           # nginx -t（editor）
POST   /api/servers/:id/reload         # reload（editor）

GET    /api/servers/:id/backups?path=  # 备份（中心副本 + Agent 本地）
POST   /api/servers/:id/rollback       # 回滚（editor）

GET    /api/audit                      # 操作审计
```

## 角色（RBAC）

- `viewer`：只读；`editor`：编辑/reload/回滚；`admin`：用户与服务器管理、全局操作。

## 备份策略

写入配置时，中心会先抓取当前内容存为**中心副本**（容灾），并按 `backup.retain_per_file`（默认 **5**）
保留每个配置文件最近 5 份。Agent 本地另有快照（保留份数由 Agent 端配置控制）。

## 前端

`web/dist` 当前为占位。React + React Flow 前端工程构建后，将产物输出到 `web/dist/`，
重新 `go build` 即随二进制内嵌；未构建时后端返回占位页。

## 开发

```bash
make proto    # 重新生成 protobuf 代码
make build    # 构建到 bin/nginx-admin
make run
make vet
```

> 注：依赖固定在与 Go 1.23 兼容的版本（gin v1.10.0、gorm v1.25.12、grpc v1.67.1 等）。
