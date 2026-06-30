package httpapi

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"nginx-admin/internal/model"
)

const serverExportFormat = "nginx-admin-servers"
const serverExportVersion = 1

type serverExportItem struct {
	Name    string `json:"name"`
	Address string `json:"address"`
	Labels  string `json:"labels"`
}

type serverExportBundle struct {
	Format     string             `json:"format"`
	Version    int                `json:"version"`
	ExportedAt string             `json:"exported_at"`
	Servers    []serverExportItem `json:"servers"`
}

type exportServersReq struct {
	IDs []string `json:"ids"`
}

type importServersReq struct {
	Format     string             `json:"format"`
	Version    int                `json:"version"`
	Servers    []serverExportItem `json:"servers"`
	OnConflict string             `json:"on_conflict"` // skip | update
}

type importServersResp struct {
	Created int      `json:"created"`
	Updated int      `json:"updated"`
	Skipped int      `json:"skipped"`
	Failed  int      `json:"failed"`
	Errors  []string `json:"errors"`
}

func toExportItem(s model.Server) serverExportItem {
	labels := strings.TrimSpace(s.Labels)
	if labels == "" {
		labels = "{}"
	}
	return serverExportItem{
		Name:    s.Name,
		Address: s.Address,
		Labels:  labels,
	}
}

func buildExportBundle(rows []model.Server) serverExportBundle {
	items := make([]serverExportItem, 0, len(rows))
	for _, s := range rows {
		items = append(items, toExportItem(s))
	}
	return serverExportBundle{
		Format:     serverExportFormat,
		Version:    serverExportVersion,
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Servers:    items,
	}
}

// handleExportServer 导出单个服务（迁移用 JSON）。
func (s *Server) handleExportServer(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	c.JSON(http.StatusOK, buildExportBundle([]model.Server{*srv}))
}

// handleExportServers 批量导出；body.ids 为空则导出全部。
func (s *Server) handleExportServers(c *gin.Context) {
	var req exportServersReq
	if err := c.ShouldBindJSON(&req); err != nil && c.Request.ContentLength > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	rows, err := s.store.ListServersByIDs(req.IDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, buildExportBundle(rows))
}

// handleImportServers 批量导入服务定义（name/address/labels）。
func (s *Server) handleImportServers(c *gin.Context) {
	var req importServersReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if req.Format != "" && req.Format != serverExportFormat {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的导出格式: " + req.Format})
		return
	}
	if req.Version != 0 && req.Version != serverExportVersion {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的导出版本"})
		return
	}
	if len(req.Servers) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "servers 不能为空"})
		return
	}
	mode := strings.ToLower(strings.TrimSpace(req.OnConflict))
	if mode == "" {
		mode = "skip"
	}
	if mode != "skip" && mode != "update" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "on_conflict 仅支持 skip 或 update"})
		return
	}

	resp := importServersResp{Errors: []string{}}
	claims := currentClaims(c)

	for i, item := range req.Servers {
		name := strings.TrimSpace(item.Name)
		address := strings.TrimSpace(item.Address)
		if name == "" || address == "" {
			resp.Failed++
			resp.Errors = append(resp.Errors, formatImportErr(i, "名称与地址不能为空"))
			continue
		}
		if !validAgentAddress(address) {
			resp.Failed++
			resp.Errors = append(resp.Errors, formatImportErr(i, "地址格式无效，需 host:port"))
			continue
		}
		labels, err := normalizeLabels(item.Labels)
		if err != nil {
			resp.Failed++
			resp.Errors = append(resp.Errors, formatImportErr(i, err.Error()))
			continue
		}

		existing, err := s.store.GetServerByAddress(address)
		if err != nil {
			resp.Failed++
			resp.Errors = append(resp.Errors, formatImportErr(i, err.Error()))
			continue
		}
		if existing != nil {
			if mode == "skip" {
				resp.Skipped++
				continue
			}
			existing.Name = name
			existing.Labels = labels
			if err := s.store.UpdateServer(existing); err != nil {
				resp.Failed++
				resp.Errors = append(resp.Errors, formatImportErr(i, err.Error()))
				continue
			}
			s.audit(claims.UserID, existing.ID, "server.import", existing.Name, "success", "update")
			resp.Updated++
			continue
		}

		srv := &model.Server{Name: name, Address: address, Labels: labels, Status: "unknown"}
		if err := s.store.CreateServer(srv); err != nil {
			resp.Failed++
			resp.Errors = append(resp.Errors, formatImportErr(i, err.Error()))
			continue
		}
		s.audit(claims.UserID, srv.ID, "server.import", srv.Name, "success", "create")
		resp.Created++
	}

	c.JSON(http.StatusOK, resp)
}

func formatImportErr(index int, msg string) string {
	return fmt.Sprintf("第 %d 条: %s", index+1, msg)
}

func validAgentAddress(address string) bool {
	host, port, err := net.SplitHostPort(address)
	return err == nil && host != "" && port != ""
}

func normalizeLabels(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "{}", nil
	}
	var obj map[string]any
	if err := json.Unmarshal([]byte(s), &obj); err != nil {
		return "", err
	}
	b, err := json.Marshal(obj)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
