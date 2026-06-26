// Package nginxconf 用 nginx-go-crossplane 对 nginx 配置文本做精确解析与回写。
//
// 方案 B：前端画布直接消费 crossplane 的通用指令树（Directives），
// 注释、map、复杂指令等全部保真，往返不丢。这里只负责"文本 ⇄ 指令树"的转换，
// 解析在内存中完成（不落盘、不跟随 include）。
package nginxconf

import (
	"bytes"
	"fmt"
	"io"
	"strings"

	cp "github.com/nginxinc/nginx-go-crossplane"
)

// memFile 用于让 crossplane 从内存字符串解析，而非读磁盘。
const memFile = "inmemory.conf"

// Parse 把配置文本解析为 crossplane 指令树。
// 返回顶层 Directives（即一个配置文件的 parsed 内容）。
func Parse(content string) (cp.Directives, error) {
	opts := &cp.ParseOptions{
		SingleFile:                true, // 不跟随 include，只解析本文件
		ParseComments:             true, // 保留注释（方案 B 关键）
		SkipDirectiveContextCheck: true, // 宽松：不校验指令上下文
		SkipDirectiveArgsCheck:    true, // 宽松：不校验参数个数（兼容 openresty/第三方指令）
		Open: func(string) (io.ReadCloser, error) {
			return io.NopCloser(strings.NewReader(content)), nil
		},
		Glob: func(p string) ([]string, error) { return []string{p}, nil },
	}
	payload, err := cp.Parse(memFile, opts)
	if err != nil {
		return nil, fmt.Errorf("解析配置失败: %w", err)
	}
	if len(payload.Config) == 0 {
		return cp.Directives{}, nil
	}
	// 收集解析错误（语法错误等），有则返回首个
	cfg := payload.Config[0]
	if cfg.Status == "failed" && len(cfg.Errors) > 0 {
		return nil, fmt.Errorf("配置语法错误: %v", cfg.Errors[0].Error)
	}
	return cfg.Parsed, nil
}

// Build 把指令树回写为 nginx 配置文本。
func Build(dirs cp.Directives) (string, error) {
	cfg := cp.Config{
		File:   memFile,
		Status: "ok",
		Parsed: dirs,
	}
	var buf bytes.Buffer
	if err := cp.Build(&buf, cfg, &cp.BuildOptions{}); err != nil {
		return "", fmt.Errorf("生成配置失败: %w", err)
	}
	out := buf.String()
	if !strings.HasSuffix(out, "\n") {
		out += "\n"
	}
	return out, nil
}
