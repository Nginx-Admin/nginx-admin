package httpapi

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"

	"nginx-admin/internal/model"
	"nginx-admin/internal/pb"
)

// upstreamDeclRe 匹配 upstream 块声明：upstream <name> {
var upstreamDeclRe = regexp.MustCompile(`(?m)^\s*upstream\s+([^\s{]+)\s*\{`)

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
	// 缓存完整快照，供下次"秒显"
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

// handleServerStatusCached 直接返回上次缓存的状态快照，不打 Agent（秒返回）。
// 前端进详情页先调它"秒显"，再调实时 /status 刷新。
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

// handleListUpstreams 汇总该服务器上「所有配置文件」里定义的 upstream。
// 用途：画布渲染单个文件时，proxy_pass 指向的 upstream 可能定义在别的文件
// （如 conf.d/upstream.conf 经 include 进来）。前端据此把跨文件的 upstream
// 也连成节点。实现：discover 全部文件 → 并发读取 → 正则提取 upstream 名。
func (s *Server) handleListUpstreams(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	rep, err := s.agents.Discover(c.Request.Context(), srv.Address)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	type upstreamInfo struct {
		Name        string `json:"name"`
		LogicalPath string `json:"logical_path"` // 定义所在文件
	}
	var (
		mu   sync.Mutex
		all  []upstreamInfo
		wg   sync.WaitGroup
		sem  = make(chan struct{}, 8)
	)
	for _, f := range rep.GetFiles() {
		path := f.GetLogicalPath()
		wg.Add(1)
		go func(path string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			r, err := s.agents.ReadConfig(c.Request.Context(), srv.Address, path)
			if err != nil {
				return
			}
			names := extractUpstreamNames(r.GetContent())
			if len(names) == 0 {
				return
			}
			mu.Lock()
			for _, n := range names {
				all = append(all, upstreamInfo{Name: n, LogicalPath: path})
			}
			mu.Unlock()
		}(path)
	}
	wg.Wait()

	c.JSON(http.StatusOK, gin.H{"upstreams": all})
}

// extractUpstreamNames 从配置内容提取所有 upstream 块名。
func extractUpstreamNames(content []byte) []string {
	matches := upstreamDeclRe.FindAllSubmatch(content, -1)
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		if len(m) >= 2 {
			out = append(out, string(m[1]))
		}
	}
	return out
}

// UpstreamRef 是对某个 upstream 的一处引用（哪个文件、哪个 server、哪个 location）。
type UpstreamRef struct {
	Upstream    string `json:"upstream"`     // 被引用的 upstream 名
	LogicalPath string `json:"logical_path"` // 引用所在文件
	ServerName  string `json:"server_name"`  // 所属 server 的 server_name（可空）
	Location    string `json:"location"`     // 所属 location 匹配串（可空）
	ProxyPass   string `json:"proxy_pass"`   // 原始 proxy_pass 目标
}

var (
	serverNameLineRe = regexp.MustCompile(`(?m)^\s*server_name\s+([^;]+);`)
	locationLineRe   = regexp.MustCompile(`(?m)^\s*location\s+([^{]+)\{`)
	proxyPassLineRe  = regexp.MustCompile(`(?m)^\s*proxy_pass\s+(https?://([^/;:\s]+)[^;]*);`)
)

// handleUpstreamRefs 反向引用：扫描该服务器所有配置文件，找出每个 proxy_pass
// 引用的 upstream 及其上下文（server_name / location / 文件）。
// 用途：打开 upstream.conf 时，画布据此把"引用了这些 upstream 的 server/location"
// 也展示出来。
func (s *Server) handleUpstreamRefs(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	rep, err := s.agents.Discover(c.Request.Context(), srv.Address)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	var (
		mu   sync.Mutex
		refs []UpstreamRef
		wg   sync.WaitGroup
		sem  = make(chan struct{}, 8)
	)
	for _, f := range rep.GetFiles() {
		path := f.GetLogicalPath()
		wg.Add(1)
		go func(path string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			r, err := s.agents.ReadConfig(c.Request.Context(), srv.Address, path)
			if err != nil {
				return
			}
			found := extractUpstreamRefs(path, r.GetContent())
			if len(found) == 0 {
				return
			}
			mu.Lock()
			refs = append(refs, found...)
			mu.Unlock()
		}(path)
	}
	wg.Wait()

	c.JSON(http.StatusOK, gin.H{"refs": refs})
}

// extractUpstreamRefs 逐行扫描配置，跟踪当前 server_name / location，
// 对每个 proxy_pass http://X 记录一条引用（X 即被引用的 upstream 名或主机名）。
func extractUpstreamRefs(logicalPath string, content []byte) []UpstreamRef {
	lines := strings.Split(string(content), "\n")
	var out []UpstreamRef
	curServer := ""
	curLocation := ""
	depth := 0
	serverDepth := -1
	locationDepth := -1

	for _, raw := range lines {
		line := strings.TrimSpace(raw)

		if m := serverNameLineRe.FindStringSubmatch(line + ";"); m != nil && strings.HasPrefix(line, "server_name") {
			curServer = strings.TrimSpace(strings.Fields(m[1])[0])
		}
		if m := locationLineRe.FindStringSubmatch(line + "{"); m != nil && strings.HasPrefix(line, "location") {
			curLocation = strings.TrimSpace(m[1])
			locationDepth = depth
		}
		if strings.HasPrefix(line, "server") && strings.Contains(line, "{") {
			serverDepth = depth
		}
		if m := proxyPassLineRe.FindStringSubmatch(line + ";"); m != nil && strings.HasPrefix(line, "proxy_pass") {
			out = append(out, UpstreamRef{
				Upstream:    m[2], // http://X 里的 X
				LogicalPath: logicalPath,
				ServerName:  curServer,
				Location:    curLocation,
				ProxyPass:   m[1],
			})
		}

		// 维护花括号深度，离开 location/server 块时清空上下文
		depth += strings.Count(line, "{") - strings.Count(line, "}")
		if locationDepth >= 0 && depth <= locationDepth {
			curLocation = ""
			locationDepth = -1
		}
		if serverDepth >= 0 && depth <= serverDepth {
			curServer = ""
			serverDepth = -1
		}
	}
	return out
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
	// Agent 本地快照（唯一备份来源）
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

func (s *Server) handleListAudit(c *gin.Context) {
	rows, err := s.store.ListAudit(200)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"logs": rows})
}

// handleGetAgentSettings 读取某服务器 Agent 的本地设置（快照保留、主配置编辑开关）。
func (s *Server) handleGetAgentSettings(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	rep, err := s.agents.GetAgentSettings(c.Request.Context(), srv.Address)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "无法连接 Agent: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"backup_retain":            rep.GetBackupRetain(),
		"allow_main_config":        rep.GetAllowMainConfig(),
		"allow_main_config_remote": rep.GetAllowMainConfigRemote(),
	})
}

type updateAgentSettingsReq struct {
	BackupRetain    int32 `json:"backup_retain"`
	AllowMainConfig bool  `json:"allow_main_config"`
}

// handleUpdateAgentSettings 下发设置到某服务器的 Agent。
func (s *Server) handleUpdateAgentSettings(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	var req updateAgentSettingsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	rep, err := s.agents.UpdateAgentSettings(c.Request.Context(), srv.Address, &pb.UpdateAgentSettingsRequest{
		BackupRetain:    req.BackupRetain,
		AllowMainConfig: req.AllowMainConfig,
		Actor:           currentClaims(c).UserID,
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	s.audit(currentClaims(c).UserID, srv.ID, "agent.settings.update", srv.Name, "success",
		fmt.Sprintf("retain=%d allow_main_config=%v", rep.GetBackupRetain(), rep.GetAllowMainConfig()))
	c.JSON(http.StatusOK, gin.H{
		"backup_retain":            rep.GetBackupRetain(),
		"allow_main_config":        rep.GetAllowMainConfig(),
		"allow_main_config_remote": rep.GetAllowMainConfigRemote(),
	})
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
