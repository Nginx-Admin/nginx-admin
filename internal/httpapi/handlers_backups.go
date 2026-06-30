package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"nginx-admin/internal/pb"
)

func (s *Server) handleListBackups(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	path := c.Query("path")
	rep, err := s.agents.ListBackups(c.Request.Context(), srv.Address, path)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"local": rep.GetBackups()})
}

type rollbackReq struct {
	BackupRef string `json:"backup_ref" binding:"required"`
}

func (s *Server) handleRollback(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	var req rollbackReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	claims := currentClaims(c)
	rep, err := s.agents.Rollback(c.Request.Context(), srv.Address, &pb.RollbackRequest{
		BackupRef: req.BackupRef, Actor: claims.Username,
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	result := "success"
	if !rep.GetOk() {
		result = "failed"
	}
	s.audit(claims.UserID, srv.ID, "backup.rollback", req.BackupRef, result, rep.GetError())
	c.JSON(http.StatusOK, gin.H{"ok": rep.GetOk(), "output": rep.GetOutput(), "error": rep.GetError()})
}
