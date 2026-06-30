package model

import (
	"time"

	"gorm.io/gorm"
)

// Role 角色。
const (
	RoleAdmin  = "admin"
	RoleEditor = "editor"
	RoleViewer = "viewer"
)

// User 用户表。
type User struct {
	ID           string    `gorm:"primaryKey;type:uuid" json:"id"`
	Username     string    `gorm:"uniqueIndex;not null" json:"username"`
	PasswordHash string    `gorm:"not null" json:"-"`
	Role         string    `gorm:"not null;default:viewer" json:"role"`
	Disabled     bool      `gorm:"not null;default:false" json:"disabled"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Server 被管理的 nginx 服务器（对应一个 Agent）。
type Server struct {
	ID               string     `gorm:"primaryKey;type:uuid" json:"id"`
	Name             string     `gorm:"not null" json:"name"`
	Address          string     `gorm:"not null" json:"address"` // Agent gRPC 地址 host:port
	AgentFingerprint string     `json:"agent_fingerprint"`
	Status           string     `gorm:"not null;default:unknown" json:"status"` // online/offline/unknown
	NginxVersion     string     `json:"nginx_version"`
	LastSeenAt       *time.Time `json:"last_seen_at"`
	Labels           string     `gorm:"type:jsonb;default:'{}'" json:"labels"` // 分组/环境标签 JSON
	// 状态快照缓存：最近一次成功拉取 Agent 状态时存下，供详情页"秒显"。
	NginxRunning bool   `json:"nginx_running"`
	MasterPID    int32  `json:"master_pid"`
	LastTestOk   bool   `json:"last_test_ok"`
	ConfigRoot   string `json:"config_root"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ConfigFile 配置文件索引。
type ConfigFile struct {
	ID          string    `gorm:"primaryKey;type:uuid" json:"id"`
	ServerID    string    `gorm:"not null;type:uuid;uniqueIndex:idx_server_path" json:"server_id"`
	LogicalPath string    `gorm:"not null;uniqueIndex:idx_server_path" json:"logical_path"`
	Checksum    string    `json:"checksum"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// AuditLog 操作审计（仅追加）。
type AuditLog struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	ActorID   string    `gorm:"type:uuid;index" json:"actor_id"`
	ServerID  string    `gorm:"type:uuid;index" json:"server_id"`
	Action    string    `gorm:"not null;index" json:"action"` // config.save / nginx.reload / backup.rollback ...
	Target    string    `json:"target"`
	Result    string    `json:"result"` // success / failed
	Detail    string    `gorm:"type:text" json:"detail"`
	CreatedAt time.Time `json:"created_at"`
}

// LoginAttempt 登录失败记录（用于 IP 限流锁定）。
type LoginAttempt struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	IP        string    `gorm:"index;not null" json:"ip"`
	Username  string    `gorm:"index" json:"username"`
	Success   bool      `json:"success"`
	AttemptAt time.Time `gorm:"index" json:"attempt_at"`
}

// AllModels 返回所有需迁移的模型。
func AllModels() []any {
	return []any{
		&User{}, &Server{}, &ConfigFile{}, &AuditLog{}, &LoginAttempt{},
	}
}

// AutoMigrate 执行自动迁移。
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(AllModels()...)
}
