package routes

import (
	"github.com/labstack/echo/v4"
	"github.com/mudler/NeuroDesk/core/config"
	"github.com/mudler/NeuroDesk/core/http/endpoints/elevenlabs"
	"github.com/mudler/NeuroDesk/core/http/middleware"
	"github.com/mudler/NeuroDesk/core/schema"
	"github.com/mudler/NeuroDesk/pkg/model"
)

func RegisterElevenLabsRoutes(app *echo.Echo,
	re *middleware.RequestExtractor,
	cl *config.ModelConfigLoader,
	ml *model.ModelLoader,
	appConfig *config.ApplicationConfig) {

	// Elevenlabs
	ttsHandler := elevenlabs.TTSEndpoint(cl, ml, appConfig)
	app.POST("/v1/text-to-speech/:voice-id",
		ttsHandler,
		re.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_TTS)),
		re.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.ElevenLabsTTSRequest) }))

	soundGenHandler := elevenlabs.SoundGenerationEndpoint(cl, ml, appConfig)
	app.POST("/v1/sound-generation",
		soundGenHandler,
		re.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_SOUND_GENERATION)),
		re.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.ElevenLabsSoundGenerationRequest) }))

}
