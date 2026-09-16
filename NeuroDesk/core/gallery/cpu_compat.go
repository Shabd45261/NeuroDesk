package gallery

import (
	"github.com/mudler/NeuroDesk/pkg/system"
)

// RunsOnCPU reports whether this gallery entry can be executed through a
// CPU-only configuration: no GPU build, no GPU offload.
//
// The test reuses the capability machinery the installer and the runtime use.
// A CPU-only host is one whose detected capability is "default" (no usable
// GPU), so NewCapabilityState("default") is precisely how the rest of
// NeuroDesk decides what may run without a GPU; IsBackendCompatible then reads
// the model's own engine, which is what actually executes, not its download
// size or its tag lines.
//
// The url is deliberately not passed to IsBackendCompatible, for the same
// reason HostResolveEnv leaves it empty: a substring in a download link must
// never decide hardware compatibility. The engine name is the runtime, and the
// runtime is the only thing that answers this question.
func (m *GalleryModel) RunsOnCPU() bool {
	cpuOnly := system.NewCapabilityState("default")
	return cpuOnly.IsBackendCompatible(m.Backend, "")
}