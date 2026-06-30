package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"nginx-admin/internal/auth"
	"nginx-admin/internal/model"
)

func (s *Server) handleListUsers(c *gin.Context) {
	rows, err := s.store.ListUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for _, u := range rows {
		out = append(out, gin.H{
			"id": u.ID, "username": u.Username, "role": u.Role,
			"disabled": u.Disabled, "created_at": u.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"users": out})
}

type createUserReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
	Role     string `json:"role" binding:"required"`
}

func (s *Server) handleCreateUser(c *gin.Context) {
	var req createUserReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "用户名、密码（至少6位）和角色均必填"})
		return
	}
	if req.Role != model.RoleAdmin && req.Role != model.RoleEditor && req.Role != model.RoleViewer {
		c.JSON(http.StatusBadRequest, gin.H{"error": "角色必须是 admin / editor / viewer"})
		return
	}
	if exist, _ := s.store.GetUserByUsername(req.Username); exist != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "用户名已存在"})
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码处理失败"})
		return
	}
	u := &model.User{Username: req.Username, PasswordHash: hash, Role: req.Role}
	if err := s.store.CreateUser(u); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	claims := currentClaims(c)
	s.audit(claims.UserID, "", "user.create", u.Username, "success", u.Role)
	c.JSON(http.StatusOK, gin.H{
		"id": u.ID, "username": u.Username, "role": u.Role, "disabled": false,
	})
}

type updateUserReq struct {
	Role     *string `json:"role"`
	Disabled *bool   `json:"disabled"`
	Password *string `json:"password"`
}

func (s *Server) handleUpdateUser(c *gin.Context) {
	id := c.Param("id")
	u, err := s.store.GetUserByID(id)
	if err != nil || u == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	var req updateUserReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	claims := currentClaims(c)
	if req.Role != nil {
		r := *req.Role
		if r != model.RoleAdmin && r != model.RoleEditor && r != model.RoleViewer {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效角色"})
			return
		}
		u.Role = r
	}
	if req.Disabled != nil {
		if u.ID == claims.UserID && *req.Disabled {
			c.JSON(http.StatusBadRequest, gin.H{"error": "不能禁用当前登录账号"})
			return
		}
		u.Disabled = *req.Disabled
	}
	if req.Password != nil && *req.Password != "" {
		if len(*req.Password) < 6 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "新密码至少 6 位"})
			return
		}
		hash, err := auth.HashPassword(*req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "密码处理失败"})
			return
		}
		u.PasswordHash = hash
	}
	if err := s.store.UpdateUser(u); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.audit(claims.UserID, "", "user.update", u.Username, "success", "")
	c.JSON(http.StatusOK, gin.H{
		"id": u.ID, "username": u.Username, "role": u.Role, "disabled": u.Disabled,
	})
}

func (s *Server) handleDeleteUser(c *gin.Context) {
	id := c.Param("id")
	claims := currentClaims(c)
	if id == claims.UserID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不能删除当前登录账号"})
		return
	}
	u, err := s.store.GetUserByID(id)
	if err != nil || u == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	if err := s.store.DeleteUser(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.audit(claims.UserID, "", "user.delete", u.Username, "success", "")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type testConnectionReq struct {
	Address string `json:"address" binding:"required"`
}

// handleTestConnection 测试 Agent 地址是否可达（纳管前预检）。
func (s *Server) handleTestConnection(c *gin.Context) {
	var req testConnectionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 address (host:port)"})
		return
	}
	rep, err := s.agents.Ping(c.Request.Context(), req.Address)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"ok":            true,
		"agent_version": rep.GetAgentVersion(),
	})
}
