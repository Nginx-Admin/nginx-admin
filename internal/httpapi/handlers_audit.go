package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (s *Server) handleListAudit(c *gin.Context) {
	rows, err := s.store.ListAudit(200)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	userNames := map[string]string{}
	serverNames := map[string]string{}
	for _, row := range rows {
		if row.ActorID != "" {
			userNames[row.ActorID] = ""
		}
		if row.ServerID != "" {
			serverNames[row.ServerID] = ""
		}
	}
	for id := range userNames {
		if u, _ := s.store.GetUserByID(id); u != nil {
			userNames[id] = u.Username
		}
	}
	for id := range serverNames {
		if srv, _ := s.store.GetServer(id); srv != nil {
			serverNames[id] = srv.Name
		}
	}

	logs := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		actor := userNames[row.ActorID]
		if actor == "" && row.ActorID != "" {
			actor = row.ActorID[:8] + "…"
		}
		srvName := serverNames[row.ServerID]
		logs = append(logs, gin.H{
			"id": row.ID, "actor_id": row.ActorID, "actor_username": actor,
			"server_id": row.ServerID, "server_name": srvName,
			"action": row.Action, "target": row.Target,
			"result": row.Result, "detail": row.Detail, "created_at": row.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"logs": logs})
}
