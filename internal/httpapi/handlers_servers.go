package httpapi

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"nginx-admin/internal/model"
)

func (s *Server) handleListServers(c *gin.Context) {
	rows, err := s.store.ListServers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"servers": rows})
}

type createServerReq struct {
	Name    string `json:"name" binding:"required"`
	Address string `json:"address" binding:"required"` // host:port
	Labels  string `json:"labels"`
}

func (s *Server) handleCreateServer(c *gin.Context) {
	var req createServerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	labels := req.Labels
	if labels == "" {
		labels = "{}"
	}
	srv := &model.Server{Name: req.Name, Address: req.Address, Status: "unknown", Labels: labels}
	if err := s.store.CreateServer(srv); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.audit(currentClaims(c).UserID, srv.ID, "server.create", srv.Name, "success", "")
	c.JSON(http.StatusOK, srv)
}

func (s *Server) handleGetServer(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	c.JSON(http.StatusOK, srv)
}

type updateServerReq struct {
	Name    string `json:"name" binding:"required"`
	Address string `json:"address" binding:"required"` // host:port
	Labels  string `json:"labels"`
}

func (s *Server) handleUpdateServer(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	var req updateServerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	srv.Name = req.Name
	srv.Address = req.Address
	if req.Labels != "" {
		srv.Labels = req.Labels
	}
	if err := s.store.UpdateServer(srv); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.audit(currentClaims(c).UserID, srv.ID, "server.update", srv.Name, "success", "")
	c.JSON(http.StatusOK, srv)
}

func (s *Server) handleDeleteServer(c *gin.Context) {
	id := c.Param("id")
	if err := s.store.DeleteServer(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.audit(currentClaims(c).UserID, id, "server.delete", id, "success", "")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleServerStatus(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	st, err := s.agents.GetStatus(c.Request.Context(), srv.Address)
	if err != nil {
		_ = s.store.TouchServer(srv.ID, srv.NginxVersion, "offline")
		c.JSON(http.StatusBadGateway, gin.H{"error": "无法连接 Agent: " + err.Error()})
		return
	}
	_ = s.store.SaveServerStatus(srv.ID, model.Server{
		NginxVersion: st.GetNginxVersion(),
		NginxRunning: st.GetNginxRunning(),
		MasterPID:    st.GetMasterPid(),
		LastTestOk:   st.GetLastTestOk(),
		ConfigRoot:   st.GetConfigRoot(),
	})
	c.JSON(http.StatusOK, gin.H{
		"nginx_running":    st.GetNginxRunning(),
		"nginx_version":    st.GetNginxVersion(),
		"master_pid":       st.GetMasterPid(),
		"config_root":      st.GetConfigRoot(),
		"last_test_ok":     st.GetLastTestOk(),
		"last_test_output": st.GetLastTestOutput(),
		"cached":           false,
	})
}

func (s *Server) handleServerStatusCached(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"nginx_running":    srv.NginxRunning,
		"nginx_version":    srv.NginxVersion,
		"master_pid":       srv.MasterPID,
		"config_root":      srv.ConfigRoot,
		"last_test_ok":     srv.LastTestOk,
		"last_test_output": "",
		"status":           srv.Status,
		"last_seen_at":     srv.LastSeenAt,
		"cached":           true,
	})
}

func (s *Server) handleDiscover(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	rep, err := s.agents.Discover(c.Request.Context(), srv.Address)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	files := make(map[string]string, len(rep.GetFiles()))
	for _, f := range rep.GetFiles() {
		files[f.GetLogicalPath()] = f.GetChecksum()
	}
	_ = s.store.BatchUpsertConfigFiles(srv.ID, files)
	s.audit(currentClaims(c).UserID, srv.ID, "config.discover", srv.Name,
		"success", fmt.Sprintf("发现 %d 个文件", len(rep.GetFiles())))
	c.JSON(http.StatusOK, gin.H{"files": rep.GetFiles(), "server_names": rep.GetServerNames()})
}

type testConnectionReq struct {
	Address string `json:"address" binding:"required"`
}

// handleTestConnection 测试 Agent 地址是否可达（纳管前预检）。
func (s *Server) handleTestConnection(c *gin.Context) {
	var req testConnectionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 address (host:port)"})
		return
	}
	rep, err := s.agents.Ping(c.Request.Context(), req.Address)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"ok":            true,
		"agent_version": rep.GetAgentVersion(),
	})
}
