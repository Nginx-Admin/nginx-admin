package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"nginx-admin/internal/auth"
	"nginx-admin/internal/model"
)

func (s *Server) handleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "version": Version, "time": time.Now().Unix()})
}

type loginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (s *Server) handleLogin(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	ip := c.ClientIP()

	// 登录失败锁定检查
	window := time.Duration(s.cfg.Auth.LockMinutes) * time.Minute
	if fails, _ := s.store.RecentFailures(ip, window); int(fails) >= s.cfg.Auth.MaxLoginFails {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": "登录失败次数过多，请稍后再试",
		})
		return
	}

	u, err := s.store.GetUserByUsername(req.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "服务器错误"})
		return
	}
	fail := func() {
		_ = s.store.RecordLogin(ip, req.Username, false)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
	}
	if u == nil || u.Disabled {
		fail()
		return
	}
	ok, err := auth.VerifyPassword(req.Password, u.PasswordHash)
	if err != nil || !ok {
		fail()
		return
	}
	_ = s.store.RecordLogin(ip, req.Username, true)

	token, err := s.jwt.Generate(u.ID, u.Username, u.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "签发 token 失败"})
		return
	}
	s.audit(u.ID, "", "auth.login", req.Username, "success", "")
	c.JSON(http.StatusOK, gin.H{"token": token, "user": gin.H{
		"id": u.ID, "username": u.Username, "role": u.Role,
	}})
}

func (s *Server) handleMe(c *gin.Context) {
	claims := currentClaims(c)
	c.JSON(http.StatusOK, gin.H{"id": claims.UserID, "username": claims.Username, "role": claims.Role})
}

type changePwdReq struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

func (s *Server) handleChangePassword(c *gin.Context) {
	claims := currentClaims(c)
	var req changePwdReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新密码至少 6 位"})
		return
	}
	u, err := s.store.GetUserByID(claims.UserID)
	if err != nil || u == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "用户不存在"})
		return
	}
	ok, _ := auth.VerifyPassword(req.OldPassword, u.PasswordHash)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "原密码错误"})
		return
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "处理失败"})
		return
	}
	u.PasswordHash = hash
	if err := s.store.UpdateUser(u); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	s.audit(u.ID, "", "auth.change_password", u.Username, "success", "")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) audit(actorID, serverID, action, target, result, detail string) {
	_ = s.store.WriteAudit(&model.AuditLog{
		ActorID: actorID, ServerID: serverID, Action: action,
		Target: target, Result: result, Detail: detail,
	})
}
