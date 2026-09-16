package routes

import (
	"github.com/labstack/echo/v4"
	echomiddleware "github.com/labstack/echo/v4/middleware"
	"github.com/mudler/NeuroDesk/core/application"
	"github.com/mudler/NeuroDesk/core/config"
	"github.com/mudler/NeuroDesk/core/http/endpoints/neurodesk"
	mcpTools "github.com/mudler/NeuroDesk/core/http/endpoints/mcp"
	"github.com/mudler/NeuroDesk/core/http/middleware"
	"github.com/mudler/NeuroDesk/core/schema"
	compressionservice "github.com/mudler/NeuroDesk/core/services/compression"
	"github.com/mudler/NeuroDesk/core/services/galleryop"
	"github.com/mudler/NeuroDesk/core/services/monitoring"
	"github.com/mudler/NeuroDesk/core/services/nodes"
	"github.com/mudler/NeuroDesk/core/services/routing/pii"
	"github.com/mudler/NeuroDesk/core/services/routing/piiadapter"
	"github.com/mudler/NeuroDesk/core/templates"
	"github.com/mudler/NeuroDesk/internal"
	"github.com/mudler/NeuroDesk/pkg/model"
	"github.com/mudler/NeuroDesk/pkg/tokens"
	echoswagger "github.com/swaggo/echo-swagger"
)

func RegisterNeuroDeskRoutes(router *echo.Echo,
	requestExtractor *middleware.RequestExtractor,
	cl *config.ModelConfigLoader,
	ml *model.ModelLoader,
	appConfig *config.ApplicationConfig,
	galleryService *galleryop.GalleryService,
	opcache *galleryop.OpCache,
	evaluator *templates.Evaluator,
	app *application.Application,
	adminMiddleware echo.MiddlewareFunc,
	mcpJobsMw echo.MiddlewareFunc,
	mcpMw echo.MiddlewareFunc) {

	// Themed index first, then the library's wildcard for its own assets.
	RegisterSwaggerTheme(router)
	router.GET("/swagger/*", echoswagger.EchoWrapHandler(func(c *echoswagger.Config) {
		c.URLs = []string{"doc.json"}
	}))

	// NeuroDesk API endpoints
	if !appConfig.DisableGalleryEndpoint {
		// Import model page
		router.GET("/import-model", func(c echo.Context) error {
			return c.Render(200, "views/model-editor", map[string]any{
				"Title":                  "NeuroDesk - Import Model",
				"BaseURL":                middleware.BaseURL(c),
				"Version":                internal.PrintableVersion(),
				"DisableRuntimeSettings": appConfig.DisableRuntimeSettings,
			})
		}, adminMiddleware)

		// Edit model page
		router.GET("/models/edit/:name", neurodesk.GetEditModelPage(cl, appConfig), adminMiddleware)
		modelGalleryEndpointService := neurodesk.CreateModelGalleryEndpointService(appConfig.Galleries, appConfig.BackendGalleries, appConfig.SystemState, galleryService, cl)
		router.POST("/models/apply", modelGalleryEndpointService.ApplyModelGalleryEndpoint(), adminMiddleware)
		router.POST("/models/delete/:name", modelGalleryEndpointService.DeleteModelGalleryEndpoint(), adminMiddleware)

		router.GET("/models/available", modelGalleryEndpointService.ListModelFromGalleryEndpoint(appConfig.SystemState), adminMiddleware)
		router.GET("/models/galleries", modelGalleryEndpointService.ListModelGalleriesEndpoint(), adminMiddleware)
		router.GET("/models/jobs/:uuid", modelGalleryEndpointService.GetOpStatusEndpoint(), adminMiddleware)
		router.GET("/models/jobs", modelGalleryEndpointService.GetAllStatusEndpoint(), adminMiddleware)

		backendGalleryEndpointService := neurodesk.CreateBackendEndpointService(
			appConfig.BackendGalleries,
			appConfig.SystemState,
			galleryService,
			app.UpgradeChecker())
		router.POST("/backends/apply", backendGalleryEndpointService.ApplyBackendEndpoint(appConfig.SystemState), adminMiddleware)
		router.POST("/backends/delete/:name", backendGalleryEndpointService.DeleteBackendEndpoint(), adminMiddleware)
		router.GET("/backends", backendGalleryEndpointService.ListBackendsEndpoint(), adminMiddleware)
		router.GET("/backends/available", backendGalleryEndpointService.ListAvailableBackendsEndpoint(appConfig.SystemState, ClusterCapabilityProviderFor(app), ClusterInstalledProviderFor(app)), adminMiddleware)
		router.GET("/backends/known", backendGalleryEndpointService.ListKnownBackendsEndpoint(appConfig.SystemState), adminMiddleware)
		router.GET("/backends/galleries", backendGalleryEndpointService.ListBackendGalleriesEndpoint(), adminMiddleware)
		router.GET("/backends/jobs/:uuid", backendGalleryEndpointService.GetOpStatusEndpoint(), adminMiddleware)
		router.GET("/backends/upgrades", backendGalleryEndpointService.GetUpgradesEndpoint(), adminMiddleware)
		router.POST("/backends/upgrades/check", backendGalleryEndpointService.CheckUpgradesEndpoint(), adminMiddleware)
		router.POST("/backends/upgrade/:name", backendGalleryEndpointService.UpgradeBackendEndpoint(), adminMiddleware)
		// Custom model import endpoint
		router.POST("/models/import", neurodesk.ImportModelEndpoint(cl, galleryService, appConfig), adminMiddleware)

		// URI model import endpoint
		router.POST("/models/import-uri", neurodesk.ImportModelURIEndpoint(cl, appConfig, galleryService, opcache), adminMiddleware)

		// Custom model edit endpoint
		router.POST("/models/edit/:name", neurodesk.EditModelEndpoint(cl, galleryService, appConfig, modelRevisionLifecycleFor(app)), adminMiddleware)

		// List model aliases endpoint
		router.GET("/api/aliases", neurodesk.ListAliasesEndpoint(cl), adminMiddleware)

		// Toggle model enable/disable endpoint
		router.PUT("/models/toggle-state/:name/:action", neurodesk.ToggleStateModelEndpoint(cl, galleryService, appConfig, modelRevisionLifecycleFor(app)), adminMiddleware)

		// Toggle model pinned status endpoint
		router.PUT("/models/toggle-pinned/:name/:action", neurodesk.TogglePinnedModelEndpoint(cl, appConfig, func() {
			app.SyncPinnedModelsToWatchdog()
		}), adminMiddleware)

		// Reload models endpoint
		router.POST("/models/reload", neurodesk.ReloadModelsEndpoint(cl, appConfig), adminMiddleware)
	}

	detectionHandler := neurodesk.DetectionEndpoint(cl, ml, appConfig)
	router.POST("/v1/detection",
		detectionHandler,
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_DETECTION)),
		requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.DetectionRequest) }))

	depthHandler := neurodesk.DepthEndpoint(cl, ml, appConfig)
	router.POST("/v1/depth",
		depthHandler,
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_DEPTH)),
		requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.DepthRequest) }))

	// Face recognition endpoints
	faceMw := []echo.MiddlewareFunc{
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_FACE_RECOGNITION)),
	}
	router.POST("/v1/face/verify",
		neurodesk.FaceVerifyEndpoint(cl, ml, appConfig),
		append(faceMw, requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.FaceVerifyRequest) }))...)
	router.POST("/v1/face/analyze",
		neurodesk.FaceAnalyzeEndpoint(cl, ml, appConfig),
		append(faceMw, requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.FaceAnalyzeRequest) }))...)
	router.POST("/v1/face/embed",
		neurodesk.FaceEmbedEndpoint(cl, ml, appConfig),
		append(faceMw, requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.FaceEmbedRequest) }))...)
	router.POST("/v1/face/register",
		neurodesk.FaceRegisterEndpoint(cl, ml, appConfig, app.FaceRegistry()),
		append(faceMw, requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.FaceRegisterRequest) }))...)
	router.POST("/v1/face/identify",
		neurodesk.FaceIdentifyEndpoint(cl, ml, appConfig, app.FaceRegistry()),
		append(faceMw, requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.FaceIdentifyRequest) }))...)
	// Forget does not load a face model — it only needs the registry.
	router.POST("/v1/face/forget", neurodesk.FaceForgetEndpoint(app.FaceRegistry()))

	// Voice (speaker) recognition endpoints
	voiceMw := []echo.MiddlewareFunc{
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_SPEAKER_RECOGNITION)),
	}
	router.POST("/v1/voice/verify",
		neurodesk.VoiceVerifyEndpoint(cl, ml, appConfig),
		append(voiceMw, requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.VoiceVerifyRequest) }))...)
	router.POST("/v1/voice/analyze",
		neurodesk.VoiceAnalyzeEndpoint(cl, ml, appConfig),
		append(voiceMw, requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.VoiceAnalyzeRequest) }))...)
	router.POST("/v1/voice/embed",
		neurodesk.VoiceEmbedEndpoint(cl, ml, appConfig),
		append(voiceMw, requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.VoiceEmbedRequest) }))...)
	router.POST("/v1/voice/register",
		neurodesk.VoiceRegisterEndpoint(cl, ml, appConfig, app.VoiceRegistry()),
		append(voiceMw, requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.VoiceRegisterRequest) }))...)
	router.POST("/v1/voice/identify",
		neurodesk.VoiceIdentifyEndpoint(cl, ml, appConfig, app.VoiceRegistry()),
		append(voiceMw, requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.VoiceIdentifyRequest) }))...)
	// Forget does not load a voice model — it only needs the registry.
	router.POST("/v1/voice/forget", neurodesk.VoiceForgetEndpoint(app.VoiceRegistry()))

	// Progress of an in-flight cold load. Standard auth only: it explains a 503
	// the caller just received, so gating it behind admin (or a per-modality
	// feature) would hide the explanation from exactly the client that needs it.
	// Resolved per request, not at registration: distributed services are wired
	// during startup and a snapshot taken here could be nil forever.
	router.GET("/api/models/:id/load-status", neurodesk.ModelLoadStatusEndpoint(func() nodes.LoadJobStore {
		if d := app.Distributed(); d != nil && d.Registry != nil {
			return d.Registry
		}
		return nil
	}))

	voiceProfiles := app.VoiceProfileStore()
	router.GET("/api/voice-profiles", neurodesk.ListVoiceProfilesEndpoint(voiceProfiles))
	router.GET("/api/voice-profiles/:id/audio", neurodesk.ServeVoiceProfileAudioEndpoint(voiceProfiles))
	router.POST("/api/voice-profiles", neurodesk.CreateVoiceProfileEndpoint(voiceProfiles), adminMiddleware)
	router.DELETE("/api/voice-profiles/:id", neurodesk.DeleteVoiceProfileEndpoint(voiceProfiles), adminMiddleware)

	ttsHandler := neurodesk.TTSEndpoint(cl, ml, appConfig, voiceProfiles)
	router.POST("/tts",
		ttsHandler,
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_TTS)),
		requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.TTSRequest) }))

	// audio transform (echo cancellation, noise suppression, voice conversion, etc.)
	audioTransformHandler := neurodesk.AudioTransformEndpoint(cl, ml, appConfig)
	audioTransformMiddleware := []echo.MiddlewareFunc{
		middleware.TraceMiddleware(app),
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_AUDIO_TRANSFORM)),
		requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.AudioTransformRequest) }),
	}
	router.POST("/audio/transformations", audioTransformHandler, audioTransformMiddleware...)
	router.POST("/audio/transform", audioTransformHandler, audioTransformMiddleware...)

	// audio transform streaming WS (sits before the request-extractor pipeline —
	// the upgrade is handled by the endpoint itself).
	router.GET("/audio/transformations/stream",
		neurodesk.AudioTransformStreamEndpoint(app),
		middleware.TraceMiddleware(app))

	vadHandler := neurodesk.VADEndpoint(cl, ml, appConfig)
	vadNodeHeader := middleware.ExposeNodeHeader(appConfig)
	router.POST("/vad",
		vadHandler,
		vadNodeHeader,
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_VAD)),
		requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.VADRequest) }))
	router.POST("/v1/vad",
		vadHandler,
		vadNodeHeader,
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_VAD)),
		requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.VADRequest) }))

	// Stores
	router.POST("/stores/set", neurodesk.StoresSetEndpoint(ml, cl, appConfig))
	router.POST("/stores/delete", neurodesk.StoresDeleteEndpoint(ml, cl, appConfig))
	router.POST("/stores/get", neurodesk.StoresGetEndpoint(ml, cl, appConfig))
	router.POST("/stores/find", neurodesk.StoresFindEndpoint(ml, cl, appConfig))

	if !appConfig.DisableMetrics {
		router.GET("/metrics", neurodesk.NeuroDeskMetricsEndpoint(), adminMiddleware)
	}

	videoHandler := neurodesk.VideoEndpoint(cl, ml, appConfig)
	router.POST("/video",
		videoHandler,
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_VIDEO)),
		requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.VideoRequest) }))

	model3dHandler := neurodesk.Model3DEndpoint(cl, ml, appConfig)
	router.POST("/3d/generations",
		model3dHandler,
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_3D)),
		requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.Model3DRequest) }))
	router.POST("/3d/remesh",
		neurodesk.Model3DRemeshEndpoint(ml, appConfig),
		echomiddleware.BodyLimit("513M"),
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_3D)),
		requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.Model3DRemeshRequest) }))

	// Backend Statistics Module
	// TODO: Should these use standard middlewares? Refactor later, they are extremely simple.
	backendMonitorService := monitoring.NewBackendMonitorService(ml, cl, appConfig) // Split out for now
	router.GET("/backend/monitor", neurodesk.BackendMonitorEndpoint(backendMonitorService), adminMiddleware)
	router.POST("/backend/shutdown", neurodesk.BackendShutdownEndpoint(backendMonitorService), adminMiddleware)
	// /backend/load is the inverse of /backend/shutdown: pre-load a model (or all
	// of a realtime pipeline's sub-models) into memory so clients can drive
	// warm-up explicitly instead of paying the cold-start cost on first use.
	router.POST("/backend/load", neurodesk.LoadModelEndpoint(cl, ml, appConfig), adminMiddleware)
	// The v1/* urls are exactly the same as above - makes local e2e testing easier if they are registered.
	router.GET("/v1/backend/monitor", neurodesk.BackendMonitorEndpoint(backendMonitorService), adminMiddleware)
	router.POST("/v1/backend/shutdown", neurodesk.BackendShutdownEndpoint(backendMonitorService), adminMiddleware)
	router.POST("/v1/backend/load", neurodesk.LoadModelEndpoint(cl, ml, appConfig), adminMiddleware)

	// Traces and backend logs (monitoring)
	router.GET("/api/traces", neurodesk.GetAPITracesEndpoint(), adminMiddleware)
	// Registered before /:id so "summary" is not captured as a trace ID.
	router.GET("/api/traces/summary", neurodesk.GetAPITracesSummaryEndpoint(), adminMiddleware)
	router.GET("/api/traces/:id", neurodesk.GetAPITraceEndpoint(), adminMiddleware)
	router.POST("/api/traces/clear", neurodesk.ClearAPITracesEndpoint(), adminMiddleware)
	router.GET("/api/backend-traces", neurodesk.GetBackendTracesEndpoint(), adminMiddleware)
	router.GET("/api/backend-traces/:id", neurodesk.GetBackendTraceEndpoint(), adminMiddleware)
	router.POST("/api/backend-traces/clear", neurodesk.ClearBackendTracesEndpoint(), adminMiddleware)
	// Backend logs — standalone only (distributed mode uses node-proxied routes)
	if !appConfig.Distributed.Enabled {
		router.GET("/api/backend-logs", neurodesk.ListBackendLogsEndpoint(ml), adminMiddleware)
		router.GET("/api/backend-logs/:modelId", neurodesk.GetBackendLogsEndpoint(ml), adminMiddleware)
		router.POST("/api/backend-logs/:modelId/clear", neurodesk.ClearBackendLogsEndpoint(ml), adminMiddleware)
		router.GET("/ws/backend-logs/:modelId", neurodesk.BackendLogsWebSocketEndpoint(ml), adminMiddleware)
	}

	// p2p
	router.GET("/api/p2p", neurodesk.ShowP2PNodes(appConfig), adminMiddleware)
	router.GET("/api/p2p/token", neurodesk.ShowP2PToken(appConfig), adminMiddleware)

	// Score (logprob over candidate continuations) — admin-only smoke-test
	// surface for the gRPC Score primitive. Production consumers should
	// use application.ScorerFactory() directly rather than HTTP.
	router.POST("/api/score", neurodesk.ScoreEndpoint(cl, ml, appConfig), adminMiddleware)

	router.GET("/version", func(c echo.Context) error {
		return c.JSON(200, struct {
			Version string `json:"version"`
		}{Version: internal.PrintableVersion()})
	})

	// Agent discovery endpoint
	router.GET("/.well-known/neurodesk.json", func(c echo.Context) error {
		monitoringRoutes := map[string]string{
			"metrics":              "/metrics",
			"backend_monitor":      "/backend/monitor",
			"backend_shutdown":     "/backend/shutdown",
			"backend_load":         "/backend/load",
			"system":               "/system",
			"version":              "/version",
			"traces":               "/api/traces",
			"traces_summary":       "/api/traces/summary",
			"trace":                "/api/traces/:id",
			"traces_clear":         "/api/traces/clear",
			"backend_traces":       "/api/backend-traces",
			"backend_trace":        "/api/backend-traces/:id",
			"backend_traces_clear": "/api/backend-traces/clear",
		}
		if !appConfig.Distributed.Enabled {
			monitoringRoutes["backend_logs"] = "/api/backend-logs"
			monitoringRoutes["backend_logs_model"] = "/api/backend-logs/:modelId"
			monitoringRoutes["backend_logs_clear"] = "/api/backend-logs/:modelId/clear"
			monitoringRoutes["backend_logs_ws"] = "/ws/backend-logs/:modelId"
		} else {
			monitoringRoutes["node_backend_logs"] = "/api/nodes/:id/backend-logs"
			monitoringRoutes["node_backend_logs_model"] = "/api/nodes/:id/backend-logs/:modelId"
			monitoringRoutes["node_backend_logs_ws"] = "/ws/nodes/:id/backend-logs/:modelId"
		}
		return c.JSON(200, map[string]any{
			"version": internal.PrintableVersion(),
			// Flat endpoint list for backwards compatibility
			"endpoints": map[string]any{
				"models":              "/v1/models",
				"models_capabilities": "/v1/models/capabilities",
				"chat_completions":    "/v1/chat/completions",
				"completions":         "/v1/completions",
				"embeddings":          "/v1/embeddings",
				"config_metadata":     "/api/models/config-metadata",
				"config_json":         "/api/models/config-json/:name",
				"config_patch":        "/api/models/config-json/:name",
				"autocomplete":        "/api/models/config-metadata/autocomplete/:provider",
				"vram_estimate":       "/api/models/vram-estimate",
				"model_load_status":   "/api/models/:id/load-status",
				"tts":                 "/tts",
				"voice_profiles":      "/api/voice-profiles",
				"transcription":       "/v1/audio/transcriptions",
				"image_generation":    "/v1/images/generations",
				"swagger":             "/swagger/index.html",
				"instructions":        "/api/instructions",
			},
			// Categorized endpoint groups for structured discovery
			"endpoint_groups": map[string]any{
				"openai_compatible": map[string]string{
					"models":               "/v1/models",
					"models_capabilities":  "/v1/models/capabilities",
					"chat_completions":     "/v1/chat/completions",
					"completions":          "/v1/completions",
					"embeddings":           "/v1/embeddings",
					"transcription":        "/v1/audio/transcriptions",
					"diarization":          "/v1/audio/diarization",
					"sound_classification": "/v1/audio/classification",
					"image_generation":     "/v1/images/generations",
				},
				"config_management": map[string]string{
					"config_metadata": "/api/models/config-metadata",
					"config_json":     "/api/models/config-json/:name",
					"config_patch":    "/api/models/config-json/:name",
					"autocomplete":    "/api/models/config-metadata/autocomplete/:provider",
					"vram_estimate":   "/api/models/vram-estimate",
				},
				"model_management": map[string]string{
					"list_gallery": "/models/available",
					"install":      "/models/apply",
					"delete":       "/models/delete/:name",
					"edit":         "/models/edit/:name",
					"import":       "/models/import",
					"reload":       "/models/reload",
					"list_aliases": "/api/aliases",
					"load_status":  "/api/models/:id/load-status",
				},
				"ai_functions": map[string]string{
					"tts":            "/tts",
					"voice_profiles": "/api/voice-profiles",
					"vad":            "/vad",
					"video":          "/video",
					"3d_generation":  "/3d/generations",
					"detection":      "/v1/detection",
					"tokenize":       "/v1/tokenize",
					"detokenize":     "/v1/detokenize",
				},
				"monitoring": monitoringRoutes,
				"mcp": map[string]string{
					"chat_completions": "/v1/mcp/chat/completions",
					"servers":          "/v1/mcp/servers/:model",
					"prompts":          "/v1/mcp/prompts/:model",
					"resources":        "/v1/mcp/resources/:model",
				},
				"p2p": map[string]string{
					"nodes": "/api/p2p",
					"token": "/api/p2p/token",
				},
				"agents": map[string]string{
					"tasks":   "/api/agent/tasks",
					"jobs":    "/api/agent/jobs",
					"execute": "/api/agent/jobs/execute",
				},
				"settings": map[string]string{
					"get":    "/api/settings",
					"update": "/api/settings",
				},
				"stores": map[string]string{
					"set":    "/stores/set",
					"get":    "/stores/get",
					"find":   "/stores/find",
					"delete": "/stores/delete",
				},
				"docs": map[string]string{
					"swagger":      "/swagger/index.html",
					"instructions": "/api/instructions",
				},
			},
			"capabilities": map[string]bool{
				"config_metadata": true,
				"config_patch":    true,
				"vram_estimate":   true,
				"mcp":             !appConfig.DisableMCP,
				"agents":          appConfig.AgentPool.Enabled,
				"p2p":             appConfig.P2PToken != "",
				"tracing":         true,
				"voice_profiles":  true,
			},
		})
	})

	// API instructions for agent discovery (no auth — agents should discover these without credentials)
	router.GET("/api/instructions", neurodesk.ListAPIInstructionsEndpoint())
	router.GET("/api/instructions/:name", neurodesk.GetAPIInstructionEndpoint())

	router.GET("/api/features", func(c echo.Context) error {
		return c.JSON(200, map[string]bool{
			"agents":            appConfig.AgentPool.Enabled,
			"mcp":               !appConfig.DisableMCP,
			"fine_tuning":       true,
			"quantization":      true,
			"distributed":       appConfig.Distributed.Enabled,
			"neurodesk_assistant": !appConfig.DisableNeuroDeskAssistant && app.NeuroDeskAssistant() != nil,
		})
	})

	router.GET("/system", neurodesk.SystemInformations(cl, ml, appConfig), adminMiddleware)

	// misc
	tokenizeHandler := neurodesk.TokenizeEndpoint(cl, ml, appConfig)
	router.POST("/v1/tokenize",
		tokenizeHandler,
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_TOKENIZE)),
		requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.TokenizeRequest) }))

	detokenizeHandler := neurodesk.DetokenizeEndpoint(cl, ml, appConfig)
	router.POST("/v1/detokenize",
		detokenizeHandler,
		requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_TOKENIZE)),
		requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.DetokenizeRequest) }))

	// MCP endpoint - supports both streaming and non-streaming modes
	// Note: streaming mode is NOT compatible with the OpenAI apis. We have a set which streams more states.
	if evaluator != nil && !appConfig.DisableMCP {
		chatCompressor := compressionservice.New(
			compressionservice.CounterFunc(tokens.CountMessages),
			compressionservice.NewInferenceSummarizer(cl, ml, appConfig),
		)
		var mcpNATS mcpTools.MCPNATSClient
		if d := app.Distributed(); d != nil {
			mcpNATS = d.Nats
		}
		mcpStreamHandler := neurodesk.MCPEndpoint(cl, ml, evaluator, appConfig, mcpNATS, chatCompressor)
		mcpStreamMiddleware := []echo.MiddlewareFunc{
			requestExtractor.BuildFilteredFirstAvailableDefaultModel(config.BuildUsecaseFilterFn(config.FLAG_CHAT)),
			requestExtractor.SetModelAndConfig(func() schema.NeuroDeskRequest { return new(schema.OpenAIRequest) }),
			func(next echo.HandlerFunc) echo.HandlerFunc {
				return func(c echo.Context) error {
					if err := requestExtractor.SetOpenAIRequest(c); err != nil {
						return err
					}
					return next(c)
				}
			},
			pii.RequestMiddleware(app.PIIRedactor(), app.PIIEvents(), piiadapter.OpenAI(), app.FallbackUser(), pii.WithNERResolver(app.PIINERResolver()), pii.WithPolicyResolver(app.PIIPolicyResolver())),
		}
		router.POST("/v1/mcp/chat/completions", mcpStreamHandler, mcpStreamMiddleware...)
		router.POST("/mcp/v1/chat/completions", mcpStreamHandler, mcpStreamMiddleware...)
		router.POST("/mcp/chat/completions", mcpStreamHandler, mcpStreamMiddleware...)

		// MCP server listing endpoint
		router.GET("/v1/mcp/servers/:model", neurodesk.MCPServersEndpoint(cl, appConfig, mcpNATS), mcpMw)

		// MCP prompts endpoints
		router.GET("/v1/mcp/prompts/:model", neurodesk.MCPPromptsEndpoint(cl, appConfig), mcpMw)
		router.POST("/v1/mcp/prompts/:model/:prompt", neurodesk.MCPGetPromptEndpoint(cl, appConfig), mcpMw)

		// MCP resources endpoints
		router.GET("/v1/mcp/resources/:model", neurodesk.MCPResourcesEndpoint(cl, appConfig), mcpMw)
		router.POST("/v1/mcp/resources/:model/read", neurodesk.MCPReadResourceEndpoint(cl, appConfig), mcpMw)

		// CORS proxy for client-side MCP connections
		router.GET("/api/cors-proxy", neurodesk.CORSProxyEndpoint(appConfig), mcpMw)
		router.POST("/api/cors-proxy", neurodesk.CORSProxyEndpoint(appConfig), mcpMw)
		router.OPTIONS("/api/cors-proxy", neurodesk.CORSProxyOptionsEndpoint())
	}

	// Agent job routes (MCP CI Jobs — requires MCP to be enabled)
	if app != nil && app.AgentJobService() != nil && !appConfig.DisableMCP {
		router.POST("/api/agent/tasks", neurodesk.CreateTaskEndpoint(app), mcpJobsMw)
		router.PUT("/api/agent/tasks/:id", neurodesk.UpdateTaskEndpoint(app), mcpJobsMw)
		router.DELETE("/api/agent/tasks/:id", neurodesk.DeleteTaskEndpoint(app), mcpJobsMw)
		router.GET("/api/agent/tasks", neurodesk.ListTasksEndpoint(app), mcpJobsMw)
		router.GET("/api/agent/tasks/:id", neurodesk.GetTaskEndpoint(app), mcpJobsMw)

		router.POST("/api/agent/jobs/execute", neurodesk.ExecuteJobEndpoint(app), mcpJobsMw)
		router.GET("/api/agent/jobs/:id", neurodesk.GetJobEndpoint(app), mcpJobsMw)
		router.GET("/api/agent/jobs", neurodesk.ListJobsEndpoint(app), mcpJobsMw)
		router.POST("/api/agent/jobs/:id/cancel", neurodesk.CancelJobEndpoint(app), mcpJobsMw)
		router.DELETE("/api/agent/jobs/:id", neurodesk.DeleteJobEndpoint(app), mcpJobsMw)

		router.POST("/api/agent/tasks/:name/execute", neurodesk.ExecuteTaskByNameEndpoint(app), mcpJobsMw)
	}

}
