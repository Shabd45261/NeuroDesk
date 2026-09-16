package cli

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	cliContext "github.com/mudler/NeuroDesk/core/cli/context"
	neurodesktools "github.com/mudler/NeuroDesk/pkg/mcp/neurodesktools"
	"github.com/mudler/NeuroDesk/pkg/mcp/neurodesktools/httpapi"
)

// MCPServerCMD runs the NeuroDesk admin tool surface as a stdio MCP server,
// targeting a remote NeuroDesk instance over its HTTP API. The same Go package
// that powers the in-process NeuroDesk Assistant chat modality is used here —
// only the NeuroDeskClient implementation differs (httpapi instead of inproc).
type MCPServerCMD struct {
	Target   string `env:"NEURODESK_MCP_TARGET" default:"http://localhost:8080" help:"NeuroDesk base URL"`
	APIKey   string `env:"NEURODESK_API_KEY" help:"Bearer API key for the target NeuroDesk"`
	ReadOnly bool   `help:"Skip registration of mutating tools (install/delete/edit/upgrade/etc.) so the assistant can browse without changing remote state"`
}

func (m *MCPServerCMD) Run(_ *cliContext.Context) error {
	if m.Target == "" {
		return fmt.Errorf("--target / NEURODESK_MCP_TARGET is required")
	}

	client := httpapi.New(m.Target, m.APIKey)
	srv := neurodesktools.NewServer(client, neurodesktools.Options{
		DisableMutating: m.ReadOnly,
	})

	// Stdio: the host (e.g. Claude Desktop, Cursor, mcphost) talks JSON-RPC
	// over our stdin/stdout. There's nothing else this process should print —
	// every other goroutine logging to stderr is fine, but stdout is sacred.
	//
	// Honour SIGINT/SIGTERM so a Ctrl-C from the host or `kill -TERM` from
	// process supervision gives srv.Run a chance to drain in-flight calls
	// before exiting.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return srv.Run(ctx, &mcp.StdioTransport{})
}
