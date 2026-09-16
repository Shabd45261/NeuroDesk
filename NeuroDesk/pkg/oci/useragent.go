package oci

import "github.com/mudler/NeuroDesk/internal"

// UserAgent returns the User-Agent string NeuroDesk sends on outbound registry
// requests (OCI registries and Ollama). It identifies the client as NeuroDesk
// and, when the binary was built with a version stamp, appends it, followed by
// the OS and architecture it is running on, so registries can attribute
// client-side usage to NeuroDesk rather than to the generic User-Agent of the
// underlying transport library.
func UserAgent() string {
	return internal.UserAgent()
}
