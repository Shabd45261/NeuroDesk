package neurodesk

import (
	"github.com/labstack/echo/v4"
	"github.com/mudler/NeuroDesk/core/backend"
	"github.com/mudler/NeuroDesk/core/config"
	"github.com/mudler/NeuroDesk/core/http/middleware"
	"github.com/mudler/NeuroDesk/core/schema"
	"github.com/mudler/NeuroDesk/pkg/model"
)

// TokenizeEndpoint exposes a REST API to tokenize the content
// @Summary Tokenize the input.
// @Tags tokenize
// @Param request body schema.TokenizeRequest true "Request"
// @Success 200 {object} schema.TokenizeResponse "Response"
// @Router /v1/tokenize [post]
func TokenizeEndpoint(cl *config.ModelConfigLoader, ml *model.ModelLoader, appConfig *config.ApplicationConfig) echo.HandlerFunc {
	return func(c echo.Context) error {
		input, ok := c.Get(middleware.CONTEXT_LOCALS_KEY_NEURODESK_REQUEST).(*schema.TokenizeRequest)
		if !ok || input.Model == "" {
			return echo.ErrBadRequest
		}

		cfg, ok := c.Get(middleware.CONTEXT_LOCALS_KEY_MODEL_CONFIG).(*config.ModelConfig)
		if !ok || cfg == nil {
			return echo.ErrBadRequest
		}

		tokenResponse, err := backend.ModelTokenize(input.Content, ml, *cfg, appConfig)
		if err != nil {
			return err
		}
		return c.JSON(200, tokenResponse)
	}
}
