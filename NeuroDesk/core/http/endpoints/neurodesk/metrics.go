package neurodesk

import (
	"time"

	"github.com/labstack/echo/v4"
	"github.com/mudler/NeuroDesk/core/services/monitoring"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// NeuroDeskMetricsEndpoint returns the metrics endpoint for NeuroDesk
// @Summary Prometheus metrics endpoint
// @Tags monitoring
// @Produce text/plain
// @Success 200 {string} string "Prometheus metrics"
// @Router /metrics [get]
func NeuroDeskMetricsEndpoint() echo.HandlerFunc {
	return echo.WrapHandler(promhttp.Handler())
}

type apiMiddlewareConfig struct {
	Filter         func(c echo.Context) bool
	metricsService *monitoring.NeuroDeskMetricsService
}

func NeuroDeskMetricsAPIMiddleware(metrics *monitoring.NeuroDeskMetricsService) echo.MiddlewareFunc {
	cfg := apiMiddlewareConfig{
		metricsService: metrics,
		Filter: func(c echo.Context) bool {
			return c.Path() == "/metrics"
		},
	}

	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if cfg.Filter != nil && cfg.Filter(c) {
				return next(c)
			}
			path := c.Path()
			method := c.Request().Method

			start := time.Now()
			err := next(c)
			elapsed := float64(time.Since(start)) / float64(time.Second)
			cfg.metricsService.ObserveAPICall(method, path, elapsed)
			return err
		}
	}
}
