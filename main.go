package main

import (
	"context"
	"errors"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"nginx-admin/internal/agentclient"
	"nginx-admin/internal/bootstrap"
	"nginx-admin/internal/config"
	"nginx-admin/internal/httpapi"
	"nginx-admin/internal/store"
	"nginx-admin/web"
)

func main() {
	cfgPath := flag.String("config", "./config.yaml", "配置文件路径")
	showVersion := flag.Bool("version", false, "打印版本并退出")
	flag.Parse()

	if *showVersion {
		log.Printf("nginx-admin %s", httpapi.Version)
		return
	}

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}

	st, err := store.Open(cfg.Database.DSN)
	if err != nil {
		log.Fatalf("初始化数据库失败: %v", err)
	}
	if err := bootstrap.EnsureDefaultAdmin(st, cfg.Auth); err != nil {
		log.Fatalf("初始化默认管理员失败: %v", err)
	}

	agents, err := agentclient.New(cfg.Agent)
	if err != nil {
		log.Fatalf("初始化 Agent 客户端失败: %v", err)
	}
	defer agents.Close()

	// 解析嵌入的前端资源；未构建则为 nil，走占位页。
	var webFS fs.FS
	if f, ok := web.DistFS(); ok {
		webFS = f
	}

	srv := httpapi.NewServer(cfg, st, agents, webFS)
	httpServer := &http.Server{Addr: cfg.HTTP.Listen, Handler: srv.Router()}

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		log.Printf("收到退出信号，正在关闭...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(ctx)
	}()

	var serveErr error
	if cfg.HTTP.TLSCert != "" && cfg.HTTP.TLSKey != "" {
		log.Printf("nginx-admin %s 启动: 监听 %s [HTTPS]", httpapi.Version, cfg.HTTP.Listen)
		serveErr = httpServer.ListenAndServeTLS(cfg.HTTP.TLSCert, cfg.HTTP.TLSKey)
	} else {
		log.Printf("nginx-admin %s 启动: 监听 %s [HTTP]", httpapi.Version, cfg.HTTP.Listen)
		serveErr = httpServer.ListenAndServe()
	}
	if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
		log.Fatalf("HTTP 服务退出: %v", serveErr)
	}
}
