# nginx-admin

Nginx 可视化管理平台的**中心控制台**（Web 端）。单 Go 二进制，内置前端（`web/dist` 经 `go:embed`），
提供用户认证、RBAC、服务器（Agent）管理、配置浏览/编辑、语法检测、reload、备份/回滚、操作审计。
通过 gRPC（over mTLS）调度各台 `nginx-agent`。

前端为 **React 18 + TypeScript + Vite + Tailwind**，配置编辑器采用 **React Flow 节点式画布**
（server / location / upstream 节点化建模，支持画布与源码双模式、流量模拟、HTTPS 跳转连线）。

> 配套节点代理：[nginx-agent](https://github.com/Nginx-Admin/nginx-agent)（每台 nginx 主机部署一个）。

## 目录结构

```
nginx-admin/
├── api/proto/agent.proto         # gRPC 接口定义（与 nginx-agent 同步）
├── cmd/nginx-admin/main.go       # 程序入口
├── internal/
│   ├── config/                   # 配置加载（config.yaml）
│   ├── pb/                       # protoc 生成代码（gRPC client）
│   ├── model/                    # GORM 模型 + 自动迁移
│   ├── store/                    # 数据访问层（GORM/PostgreSQL，连接池 + 备份保留=5）
│   ├── auth/                     # argon2id 密码哈希 + JWT
│   ├── agentclient/              # 到各 Agent 的 gRPC 客户端（连接池 + mTLS）
│   ├── bootstrap/                # 首次启动创建默认管理员
│   └── httpapi/                  # Gin HTTP 服务：路由、中间件、handlers
├── web/                          # 前端工程（React + React Flow）
│   ├── src/                      # 源码：pages / canvas / api / auth / components
│   ├── dist/                     # 构建产物（经 embed 内嵌；未构建时为占位页）
│   ├── embed.go                  # go:embed all:dist
│   └── package.json
├── deploy/
│   └── nginx-admin.service       # systemd 单元
├── config.yaml                   # 配置示例
└── Makefile
```

## 依赖与前置

- **PostgreSQL**（连接串配在 `config.yaml` 的 `database.dsn`）。
- 后端：Go 1.26.2、Gin + GORM + gRPC。
- 前端构建：Node 18+ / npm。

## 快速开始

```bash
# 1) 构建前端（产物输出到 web/dist，供 Go 内嵌）
cd web && npm install && npm run build && cd ..

# 2) 编译后端（前端随之 embed 进二进制）
go build -o nginx-admin ./cmd/nginx-admin

# 3) 准备 PostgreSQL，填好 config.yaml 的 database.dsn

# 4) 启动（首次自动建表 + 创建默认管理员 admin）
./nginx-admin -config ./config.yaml
```

启动后浏览器访问 `http://<host>:8080`，默认管理员 `admin` /
配置项 `auth.default_admin_password`（默认 `admin`，**登录后请立即修改**）。

> 未构建前端时，后端仍可启动，访问根路径返回占位页，API 正常可用。

## 部署（systemd）

二进制、配置、前端已内嵌于一个文件，部署到 `/data/nginx-admin/`：

```bash
install -D nginx-admin            /data/nginx-admin/nginx-admin
install -D config.yaml            /data/nginx-admin/config.yaml
install -D deploy/nginx-admin.service /usr/lib/systemd/system/nginx-admin.service

systemctl daemon-reload
systemctl enable --now nginx-admin
systemctl status nginx-admin
journalctl -u nginx-admin -f      # 查看日志
```

> `nginx-admin.service` 内含 `After=postgresql.service`：若 PostgreSQL 同机部署，会等库就绪再启动。
> 跨机部署 PG 时，请确保网络/防火墙放行 5432，并将 DSN 指向正确地址。

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

## 节点式画布

配置编辑器提供两种模式，共用同一条"`nginx -t` 校验 → reload → 失败回滚"安全闭环：

- **画布模式**：server / location / upstream 节点化展示，属性面板编辑常用指令；
  location → upstream 自动连线（依 `proxy_pass`）；HTTP→HTTPS 跳转自动连虚线；内置流量模拟器。
- **源码模式**：直接编辑配置文本，覆盖画布未建模的复杂指令。

> 当前画布解析为前端轻量实现（注释会被丢弃，复杂指令走源码模式）；
> 后续可替换为后端 crossplane 精确解析，画布与面板无需改动。

## 开发

```bash
make proto    # 重新生成 protobuf 代码
make build    # 构建到 bin/nginx-admin
make run
make vet

cd web && npm run dev   # 前端开发服务器（:5173，/api 代理到 :8080）
```

> 后端 Go 1.26.2；依赖：gin v1.10.0、gorm v1.25.12、grpc v1.67.1 等。
> 前端：react 18、@xyflow/react（React Flow）、vite、tailwindcss。

## 许可证

MIT

