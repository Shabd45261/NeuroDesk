package routes

import (
	"github.com/labstack/echo/v4"
	"github.com/mudler/NeuroDesk/core/config"
	"github.com/mudler/NeuroDesk/core/http/endpoints/jina"
	"github.com/mudler/NeuroDesk/core/http/middleware"
	"github.com/mudler/NeuroDesk/core/schema"

	"github.com/mudler/NeuroDesk/pkg/model"
)

func RegisterJINARoutes(app *echo.Echo,
	re *middleware.RequestExtractor,
	cl *config.ModelConfigLoader,
	ml *model.ModelLoader,
	appConfig *config.ApplicationConfig) {

	// POST endpoint to mimic the reranking
	rerankHandler := jina.JINARerankEndpoint(cl, ml, appConfig)
	app.POST("/v1/rerank",
		rerankHandler,
		middleware.ExposeNodeHeader(appConfig),
		re.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_RERANK)),
		re.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.JINARerankRequest) }))
}
