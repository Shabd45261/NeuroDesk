package httpapi

import (
	"testing"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

func TestHTTPAPI(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "neurodesktools/httpapi test suite")
}
