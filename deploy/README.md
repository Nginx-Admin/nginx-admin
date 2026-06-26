# nginx-admin 部署（systemd）

中心控制台，**一台**机器部署一个，以 root 运行，连接 PostgreSQL（建议与 PG 同机以降低查询延迟）。

## 文件说明

- `nginx-admin.service` —— systemd unit（含 `After=postgresql.service`）
- `install.sh` —— 安装/更新脚本（目标机 root 执行）

## 部署步骤

### 1. 构建（含前端）

前端要先构建并 embed 进二进制：

```bash
cd nginx-admin/web && npm install && npm run build && cd ..
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o nginx-admin ./cmd/nginx-admin
# ARM64 机器用：GOARCH=arm64
```

### 2. 上传到目标机

```bash
scp nginx-admin config.yaml deploy/nginx-admin.service deploy/install.sh \
    root@目标机:/tmp/nginx-admin-pkg/
```

### 3. 目标机上安装

```bash
ssh root@目标机
cd /tmp/nginx-admin-pkg
# 改 config.yaml：数据库 DSN（同机用 host=127.0.0.1）、jwt_secret、默认管理员密码
sudo bash install.sh
```

脚本会：创建 `/data/nginx-admin/`、安装二进制与配置、注册 systemd 服务、设开机自启并启动。

### 4. 数据库准备（首次）

```sql
CREATE DATABASE nginx_admin;
CREATE USER nginx_admin WITH PASSWORD 'nginx_admin';
GRANT ALL PRIVILEGES ON DATABASE nginx_admin TO nginx_admin;
```

表结构由程序启动时自动迁移。访问 `http://服务器IP:8080`，默认 `admin/admin`（首次登录后改密码）。

## 常用命令

```bash
systemctl status nginx-admin
systemctl restart nginx-admin
journalctl -u nginx-admin -f
```

> 升级：重新构建二进制，重复步骤 2-3。`install.sh` 不会覆盖已存在的 `config.yaml`。
