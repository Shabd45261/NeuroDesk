package neurodesk_test

import (
	"testing"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

func TestNeuroDeskEndpoints(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "NeuroDesk Endpoints test suite")
}
