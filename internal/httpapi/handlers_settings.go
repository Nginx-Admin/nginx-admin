package httpapi

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"nginx-admin/internal/model"
)

// handleGetSettings 返回中心全局设置（目前只有备份保留份数）。
func (s *Server) handleGetSettings(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"retain_per_file": s.store.RetainPerFile(),
	})
}

type updateSettingsReq struct {
	RetainPerFile *int `json:"retain_per_file"`
}

// handleUpdateSettings 更新中心全局设置（admin 角色）。
func (s *Server) handleUpdateSettings(c *gin.Context) {
	var req updateSettingsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if req.RetainPerFile != nil {
		if *req.RetainPerFile <= 0 || *req.RetainPerFile > 1000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "保留份数需在 1~1000 之间"})
			return
		}
		if err := s.store.SetSetting(
			model.SettingRetainPerFile, strconv.Itoa(*req.RetainPerFile),
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		s.audit(currentClaims(c).UserID, "", "settings.update", "retain_per_file",
			"success", strconv.Itoa(*req.RetainPerFile))
	}
	c.JSON(http.StatusOK, gin.H{
		"retain_per_file": s.store.RetainPerFile(),
	})
}
