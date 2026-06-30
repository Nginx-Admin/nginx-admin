package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v3"

	"nginx-admin/internal/model"
)

const serverExportFormat = "nginx-admin-servers"
const serverExportVersion = 1

type serverExportItem struct {
	Name    string `yaml:"name" json:"name"`
	Address string `yaml:"address" json:"address"`
	Labels  any    `yaml:"labels,omitempty" json:"labels,omitempty"`
}

type serverExportBundle struct {
	Format     string             `yaml:"format" json:"format"`
	Version    int                `yaml:"version" json:"version"`
	ExportedAt string             `yaml:"exported_at" json:"exported_at"`
	OnConflict string             `yaml:"on_conflict,omitempty" json:"on_conflict,omitempty"`
	Servers    []serverExportItem `yaml:"servers" json:"servers"`
}

type exportServersReq struct {
	IDs []string `json:"ids"`
}

type importServersResp struct {
	Created int      `json:"created"`
	Updated int      `json:"updated"`
	Skipped int      `json:"skipped"`
	Failed  int      `json:"failed"`
	Errors  []string `json:"errors"`
}

func labelsToMap(raw string) map[string]any {
	s := strings.TrimSpace(raw)
	if s == "" || s == "{}" {
		return nil
	}
	var obj map[string]any
	if err := json.Unmarshal([]byte(s), &obj); err != nil || len(obj) == 0 {
		return nil
	}
	return obj
}

func toExportItem(s model.Server) serverExportItem {
	item := serverExportItem{
		Name:    s.Name,
		Address: s.Address,
	}
	if labels := labelsToMap(s.Labels); labels != nil {
		item.Labels = labels
	}
	return item
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

func writeExportYAML(c *gin.Context, bundle serverExportBundle) {
	data, err := yaml.Marshal(bundle)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/yaml; charset=utf-8", data)
}

// handleExportServer 导出单个服务（迁移用 YAML）。
func (s *Server) handleExportServer(c *gin.Context) {
	srv := s.mustServer(c)
	if srv == nil {
		return
	}
	writeExportYAML(c, buildExportBundle([]model.Server{*srv}))
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
	writeExportYAML(c, buildExportBundle(rows))
}

// handleImportServers 批量导入服务定义（YAML 或 JSON）。
func (s *Server) handleImportServers(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无法读取请求体"})
		return
	}
	if len(body) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体不能为空"})
		return
	}

	var req serverExportBundle
	if err := yaml.Unmarshal(body, &req); err != nil {
		if err := json.Unmarshal(body, &req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无法解析 YAML/JSON 格式"})
			return
		}
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
		labels, err := itemLabelsJSON(item.Labels)
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

func itemLabelsJSON(v any) (string, error) {
	if v == nil {
		return "{}", nil
	}
	switch t := v.(type) {
	case string:
		return normalizeLabels(t)
	case map[string]any:
		if len(t) == 0 {
			return "{}", nil
		}
		b, err := json.Marshal(t)
		if err != nil {
			return "", err
		}
		return string(b), nil
	case map[any]any:
		m := make(map[string]any, len(t))
		for k, val := range t {
			m[fmt.Sprint(k)] = val
		}
		if len(m) == 0 {
			return "{}", nil
		}
		b, err := json.Marshal(m)
		if err != nil {
			return "", err
		}
		return string(b), nil
	default:
		return "", fmt.Errorf("labels 格式无效")
	}
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
