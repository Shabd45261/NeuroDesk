package mcp

import (
	"context"
	"fmt"
	"sync"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/mudler/xlog"

	neurodesktools "github.com/mudler/NeuroDesk/pkg/mcp/neurodesktools"
)

// NeuroDeskAssistantHolder owns the process-wide in-memory MCP server that
// exposes NeuroDesk's admin surface to the chat session when an admin opts in
// via metadata.neurodesk_assistant=true.
//
// Why a holder rather than per-request wiring:
//   - The MCP server is stateless across requests; building a new
//     net.Pipe()-backed pair per request and re-listing tools would burn cycles
//     for no benefit.
//   - The same in-process LocalToolExecutor can serve every assistant chat —
//     no NATS, no subprocesses, no synthetic admin credential.
//
// The holder is initialised once during Application bootstrap and is safe for
// concurrent use thereafter. If Initialize fails (or DisableNeuroDeskAssistant is
// true), Executor() returns an empty LocalToolExecutor and HasTools() is false,
// which the chat handler treats as "feature unavailable".
type NeuroDeskAssistantHolder struct {
	once    sync.Once
	initErr error
	tools   []MCPToolInfo
	opts    neurodesktools.Options

	serverSession *mcp.ServerSession
	clientSession *mcp.ClientSession
}

// NewNeuroDeskAssistantHolder returns an uninitialised holder. Call Initialize
// once during application start.
func NewNeuroDeskAssistantHolder() *NeuroDeskAssistantHolder {
	return &NeuroDeskAssistantHolder{}
}

// Initialize wires the in-memory server+client pair and discovers the tool
// list. Subsequent calls are no-ops; the first error is sticky.
func (h *NeuroDeskAssistantHolder) Initialize(ctx context.Context, client neurodesktools.NeuroDeskClient, opts neurodesktools.Options) error {
	h.once.Do(func() {
		t1, t2 := mcp.NewInMemoryTransports()
		srv := neurodesktools.NewServer(client, opts)

		serverSession, err := srv.Connect(ctx, t1, nil)
		if err != nil {
			h.initErr = fmt.Errorf("connect neurodesk-assistant server: %w", err)
			return
		}
		h.serverSession = serverSession

		c := mcp.NewClient(&mcp.Implementation{Name: "NeuroDesk-assistant", Version: "v1"}, nil)
		clientSession, err := c.Connect(ctx, t2, nil)
		if err != nil {
			h.initErr = fmt.Errorf("connect neurodesk-assistant client: %w", err)
			return
		}
		h.clientSession = clientSession

		// Pre-discover tools so the first chat request doesn't pay for a
		// list_tools round-trip.
		named := []NamedSession{{Name: "neurodesk", Type: "inmemory", Session: clientSession}}
		tools, err := DiscoverMCPTools(ctx, named)
		if err != nil {
			h.initErr = fmt.Errorf("discover neurodesk-assistant tools: %w", err)
			return
		}
		h.tools = tools
		h.opts = opts

		xlog.Info("NeuroDesk Assistant in-memory MCP server initialised",
			"tools", len(tools),
			"read_only", opts.DisableMutating,
		)
	})
	return h.initErr
}

// Executor returns a tool executor backed by the holder's cached tools.
// When the holder failed to initialise (or was never initialised), the
// returned executor is empty — HasTools() is false.
func (h *NeuroDeskAssistantHolder) Executor() ToolExecutor {
	if h == nil || h.initErr != nil {
		return &LocalToolExecutor{}
	}
	return &LocalToolExecutor{tools: h.tools}
}

// SystemPrompt returns the assembled embedded system prompt, freshly
// assembled on every call so a runtime change to the bootstrap model is
// reflected immediately. Returns "" if the holder failed to initialise.
func (h *NeuroDeskAssistantHolder) SystemPrompt() string {
	if h == nil || h.initErr != nil {
		return ""
	}
	return neurodesktools.SystemPrompt(h.opts)
}

// HasTools reports whether the holder is initialised and has tools available.
func (h *NeuroDeskAssistantHolder) HasTools() bool {
	return h != nil && h.initErr == nil && len(h.tools) > 0
}

// Close tears down the in-memory transport pair. Safe to call multiple times.
// Intended for graceful shutdown.
func (h *NeuroDeskAssistantHolder) Close() error {
	if h == nil {
		return nil
	}
	if h.clientSession != nil {
		_ = h.clientSession.Close()
	}
	if h.serverSession != nil {
		_ = h.serverSession.Wait()
	}
	return nil
}
