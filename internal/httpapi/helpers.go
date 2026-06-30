package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"nginx-admin/internal/model"
)

// mustServer 取路径参数 :id 对应的服务器，不存在则写 404 并返回 nil。
func (s *Server) mustServer(c *gin.Context) *model.Server {
	id := c.Param("id")
	srv, err := s.store.GetServer(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return nil
	}
	if srv == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务器不存在"})
		return nil
	}
	return srv
}
