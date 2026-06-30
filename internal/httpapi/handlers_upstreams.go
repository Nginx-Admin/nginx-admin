package httpapi

import (
	"net/http"
	"regexp"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

var upstreamDeclRe = regexp.MustCompile(`(?m)^\s*upstream\s+([^\s{]+)\s*\{`)

type UpstreamRef struct {
	Upstream    string `json:"upstream"`
	LogicalPath string `json:"logical_path"`
	ServerName  string `json:"server_name"`
	Location    string `json:"location"`
	ProxyPass   string `json:"proxy_pass"`
}

var (
	serverNameLineRe = regexp.MustCompile(`(?m)^\s*server_name\s+([^;]+);`)
	locationLineRe   = regexp.MustCompile(`(?m)^\s*location\s+([^{]+)\{`)
	proxyPassLineRe  = regexp.MustCompile(`(?m)^\s*proxy_pass\s+(https?://([^/;:\s]+)[^;]*);`)
)

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
		LogicalPath string `json:"logical_path"`
	}
	var (
		mu  sync.Mutex
		all []upstreamInfo
		wg  sync.WaitGroup
		sem = make(chan struct{}, 8)
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
				Upstream:    m[2],
				LogicalPath: logicalPath,
				ServerName:  curServer,
				Location:    curLocation,
				ProxyPass:   m[1],
			})
		}

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
