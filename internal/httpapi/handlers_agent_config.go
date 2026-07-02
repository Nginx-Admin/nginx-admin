package httpapi

import (
	"net/http"
	"sort"
	"sync"

	"github.com/gin-gonic/gin"

	"nginx-admin/internal/pb"
)

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

	type fileInfo struct {
		LogicalPath string `json:"logical_path"`
		Size        int64  `json:"size"`
		MtimeUnix   int64  `json:"mtime_unix"`
		Checksum    string `json:"checksum"`
		Lines       int    `json:"lines"`
	}
	src := rep.GetFiles()
	out := make([]fileInfo, len(src))
	sem := make(chan struct{}, 8)
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

	// 合并中心索引：新建/写入后已入库但尚未被 include 链扫到的文件（如根目录新建）
	indexed, err := s.store.ListConfigFiles(srv.ID)
	if err == nil {
		seen := make(map[string]struct{}, len(out))
		for _, f := range out {
			seen[f.LogicalPath] = struct{}{}
		}
		for _, cf := range indexed {
			if _, ok := seen[cf.LogicalPath]; ok {
				continue
			}
			fi := fileInfo{
				LogicalPath: cf.LogicalPath,
				Checksum:    cf.Checksum,
				Lines:       -1,
			}
			if r, err := s.agents.ReadConfig(c.Request.Context(), srv.Address, cf.LogicalPath); err == nil {
				fi.Lines = countLines(r.GetContent())
				if fi.Checksum == "" {
					fi.Checksum = r.GetChecksum()
				}
				fi.Size = int64(len(r.GetContent()))
			}
			out = append(out, fi)
		}
		sort.Slice(out, func(i, j int) bool {
			return out[i].LogicalPath < out[j].LogicalPath
		})
	}

	c.JSON(http.StatusOK, gin.H{"files": out})
}

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

func (s *Server) handleDeleteConfig(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 path 参数"})
		return
	}
	claims := currentClaims(c)
	rep, err := s.agents.DeleteConfig(c.Request.Context(), srv.Address, &pb.DeleteConfigRequest{
		LogicalPath: path,
		Actor:       claims.Username,
		AutoBackup:  true,
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if !rep.GetOk() {
		s.audit(claims.UserID, srv.ID, "config.delete", path, "failed", rep.GetError())
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": rep.GetError()})
		return
	}
	_ = s.store.DeleteConfigFile(srv.ID, path)
	s.audit(claims.UserID, srv.ID, "config.delete", path, "success", "")
	c.JSON(http.StatusOK, gin.H{"ok": true, "backup_ref": rep.GetBackupRef()})
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
