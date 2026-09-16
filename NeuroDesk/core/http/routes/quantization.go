package routes

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/mudler/NeuroDesk/core/application"
	"github.com/mudler/NeuroDesk/core/config"
	"github.com/mudler/NeuroDesk/core/http/endpoints/neurodesk"
	"github.com/mudler/NeuroDesk/core/services/quantization"
)

// RegisterQuantizationRoutes registers quantization API routes.
func RegisterQuantizationRoutes(e *echo.Echo, qService *quantization.QuantizationService, appConfig *config.ApplicationConfig, app *application.Application, quantizationMw echo.MiddlewareFunc) {
	if qService == nil {
		return
	}

	// Service readiness middleware
	readyMw := func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if qService == nil {
				return c.JSON(http.StatusServiceUnavailable, map[string]string{
					"error": "quantization service is not available",
				})
			}
			return next(c)
		}
	}

	q := e.Group("/api/quantization", readyMw, quantizationMw)
	q.GET("/backends", neurodesk.ListQuantizationBackendsEndpoint(appConfig, ClusterCapabilityProviderFor(app), ClusterInstalledProviderFor(app)))
	q.POST("/jobs", neurodesk.StartQuantizationJobEndpoint(qService))
	q.GET("/jobs", neurodesk.ListQuantizationJobsEndpoint(qService))
	q.GET("/jobs/:id", neurodesk.GetQuantizationJobEndpoint(qService))
	q.POST("/jobs/:id/stop", neurodesk.StopQuantizationJobEndpoint(qService))
	q.DELETE("/jobs/:id", neurodesk.DeleteQuantizationJobEndpoint(qService))
	q.GET("/jobs/:id/progress", neurodesk.QuantizationProgressEndpoint(qService))
	q.POST("/jobs/:id/import", neurodesk.ImportQuantizedModelEndpoint(qService))
	q.GET("/jobs/:id/download", neurodesk.DownloadQuantizedModelEndpoint(qService))
}
