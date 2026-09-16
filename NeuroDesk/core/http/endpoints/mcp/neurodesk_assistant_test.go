package mcp

import (
	"context"
	"sync"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/mudler/NeuroDesk/core/config"
	"github.com/mudler/NeuroDesk/core/gallery"
	"github.com/mudler/NeuroDesk/core/schema"
	"github.com/mudler/NeuroDesk/core/services/modeladmin"
	neurodesktools "github.com/mudler/NeuroDesk/pkg/mcp/neurodesktools"
	"github.com/mudler/NeuroDesk/pkg/vram"
)

// stubClient is the minimum NeuroDeskClient impl needed to exercise the holder.
// It returns deterministic, non-zero values so we can assert tool dispatch.
type stubClient struct{}

func (stubClient) GallerySearch(_ context.Context, _ neurodesktools.GallerySearchQuery) ([]gallery.Metadata, error) {
	return []gallery.Metadata{{Name: "stub", Gallery: config.Gallery{Name: "stub-gallery"}}}, nil
}

func (stubClient) ListInstalledModels(_ context.Context, _ neurodesktools.Capability) ([]neurodesktools.InstalledModel, error) {
	return []neurodesktools.InstalledModel{{Name: "stub"}}, nil
}

func (stubClient) ListGalleries(_ context.Context) ([]config.Gallery, error) {
	return []config.Gallery{{Name: "stub-gallery", URL: "http://example"}}, nil
}

func (stubClient) GetJobStatus(_ context.Context, _ string) (*neurodesktools.JobStatus, error) {
	return &neurodesktools.JobStatus{ID: "stub", Processed: true}, nil
}

func (stubClient) GetModelConfig(_ context.Context, _ string) (*neurodesktools.ModelConfigView, error) {
	return &neurodesktools.ModelConfigView{Name: "stub"}, nil
}

func (stubClient) InstallModel(_ context.Context, _ neurodesktools.InstallModelRequest) (string, error) {
	return "stub-job", nil
}

func (stubClient) ImportModelURI(_ context.Context, _ neurodesktools.ImportModelURIRequest) (*neurodesktools.ImportModelURIResponse, error) {
	return &neurodesktools.ImportModelURIResponse{JobID: "stub-import"}, nil
}
func (stubClient) DeleteModel(_ context.Context, _ string) error { return nil }
func (stubClient) EditModelConfig(_ context.Context, _ string, _ map[string]any) error {
	return nil
}
func (stubClient) ReloadModels(_ context.Context) error { return nil }
func (stubClient) LoadModel(_ context.Context, model string) ([]string, error) {
	return []string{model}, nil
}
func (stubClient) SetAlias(_ context.Context, _, _ string) error {
	return nil
}
func (stubClient) ListAliases(_ context.Context) ([]neurodesktools.AliasInfo, error) {
	return nil, nil
}
func (stubClient) ListBackends(_ context.Context) ([]neurodesktools.Backend, error) {
	return []neurodesktools.Backend{{Name: "stub-backend", Installed: true}}, nil
}

func (stubClient) ListKnownBackends(_ context.Context) ([]schema.KnownBackend, error) {
	return []schema.KnownBackend{}, nil
}

func (stubClient) InstallBackend(_ context.Context, _ neurodesktools.InstallBackendRequest) (string, error) {
	return "stub-backend-job", nil
}

func (stubClient) UpgradeBackend(_ context.Context, _ string) (string, error) {
	return "stub-upgrade-job", nil
}

func (stubClient) SystemInfo(_ context.Context) (*neurodesktools.SystemInfo, error) {
	return &neurodesktools.SystemInfo{Version: "stub"}, nil
}

func (stubClient) ListNodes(_ context.Context) ([]neurodesktools.Node, error) {
	return []neurodesktools.Node{}, nil
}

func (stubClient) ListScheduling(_ context.Context) ([]neurodesktools.ModelSchedulingConfig, error) {
	return []neurodesktools.ModelSchedulingConfig{}, nil
}

func (stubClient) GetScheduling(_ context.Context, _ string) (*neurodesktools.ModelSchedulingConfig, error) {
	return &neurodesktools.ModelSchedulingConfig{}, nil
}

func (stubClient) SetScheduling(_ context.Context, _ neurodesktools.SetSchedulingRequest) (*neurodesktools.ModelSchedulingConfig, error) {
	return &neurodesktools.ModelSchedulingConfig{}, nil
}

func (stubClient) DeleteScheduling(_ context.Context, _ string) error {
	return nil
}

func (stubClient) SetNodeVRAMBudget(_ context.Context, _, _ string) error {
	return nil
}

func (stubClient) VRAMEstimate(_ context.Context, _ neurodesktools.VRAMEstimateRequest) (*vram.EstimateResult, error) {
	return &vram.EstimateResult{SizeDisplay: "stub"}, nil
}
func (stubClient) ToggleModelState(_ context.Context, _ string, _ modeladmin.Action) error {
	return nil
}
func (stubClient) ToggleModelPinned(_ context.Context, _ string, _ modeladmin.Action) error {
	return nil
}
func (stubClient) GetBranding(_ context.Context) (*neurodesktools.Branding, error) {
	return &neurodesktools.Branding{InstanceName: "NeuroDesk"}, nil
}

func (stubClient) SetBranding(_ context.Context, _ neurodesktools.SetBrandingRequest) (*neurodesktools.Branding, error) {
	return &neurodesktools.Branding{InstanceName: "NeuroDesk"}, nil
}

func (stubClient) ListVoiceProfiles(_ context.Context) ([]neurodesktools.VoiceProfile, error) {
	return []neurodesktools.VoiceProfile{}, nil
}

func (stubClient) CreateVoiceProfile(_ context.Context, _ neurodesktools.CreateVoiceProfileRequest) (*neurodesktools.VoiceProfile, error) {
	return &neurodesktools.VoiceProfile{Name: "stub-voice"}, nil
}

func (stubClient) DeleteVoiceProfile(_ context.Context, _ string) error {
	return nil
}

func (stubClient) GetUsageStats(_ context.Context, _ neurodesktools.UsageStatsQuery) (*neurodesktools.UsageStats, error) {
	return &neurodesktools.UsageStats{Viewer: neurodesktools.UsageViewer{ID: "stub", Name: "stub"}, Period: "month"}, nil
}

func (stubClient) GetPIIEvents(_ context.Context, _ neurodesktools.PIIEventsQuery) ([]neurodesktools.PIIEvent, error) {
	return nil, nil
}

func (stubClient) GetMiddlewareStatus(_ context.Context) (*neurodesktools.MiddlewareStatus, error) {
	return &neurodesktools.MiddlewareStatus{
		PII: neurodesktools.MiddlewarePIIStatus{
			EnabledGlobally: true,
			Models:          []neurodesktools.MiddlewarePIIModel{},
		},
	}, nil
}

func (stubClient) GetRouterDecisions(_ context.Context, _ neurodesktools.RouterDecisionsQuery) ([]neurodesktools.RouterDecision, error) {
	return []neurodesktools.RouterDecision{}, nil
}

var _ = Describe("NeuroDeskAssistantHolder", func() {
	var ctx context.Context

	BeforeEach(func() {
		ctx = context.Background()
	})

	It("Initialize wires the in-memory server, exposes tools, and dispatches", func() {
		h := NewNeuroDeskAssistantHolder()
		Expect(h.Initialize(ctx, stubClient{}, neurodesktools.Options{})).To(Succeed())
		Expect(h.HasTools()).To(BeTrue())
		Expect(h.SystemPrompt()).ToNot(BeEmpty())

		exec := h.Executor()
		Expect(exec.HasTools()).To(BeTrue())

		out, err := exec.ExecuteTool(ctx, "list_installed_models", `{"capability":"chat"}`)
		Expect(err).ToNot(HaveOccurred())
		Expect(out).ToNot(BeEmpty())
	})

	It("Initialize is exactly-once even under concurrent callers", func() {
		h := NewNeuroDeskAssistantHolder()

		// Concurrent Initialize calls — only one should actually wire the server.
		var wg sync.WaitGroup
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_ = h.Initialize(ctx, stubClient{}, neurodesktools.Options{})
			}()
		}
		wg.Wait()

		Expect(h.HasTools()).To(BeTrue())
	})

	It("methods are nil-safe on a nil holder", func() {
		var h *NeuroDeskAssistantHolder
		Expect(h.HasTools()).To(BeFalse())
		Expect(h.SystemPrompt()).To(BeEmpty())
		exec := h.Executor()
		// Nil-receiver Executor returns an empty LocalToolExecutor.
		Expect(exec).ToNot(BeNil())
		Expect(exec.HasTools()).To(BeFalse())
	})
})

func (stubClient) GetRouterCorpusStats(_ context.Context, routerModel string) (*neurodesktools.RouterCorpusStats, error) {
	return &neurodesktools.RouterCorpusStats{Router: routerModel, LabelCounts: map[string]int{}}, nil
}

func (stubClient) SeedRouterCorpus(_ context.Context, req neurodesktools.RouterCorpusSeedRequest) (*neurodesktools.RouterCorpusSeedResult, error) {
	return &neurodesktools.RouterCorpusSeedResult{Router: req.Router, LabelCounts: map[string]int{}}, nil
}

func (stubClient) ClearRouterCorpus(_ context.Context, routerModel string) (*neurodesktools.RouterCorpusClearResult, error) {
	return &neurodesktools.RouterCorpusClearResult{Router: routerModel}, nil
}
