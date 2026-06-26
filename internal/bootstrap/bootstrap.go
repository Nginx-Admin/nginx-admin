package bootstrap

import (
	"log"

	"nginx-admin/internal/auth"
	"nginx-admin/internal/config"
	"nginx-admin/internal/model"
	"nginx-admin/internal/store"
)

// EnsureDefaultAdmin 在用户表为空时创建默认管理员。
func EnsureDefaultAdmin(st *store.Store, cfg config.AuthConfig) error {
	n, err := st.CountUsers()
	if err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	pwd := cfg.DefaultAdminPassword
	if pwd == "" {
		pwd = "admin"
	}
	hash, err := auth.HashPassword(pwd)
	if err != nil {
		return err
	}
	u := &model.User{Username: "admin", PasswordHash: hash, Role: model.RoleAdmin}
	if err := st.CreateUser(u); err != nil {
		return err
	}
	log.Printf("已创建默认管理员 admin（密码来自配置 default_admin_password，请登录后立即修改）")
	return nil
}
