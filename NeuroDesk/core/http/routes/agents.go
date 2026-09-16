package routes

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/mudler/NeuroDesk/core/application"
	"github.com/mudler/NeuroDesk/core/http/endpoints/neurodesk"
)

func RegisterAgentPoolRoutes(e *echo.Echo, app *application.Application,
	agentsMw, skillsMw, collectionsMw echo.MiddlewareFunc) {
	if !app.ApplicationConfig().AgentPool.Enabled {
		return
	}

	// Middleware that returns 503 while the agent pool is still initializing.
	poolReadyMw := func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if app.AgentPoolService() == nil {
				return c.JSON(http.StatusServiceUnavailable, map[string]string{
					"error": "agent pool is starting, please retry shortly",
				})
			}
			return next(c)
		}
	}

	// Agent management routes — require "agents" feature
	ag := e.Group("/api/agents", poolReadyMw, agentsMw)
	ag.GET("", neurodesk.ListAgentsEndpoint(app))
	ag.POST("", neurodesk.CreateAgentEndpoint(app))
	ag.GET("/config/metadata", neurodesk.GetAgentConfigMetaEndpoint(app))
	ag.POST("/import", neurodesk.ImportAgentEndpoint(app))
	ag.GET("/:name", neurodesk.GetAgentEndpoint(app))
	ag.PUT("/:name", neurodesk.UpdateAgentEndpoint(app))
	ag.DELETE("/:name", neurodesk.DeleteAgentEndpoint(app))
	ag.GET("/:name/config", neurodesk.GetAgentConfigEndpoint(app))
	ag.PUT("/:name/pause", neurodesk.PauseAgentEndpoint(app))
	ag.PUT("/:name/resume", neurodesk.ResumeAgentEndpoint(app))
	ag.GET("/:name/status", neurodesk.GetAgentStatusEndpoint(app))
	ag.GET("/:name/observables", neurodesk.GetAgentObservablesEndpoint(app))
	ag.DELETE("/:name/observables", neurodesk.ClearAgentObservablesEndpoint(app))
	ag.POST("/:name/chat", neurodesk.ChatWithAgentEndpoint(app))
	ag.GET("/:name/sse", neurodesk.AgentSSEEndpoint(app))
	ag.GET("/:name/export", neurodesk.ExportAgentEndpoint(app))
	ag.GET("/:name/files", neurodesk.AgentFileEndpoint(app))

	// Actions (part of agents feature)
	ag.GET("/actions", neurodesk.ListActionsEndpoint(app))
	ag.POST("/actions/:name/definition", neurodesk.GetActionDefinitionEndpoint(app))
	ag.POST("/actions/:name/run", neurodesk.ExecuteActionEndpoint(app))

	// Skills routes — require "skills" feature
	sg := e.Group("/api/agents/skills", poolReadyMw, skillsMw)
	sg.GET("", neurodesk.ListSkillsEndpoint(app))
	sg.GET("/config", neurodesk.GetSkillsConfigEndpoint(app))
	sg.GET("/search", neurodesk.SearchSkillsEndpoint(app))
	sg.POST("", neurodesk.CreateSkillEndpoint(app))
	sg.GET("/export/*", neurodesk.ExportSkillEndpoint(app))
	sg.POST("/import", neurodesk.ImportSkillEndpoint(app))
	sg.GET("/:name", neurodesk.GetSkillEndpoint(app))
	sg.PUT("/:name", neurodesk.UpdateSkillEndpoint(app))
	sg.DELETE("/:name", neurodesk.DeleteSkillEndpoint(app))
	sg.GET("/:name/resources", neurodesk.ListSkillResourcesEndpoint(app))
	sg.GET("/:name/resources/*", neurodesk.GetSkillResourceEndpoint(app))
	sg.POST("/:name/resources", neurodesk.CreateSkillResourceEndpoint(app))
	sg.PUT("/:name/resources/*", neurodesk.UpdateSkillResourceEndpoint(app))
	sg.DELETE("/:name/resources/*", neurodesk.DeleteSkillResourceEndpoint(app))

	// Git Repos — guarded by skills feature (at original /api/agents/git-repos path)
	gg := e.Group("/api/agents/git-repos", poolReadyMw, skillsMw)
	gg.GET("", neurodesk.ListGitReposEndpoint(app))
	gg.POST("", neurodesk.AddGitRepoEndpoint(app))
	gg.PUT("/:id", neurodesk.UpdateGitRepoEndpoint(app))
	gg.DELETE("/:id", neurodesk.DeleteGitRepoEndpoint(app))
	gg.POST("/:id/sync", neurodesk.SyncGitRepoEndpoint(app))
	gg.POST("/:id/toggle", neurodesk.ToggleGitRepoEndpoint(app))

	// Collections / Knowledge Base — require "collections" feature
	cg := e.Group("/api/agents/collections", poolReadyMw, collectionsMw)
	cg.GET("", neurodesk.ListCollectionsEndpoint(app))
	cg.POST("", neurodesk.CreateCollectionEndpoint(app))
	cg.POST("/:name/upload", neurodesk.UploadToCollectionEndpoint(app))
	cg.GET("/:name/entries", neurodesk.ListCollectionEntriesEndpoint(app))
	cg.GET("/:name/entries/*", neurodesk.GetCollectionEntryContentEndpoint(app))
	cg.GET("/:name/entries-raw/*", neurodesk.GetCollectionEntryRawFileEndpoint(app))
	cg.POST("/:name/search", neurodesk.SearchCollectionEndpoint(app))
	cg.POST("/:name/reset", neurodesk.ResetCollectionEndpoint(app))
	cg.DELETE("/:name/entry/delete", neurodesk.DeleteCollectionEntryEndpoint(app))
	cg.POST("/:name/sources", neurodesk.AddCollectionSourceEndpoint(app))
	cg.DELETE("/:name/sources", neurodesk.RemoveCollectionSourceEndpoint(app))
	cg.GET("/:name/sources", neurodesk.ListCollectionSourcesEndpoint(app))
}
