package neurodesk

import (
	"github.com/labstack/echo/v4"
	"github.com/mudler/NeuroDesk/core/backend"
	"github.com/mudler/NeuroDesk/core/config"
	"github.com/mudler/NeuroDesk/core/http/middleware"
	"github.com/mudler/NeuroDesk/core/schema"
	"github.com/mudler/NeuroDesk/pkg/model"
	"github.com/mudler/xlog"
)

// VADEndpoint is Voice-Activation-Detection endpoint
// @Summary	Detect voice fragments in an audio stream
// @Tags audio
// @Accept json
// @Param		request	body		schema.VADRequest	true	"query params"
// @Success 200 {object} proto.VADResponse "Response"
// @Router		/vad [post]
func VADEndpoint(cl *config.ModelConfigLoader, ml *model.ModelLoader, appConfig *config.ApplicationConfig) echo.HandlerFunc {
	return func(c echo.Context) error {
		input, ok := c.Get(middleware.CONTEXT_LOCALS_KEY_NEURODESK_REQUEST).(*schema.VADRequest)
		if !ok || input.Model == "" {
			return echo.ErrBadRequest
		}

		cfg, ok := c.Get(middleware.CONTEXT_LOCALS_KEY_MODEL_CONFIG).(*config.ModelConfig)
		if !ok || cfg == nil {
			return echo.ErrBadRequest
		}

		xlog.Debug("NeuroDesk VAD Request received", "model", input.Model)

		resp, err := backend.VAD(input, c.Request().Context(), ml, appConfig, *cfg)

		if err != nil {
			return err
		}

		return c.JSON(200, resp)
	}
}
