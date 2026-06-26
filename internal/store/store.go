package store

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"

	"nginx-admin/internal/model"
)

// Store 封装数据库访问。
type Store struct {
	db            *gorm.DB
	retainPerFile int
}

// Open 连接 PostgreSQL 并执行自动迁移。
func Open(dsn string, retainPerFile int) (*Store, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
		// 跳过默认事务包裹，减少远程库的额外往返（BEGIN/COMMIT）。
		SkipDefaultTransaction: true,
		PrepareStmt:            true, // 预编译语句缓存，降低重复查询开销
	})
	if err != nil {
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}

	// 连接池：复用连接，避免每次查询都重新握手（远程库尤其关键）。
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("获取连接池失败: %w", err)
	}
	sqlDB.SetMaxOpenConns(20)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)
	sqlDB.SetConnMaxLifetime(time.Hour)

	if err := model.AutoMigrate(db); err != nil {
		return nil, fmt.Errorf("数据库迁移失败: %w", err)
	}
	return &Store{db: db, retainPerFile: retainPerFile}, nil
}

// DB 返回底层 *gorm.DB（供高级查询）。
func (s *Store) DB() *gorm.DB { return s.db }

// ---------- User ----------

func (s *Store) GetUserByUsername(username string) (*model.User, error) {
	var u model.User
	err := s.db.Where("username = ?", username).First(&u).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &u, err
}

func (s *Store) GetUserByID(id string) (*model.User, error) {
	var u model.User
	err := s.db.First(&u, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &u, err
}

func (s *Store) CreateUser(u *model.User) error {
	if u.ID == "" {
		u.ID = uuid.NewString()
	}
	return s.db.Create(u).Error
}

func (s *Store) UpdateUser(u *model.User) error {
	return s.db.Save(u).Error
}

func (s *Store) CountUsers() (int64, error) {
	var n int64
	err := s.db.Model(&model.User{}).Count(&n).Error
	return n, err
}

// ---------- Server ----------

func (s *Store) ListServers() ([]model.Server, error) {
	var rows []model.Server
	err := s.db.Order("created_at desc").Find(&rows).Error
	return rows, err
}

func (s *Store) GetServer(id string) (*model.Server, error) {
	var srv model.Server
	err := s.db.First(&srv, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &srv, err
}

func (s *Store) CreateServer(srv *model.Server) error {
	if srv.ID == "" {
		srv.ID = uuid.NewString()
	}
	return s.db.Create(srv).Error
}

func (s *Store) UpdateServer(srv *model.Server) error {
	return s.db.Save(srv).Error
}

func (s *Store) DeleteServer(id string) error {
	return s.db.Delete(&model.Server{}, "id = ?", id).Error
}

func (s *Store) TouchServer(id, version, status string) error {
	now := time.Now()
	return s.db.Model(&model.Server{}).Where("id = ?", id).
		Updates(map[string]any{"status": status, "nginx_version": version, "last_seen_at": now}).Error
}

// ---------- ConfigFile ----------

func (s *Store) UpsertConfigFile(serverID, logicalPath, checksum string) (*model.ConfigFile, error) {
	var cf model.ConfigFile
	err := s.db.Where("server_id = ? AND logical_path = ?", serverID, logicalPath).First(&cf).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		cf = model.ConfigFile{
			ID:          uuid.NewString(),
			ServerID:    serverID,
			LogicalPath: logicalPath,
			Checksum:    checksum,
			UpdatedAt:   time.Now(),
		}
		return &cf, s.db.Create(&cf).Error
	}
	if err != nil {
		return nil, err
	}
	cf.Checksum = checksum
	cf.UpdatedAt = time.Now()
	return &cf, s.db.Save(&cf).Error
}

func (s *Store) ListConfigFiles(serverID string) ([]model.ConfigFile, error) {
	var rows []model.ConfigFile
	err := s.db.Where("server_id = ?", serverID).Order("logical_path").Find(&rows).Error
	return rows, err
}

// BatchUpsertConfigFiles 一次性 upsert 多个配置文件索引（单次往返）。
// 用于配置发现：避免逐个 select+insert 造成大量网络往返。
func (s *Store) BatchUpsertConfigFiles(serverID string, files map[string]string) error {
	if len(files) == 0 {
		return nil
	}
	rows := make([]model.ConfigFile, 0, len(files))
	now := time.Now()
	for path, checksum := range files {
		rows = append(rows, model.ConfigFile{
			ID:          uuid.NewString(),
			ServerID:    serverID,
			LogicalPath: path,
			Checksum:    checksum,
			UpdatedAt:   now,
		})
	}
	// 冲突键 (server_id, logical_path) 时更新 checksum/updated_at。
	return s.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "server_id"}, {Name: "logical_path"}},
		DoUpdates: clause.AssignmentColumns([]string{"checksum", "updated_at"}),
	}).Create(&rows).Error
}

// ---------- Backup（含中心副本 + 保留份数） ----------

// SaveBackup 保存一份中心侧副本，并按 retainPerFile 裁剪旧副本。
func (s *Store) SaveBackup(b *model.Backup) error {
	if b.ID == "" {
		b.ID = uuid.NewString()
	}
	if b.CreatedAt.IsZero() {
		b.CreatedAt = time.Now()
	}
	if err := s.db.Create(b).Error; err != nil {
		return err
	}
	return s.pruneBackups(b.ServerID, b.LogicalPath)
}

// pruneBackups 保留 (server, logicalPath) 最近 retainPerFile 份。
func (s *Store) pruneBackups(serverID, logicalPath string) error {
	var ids []string
	err := s.db.Model(&model.Backup{}).
		Where("server_id = ? AND logical_path = ?", serverID, logicalPath).
		Order("created_at desc").
		Offset(s.retainPerFile).
		Pluck("id", &ids).Error
	if err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}
	return s.db.Delete(&model.Backup{}, "id IN ?", ids).Error
}

func (s *Store) ListBackups(serverID, logicalPath string) ([]model.Backup, error) {
	var rows []model.Backup
	q := s.db.Where("server_id = ?", serverID)
	if logicalPath != "" {
		q = q.Where("logical_path = ?", logicalPath)
	}
	err := q.Order("created_at desc").Find(&rows).Error
	return rows, err
}

func (s *Store) GetBackup(id string) (*model.Backup, error) {
	var b model.Backup
	err := s.db.First(&b, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &b, err
}

// ---------- Audit ----------

func (s *Store) WriteAudit(a *model.AuditLog) error {
	if a.CreatedAt.IsZero() {
		a.CreatedAt = time.Now()
	}
	return s.db.Create(a).Error
}

func (s *Store) ListAudit(limit int) ([]model.AuditLog, error) {
	if limit <= 0 || limit > 1000 {
		limit = 200
	}
	var rows []model.AuditLog
	err := s.db.Order("created_at desc").Limit(limit).Find(&rows).Error
	return rows, err
}

// ---------- LoginAttempt ----------

func (s *Store) RecordLogin(ip, username string, success bool) error {
	return s.db.Create(&model.LoginAttempt{
		IP: ip, Username: username, Success: success, AttemptAt: time.Now(),
	}).Error
}

// RecentFailures 统计某 IP 在 window 内的连续失败次数（自上次成功后）。
func (s *Store) RecentFailures(ip string, window time.Duration) (int64, error) {
	since := time.Now().Add(-window)
	var n int64
	err := s.db.Model(&model.LoginAttempt{}).
		Where("ip = ? AND success = ? AND attempt_at >= ?", ip, false, since).
		Count(&n).Error
	return n, err
}
