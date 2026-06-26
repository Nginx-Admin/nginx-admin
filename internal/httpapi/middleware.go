package httpapi

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"nginx-admin/internal/auth"
	"nginx-admin/internal/model"
)

const ctxClaimsKey = "claims"

// AuthRequired 校验 JWT，注入 claims。
func (s *Server) AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "缺少 token"})
			return
		}
		tokenStr := strings.TrimPrefix(h, "Bearer ")
		claims, err := s.jwt.Verify(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token 无效或已过期"})
			return
		}
		c.Set(ctxClaimsKey, claims)
		c.Next()
	}
}

// RequireRole 要求最低角色等级。admin > editor > viewer。
func (s *Server) RequireRole(min string) gin.HandlerFunc {
	rank := map[string]int{model.RoleViewer: 1, model.RoleEditor: 2, model.RoleAdmin: 3}
	return func(c *gin.Context) {
		claims := currentClaims(c)
		if claims == nil || rank[claims.Role] < rank[min] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "权限不足"})
			return
		}
		c.Next()
	}
}

func currentClaims(c *gin.Context) *auth.Claims {
	v, ok := c.Get(ctxClaimsKey)
	if !ok {
		return nil
	}
	claims, ok := v.(*auth.Claims)
	if !ok {
		return nil
	}
	return claims
}
