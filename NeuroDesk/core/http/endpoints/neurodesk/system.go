package neurodesk

import (
	"github.com/labstack/echo/v4"
	"github.com/mudler/NeuroDesk/core/config"
	"github.com/mudler/NeuroDesk/core/schema"
	"github.com/mudler/NeuroDesk/pkg/model"
)

// SystemInformations returns the system informations
// @Summary Show the NeuroDesk instance information
// @Tags monitoring
// @Success 200 {object} schema.SystemInformationResponse "Response"
// @Router /system [get]
func SystemInformations(cl *config.ModelConfigLoader, ml *model.ModelLoader, appConfig *config.ApplicationConfig) echo.HandlerFunc {
	return func(c echo.Context) error {
		availableBackends := []string{}
		loadedModels := ml.ListLoadedModels()
		for b := range appConfig.ExternalGRPCBackends {
			availableBackends = append(availableBackends, b)
		}
		for b := range ml.GetAllExternalBackends(nil) {
			availableBackends = append(availableBackends, b)
		}

		sysmodels := []schema.SysInfoModel{}
		for _, m := range loadedModels {
			entry := schema.SysInfoModel{ID: m.ID}
			// The loader tracks only the ID. Which engine is serving a model is
			// the first thing an operator wants beside its name, and it is one
			// config lookup away.
			if cfg, ok := cl.GetModelConfig(m.ID); ok {
				entry.Backend = cfg.Backend
			}
			sysmodels = append(sysmodels, entry)
		}
		return c.JSON(200,
			schema.SystemInformationResponse{
				Backends: availableBackends,
				Models:   sysmodels,
			},
		)
	}
}
