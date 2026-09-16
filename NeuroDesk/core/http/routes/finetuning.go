package routes

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/mudler/NeuroDesk/core/application"
	"github.com/mudler/NeuroDesk/core/config"
	"github.com/mudler/NeuroDesk/core/http/endpoints/neurodesk"
	"github.com/mudler/NeuroDesk/core/services/finetune"
)

// RegisterFineTuningRoutes registers fine-tuning API routes.
func RegisterFineTuningRoutes(e *echo.Echo, ftService *finetune.FineTuneService, appConfig *config.ApplicationConfig, app *application.Application, fineTuningMw echo.MiddlewareFunc) {
	if ftService == nil {
		return
	}

	// Service readiness middleware
	readyMw := func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if ftService == nil {
				return c.JSON(http.StatusServiceUnavailable, map[string]string{
					"error": "fine-tuning service is not available",
				})
			}
			return next(c)
		}
	}

	ft := e.Group("/api/fine-tuning", readyMw, fineTuningMw)
	ft.GET("/backends", neurodesk.ListFineTuneBackendsEndpoint(appConfig, ClusterCapabilityProviderFor(app), ClusterInstalledProviderFor(app)))
	ft.POST("/jobs", neurodesk.StartFineTuneJobEndpoint(ftService))
	ft.GET("/jobs", neurodesk.ListFineTuneJobsEndpoint(ftService))
	ft.GET("/jobs/:id", neurodesk.GetFineTuneJobEndpoint(ftService))
	ft.POST("/jobs/:id/stop", neurodesk.StopFineTuneJobEndpoint(ftService))
	ft.DELETE("/jobs/:id", neurodesk.DeleteFineTuneJobEndpoint(ftService))
	ft.GET("/jobs/:id/progress", neurodesk.FineTuneProgressEndpoint(ftService))
	ft.GET("/jobs/:id/checkpoints", neurodesk.ListCheckpointsEndpoint(ftService))
	ft.POST("/jobs/:id/export", neurodesk.ExportModelEndpoint(ftService))
	ft.GET("/jobs/:id/download", neurodesk.DownloadExportedModelEndpoint(ftService))
	ft.POST("/datasets", neurodesk.UploadDatasetEndpoint(ftService))
}
