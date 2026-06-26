package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
	cp "github.com/nginxinc/nginx-go-crossplane"

	"nginx-admin/internal/nginxconf"
)

// handleParseConfig 把配置文本解析为 crossplane 指令树（供前端画布消费）。
// POST /api/nginx/parse  { "content": "..." }
// 返回 { "directives": [...] }
func (s *Server) handleParseConfig(c *gin.Context) {
	var req struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	dirs, err := nginxconf.Parse(req.Content)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"directives": dirs})
}

// handleBuildConfig 把前端编辑后的指令树回写为配置文本。
// POST /api/nginx/build  { "directives": [...] }
// 返回 { "content": "..." }
func (s *Server) handleBuildConfig(c *gin.Context) {
	var req struct {
		Directives cp.Directives `json:"directives"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	content, err := nginxconf.Build(req.Directives)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"content": content})
}
