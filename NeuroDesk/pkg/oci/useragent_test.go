package oci_test

import (
	"fmt"
	"runtime"

	"github.com/mudler/NeuroDesk/internal"
	. "github.com/mudler/NeuroDesk/pkg/oci"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("OCI", func() {
	Context("UserAgent", func() {
		var savedVersion string

		BeforeEach(func() {
			savedVersion = internal.Version
		})

		AfterEach(func() {
			internal.Version = savedVersion
		})

		It("identifies as NeuroDesk when no version is stamped", func() {
			internal.Version = ""
			Expect(UserAgent()).To(Equal(fmt.Sprintf("NeuroDesk (%s; %s)", runtime.GOOS, runtime.GOARCH)))
		})

		It("appends the build version when one is stamped", func() {
			internal.Version = "v3.2.1"
			Expect(UserAgent()).To(Equal(fmt.Sprintf("NeuroDesk/v3.2.1 (%s; %s)", runtime.GOOS, runtime.GOARCH)))
		})
	})
})
