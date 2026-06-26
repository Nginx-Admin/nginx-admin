package httpapi

import (
	"fmt"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"

	"nginx-admin/internal/model"
	"nginx-admin/internal/pb"
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
	_ = s.store.TouchServer(srv.ID, st.GetNginxVersion(), "online")
	c.JSON(http.StatusOK, gin.H{
		"nginx_running":    st.GetNginxRunning(),
		"nginx_version":    st.GetNginxVersion(),
		"master_pid":       st.GetMasterPid(),
		"config_root":      st.GetConfigRoot(),
		"last_test_ok":     st.GetLastTestOk(),
		"last_test_output": st.GetLastTestOutput(),
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

func (s *Server) handleListConfigs(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	rep, err := s.agents.ListConfigs(c.Request.Context(), srv.Address)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	// 为每个文件补充行数：并发读取内容计算（配置文件通常很小，Agent 在内网，
	// 并发上限控制开销）。读失败的文件 lines 记 -1，前端回退显示大小。
	type fileInfo struct {
		LogicalPath string `json:"logical_path"`
		Size        int64  `json:"size"`
		MtimeUnix   int64  `json:"mtime_unix"`
		Checksum    string `json:"checksum"`
		Lines       int    `json:"lines"`
	}
	src := rep.GetFiles()
	out := make([]fileInfo, len(src))
	sem := make(chan struct{}, 8) // 并发上限 8
	var wg sync.WaitGroup
	for i, f := range src {
		out[i] = fileInfo{
			LogicalPath: f.GetLogicalPath(),
			Size:        f.GetSize(),
			MtimeUnix:   f.GetMtimeUnix(),
			Checksum:    f.GetChecksum(),
			Lines:       -1,
		}
		wg.Add(1)
		go func(i int, path string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			r, err := s.agents.ReadConfig(c.Request.Context(), srv.Address, path)
			if err == nil {
				out[i].Lines = countLines(r.GetContent())
			}
		}(i, f.GetLogicalPath())
	}
	wg.Wait()

	c.JSON(http.StatusOK, gin.H{"files": out})
}

// countLines 统计字节内容的行数（最后一行无换行也计一行）。
func countLines(b []byte) int {
	if len(b) == 0 {
		return 0
	}
	n := 0
	for _, c := range b {
		if c == '\n' {
			n++
		}
	}
	if b[len(b)-1] != '\n' {
		n++
	}
	return n
}

func (s *Server) handleReadConfig(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 path"})
		return
	}
	rep, err := s.agents.ReadConfig(c.Request.Context(), srv.Address, path)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"path":     path,
		"content":  string(rep.GetContent()),
		"checksum": rep.GetChecksum(),
	})
}

type writeConfigReq struct {
	Path             string `json:"path" binding:"required"`
	Content          string `json:"content"`
	ExpectedChecksum string `json:"expected_checksum"`
}

func (s *Server) handleWriteConfig(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	var req writeConfigReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	claims := currentClaims(c)

	// 写入前：先抓一份当前内容做中心副本（容灾）
	if cur, err := s.agents.ReadConfig(c.Request.Context(), srv.Address, req.Path); err == nil {
		cf, _ := s.store.UpsertConfigFile(srv.ID, req.Path, cur.GetChecksum())
		cfID := ""
		if cf != nil {
			cfID = cf.ID
		}
		_ = s.store.SaveBackup(&model.Backup{
			ServerID: srv.ID, ConfigFileID: cfID, LogicalPath: req.Path,
			Content: cur.GetContent(), Checksum: cur.GetChecksum(),
			CreatedBy: claims.UserID, Note: "写入前中心副本",
		})
	}

	rep, err := s.agents.WriteConfig(c.Request.Context(), srv.Address, &pb.WriteConfigRequest{
		LogicalPath:      req.Path,
		Content:          []byte(req.Content),
		Actor:            claims.Username,
		AutoBackup:       true,
		ExpectedChecksum: req.ExpectedChecksum,
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if !rep.GetOk() {
		s.audit(claims.UserID, srv.ID, "config.save", req.Path, "failed", rep.GetError())
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": rep.GetError()})
		return
	}
	_, _ = s.store.UpsertConfigFile(srv.ID, req.Path, rep.GetNewChecksum())
	s.audit(claims.UserID, srv.ID, "config.save", req.Path, "success", "")
	c.JSON(http.StatusOK, gin.H{"ok": true, "new_checksum": rep.GetNewChecksum(), "backup_ref": rep.GetBackupRef()})
}

func (s *Server) handleTest(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	rep, err := s.agents.TestConfig(c.Request.Context(), srv.Address)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": rep.GetOk(), "output": rep.GetOutput()})
}

func (s *Server) handleReload(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	rep, err := s.agents.Reload(c.Request.Context(), srv.Address)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	result := "success"
	if !rep.GetOk() {
		result = "failed"
	}
	s.audit(currentClaims(c).UserID, srv.ID, "nginx.reload", srv.Name, result, rep.GetOutput())
	c.JSON(http.StatusOK, gin.H{"ok": rep.GetOk(), "output": rep.GetOutput()})
}

func (s *Server) handleListBackups(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	path := c.Query("path")
	// 中心副本
	central, _ := s.store.ListBackups(srv.ID, path)
	// Agent 本地快照
	rep, err := s.agents.ListBackups(c.Request.Context(), srv.Address, path)
	var local []*pb.Backup
	if err == nil {
		local = rep.GetBackups()
	}
	c.JSON(http.StatusOK, gin.H{"central": central, "local": local})
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

func (s *Server) handleListAudit(c *gin.Context) {
	rows, err := s.store.ListAudit(200)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"logs": rows})
}

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
