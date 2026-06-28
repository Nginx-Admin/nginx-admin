package httpapi

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"nginx-admin/internal/agentclient"
	"nginx-admin/internal/auth"
	"nginx-admin/internal/config"
	"nginx-admin/internal/store"
)

// Version 是 admin 版本号。
var Version = "0.1.0-dev"

// Server 是 HTTP API 服务器。
type Server struct {
	cfg    config.Config
	store  *store.Store
	jwt    *auth.JWTManager
	agents *agentclient.Client
	webFS  fs.FS // 嵌入的前端静态资源（可为 nil）
}

func NewServer(cfg config.Config, st *store.Store, agents *agentclient.Client, webFS fs.FS) *Server {
	return &Server{
		cfg:    cfg,
		store:  st,
		jwt:    auth.NewJWTManager(cfg.Auth.JWTSecret, cfg.Auth.TokenTTLHours),
		agents: agents,
		webFS:  webFS,
	}
}

// Router 构建 gin 路由。
func (s *Server) Router() *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	api := r.Group("/api")
	{
		api.GET("/health", s.handleHealth)
		api.POST("/auth/login", s.handleLogin)

		authed := api.Group("")
		authed.Use(s.AuthRequired())
		{
			authed.GET("/auth/me", s.handleMe)
			authed.POST("/auth/change-password", s.handleChangePassword)

			// 服务器（Agent）管理
			authed.GET("/servers", s.handleListServers)
			authed.POST("/servers", s.RequireRole("admin"), s.handleCreateServer)
			authed.GET("/servers/:id", s.handleGetServer)
			authed.PUT("/servers/:id", s.RequireRole("admin"), s.handleUpdateServer)
			authed.DELETE("/servers/:id", s.RequireRole("admin"), s.handleDeleteServer)
			authed.GET("/servers/:id/status", s.handleServerStatus)
			authed.GET("/servers/:id/status/cached", s.handleServerStatusCached) // 缓存状态，秒返回
			authed.POST("/servers/:id/discover", s.RequireRole("editor"), s.handleDiscover)

			// 配置
			authed.GET("/servers/:id/configs", s.handleListConfigs)
			authed.GET("/servers/:id/upstreams", s.handleListUpstreams)    // 全局 upstream 汇总（跨文件）
			authed.GET("/servers/:id/upstream-refs", s.handleUpstreamRefs) // upstream 反向引用（谁用了）
			authed.GET("/servers/:id/config", s.handleReadConfig)          // ?path=
			authed.PUT("/servers/:id/config", s.RequireRole("editor"), s.handleWriteConfig)
			authed.POST("/servers/:id/test", s.RequireRole("editor"), s.handleTest)
			authed.POST("/servers/:id/reload", s.RequireRole("editor"), s.handleReload)

			// nginx 配置精确解析/回写（crossplane，供画布使用）
			authed.POST("/nginx/parse", s.handleParseConfig)
			authed.POST("/nginx/build", s.handleBuildConfig)

			// 备份/回滚
			authed.GET("/servers/:id/backups", s.handleListBackups) // ?path=
			authed.POST("/servers/:id/rollback", s.RequireRole("editor"), s.handleRollback)

			// 审计
			authed.GET("/audit", s.handleListAudit)
		}
	}

	s.mountFrontend(r)
	return r
}

// mountFrontend 挂载嵌入的前端（若有），否则提供占位页。
func (s *Server) mountFrontend(r *gin.Engine) {
	if s.webFS == nil {
		r.GET("/", func(c *gin.Context) {
			c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(placeholderHTML))
		})
		return
	}

	// 预读 index.html 内容，SPA fallback 时直接写出，
	// 避免 http.FileServer 对 "index.html" 的自动 301 重定向导致死循环。
	indexHTML, _ := fs.ReadFile(s.webFS, "index.html")

	// 静态资源目录 /assets/*
	r.StaticFS("/assets", http.FS(mustSub(s.webFS, "assets")))

	// 根路径与所有未命中 API 的路由交给前端 index.html（SPA）。
	serveIndex := func(c *gin.Context) {
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
	}
	r.GET("/", serveIndex)
	r.NoRoute(func(c *gin.Context) {
		// API 路径未命中应返回 404，而不是塞给前端，避免吞掉接口错误。
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		serveIndex(c)
	})
}

func mustSub(f fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(f, dir)
	if err != nil {
		return f
	}
	return sub
}

const placeholderHTML = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>nginx-admin</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:60px auto;padding:0 20px;color:#222}
code{background:#f4f4f5;padding:2px 6px;border-radius:4px}h1{font-size:22px}</style></head>
<body><h1>Nginx Admin</h1>
<p>后端已启动。前端静态资源尚未嵌入（<code>web/dist</code> 为空时显示此占位页）。</p>
<p>API 健康检查：<code>GET /api/health</code>；登录：<code>POST /api/auth/login</code>。</p>
</body></html>`
