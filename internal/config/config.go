package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Config 是 nginx-admin（中心控制台）的配置。
type Config struct {
	HTTP     HTTPConfig     `yaml:"http"`
	Database DatabaseConfig `yaml:"database"`
	Auth     AuthConfig     `yaml:"auth"`
	Agent    AgentConfig    `yaml:"agent"`
	Backup   BackupConfig   `yaml:"backup"`
}

type HTTPConfig struct {
	// HTTP 监听地址。
	Listen string `yaml:"listen"`
	// 是否启用 HTTPS（生产强制）。
	TLSCert string `yaml:"tls_cert"`
	TLSKey  string `yaml:"tls_key"`
}

type DatabaseConfig struct {
	// PostgreSQL DSN，如 host=127.0.0.1 user=nginx password=xxx dbname=nginx_admin port=5432 sslmode=disable TimeZone=Asia/Shanghai
	DSN string `yaml:"dsn"`
}

type AuthConfig struct {
	// JWT 签名密钥（生产务必修改）。
	JWTSecret string `yaml:"jwt_secret"`
	// Token 有效期（小时）。
	TokenTTLHours int `yaml:"token_ttl_hours"`
	// 登录失败锁定：阈值与锁定时长（分钟）。
	MaxLoginFails int `yaml:"max_login_fails"`
	LockMinutes   int `yaml:"lock_minutes"`
	// 首次启动创建的默认管理员密码（仅首次生效）。
	DefaultAdminPassword string `yaml:"default_admin_password"`
}

type AgentConfig struct {
	// 连接各 Agent 时使用的 mTLS 客户端证书（中心作为客户端）。
	TLSEnabled bool   `yaml:"tls_enabled"`
	Cert       string `yaml:"cert"`
	Key        string `yaml:"key"`
	CA         string `yaml:"ca"`
	// 单次 gRPC 调用超时（秒）。
	DialTimeoutSeconds int `yaml:"dial_timeout_seconds"`
}

type BackupConfig struct {
	// 中心侧每个配置文件保留的副本份数（已定：5）。
	RetainPerFile int `yaml:"retain_per_file"`
}

func Default() Config {
	return Config{
		HTTP: HTTPConfig{Listen: "0.0.0.0:8080"},
		Auth: AuthConfig{
			JWTSecret:            "change-me-in-production",
			TokenTTLHours:        24,
			MaxLoginFails:        5,
			LockMinutes:          30,
			DefaultAdminPassword: "admin",
		},
		Agent:  AgentConfig{TLSEnabled: false, DialTimeoutSeconds: 15},
		Backup: BackupConfig{RetainPerFile: 5},
	}
}

func Load(path string) (Config, error) {
	cfg := Default()
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, fmt.Errorf("读取配置文件 %s 失败: %w", path, err)
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("解析配置文件 %s 失败: %w", path, err)
	}
	if err := cfg.Validate(); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func (c Config) Validate() error {
	if c.HTTP.Listen == "" {
		return fmt.Errorf("http.listen 不能为空")
	}
	if c.Database.DSN == "" {
		return fmt.Errorf("database.dsn 不能为空")
	}
	if c.Auth.JWTSecret == "" {
		return fmt.Errorf("auth.jwt_secret 不能为空")
	}
	if c.Backup.RetainPerFile <= 0 {
		return fmt.Errorf("backup.retain_per_file 必须大于 0")
	}
	return nil
}
