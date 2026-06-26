#!/usr/bin/env bash
# nginx-admin 安装/更新脚本（在目标服务器上以 root 执行）
# 用法：
#   1. 先把构建好的二进制 nginx-admin 和 config.yaml 放到本脚本同目录
#   2. sudo bash install.sh
set -euo pipefail

INSTALL_DIR=/data/nginx-admin
SERVICE=nginx-admin
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "请用 root 运行：sudo bash install.sh" >&2
  exit 1
fi

echo "==> 创建目录 $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# 二进制：优先用脚本同目录的，其次用上一级（项目根）的
BIN_SRC=""
for c in "$HERE/nginx-admin" "$HERE/../nginx-admin"; do
  if [[ -f "$c" ]]; then BIN_SRC="$c"; break; fi
done
if [[ -z "$BIN_SRC" ]]; then
  echo "未找到 nginx-admin 二进制，请先构建并放到本脚本同目录。" >&2
  echo "构建：CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o nginx-admin ./cmd/nginx-admin" >&2
  exit 1
fi
echo "==> 安装二进制：$BIN_SRC -> $INSTALL_DIR/nginx-admin"
install -m 0755 "$BIN_SRC" "$INSTALL_DIR/nginx-admin"

# 配置：存在则不覆盖（避免覆盖线上配置）
if [[ -f "$INSTALL_DIR/config.yaml" ]]; then
  echo "==> 配置已存在，保留不覆盖：$INSTALL_DIR/config.yaml"
elif [[ -f "$HERE/config.yaml" ]]; then
  echo "==> 安装配置：$INSTALL_DIR/config.yaml"
  install -m 0640 "$HERE/config.yaml" "$INSTALL_DIR/config.yaml"
elif [[ -f "$HERE/../config.yaml" ]]; then
  install -m 0640 "$HERE/../config.yaml" "$INSTALL_DIR/config.yaml"
else
  echo "!! 未找到 config.yaml，请手动放到 $INSTALL_DIR/config.yaml 后再启动" >&2
fi

echo "==> 安装 systemd unit"
install -m 0644 "$HERE/nginx-admin.service" /etc/systemd/system/nginx-admin.service

echo "==> 重载 systemd 并启用开机自启"
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

echo "==> 完成。状态："
systemctl --no-pager status "$SERVICE" || true
echo
echo "查看日志： journalctl -u $SERVICE -f"
