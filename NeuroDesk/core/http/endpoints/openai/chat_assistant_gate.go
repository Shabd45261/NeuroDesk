package openai

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/mudler/NeuroDesk/core/http/auth"
)

// requireAssistantAccess gates a chat request that asked for the NeuroDesk
// Assistant tool surface (metadata.neurodesk_assistant=true). The assistant's
// in-process MCP server can install models, edit configs and trigger backend
// upgrades, so it must be admin-only — the chat route itself only enforces
// FeatureChat (default-on for every user). When auth is disabled the gate is
// a no-op; the operator already chose to trust every caller.
func requireAssistantAccess(c echo.Context, authEnabled bool) error {
	if !authEnabled {
		return nil
	}
	user := auth.GetUser(c)
	if user == nil || user.Role != auth.RoleAdmin {
		return echo.NewHTTPError(http.StatusForbidden, "neurodesk_assistant requires admin")
	}
	return nil
}
