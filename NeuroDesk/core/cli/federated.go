package cli

import (
	"context"

	cliContext "github.com/mudler/NeuroDesk/core/cli/context"
	"github.com/mudler/NeuroDesk/core/p2p"
	"github.com/mudler/NeuroDesk/pkg/signals"
)

type FederatedCLI struct {
	Address            string `env:"NEURODESK_ADDRESS,ADDRESS" default:":8080" help:"Bind address for the API server" group:"api"`
	Peer2PeerToken     string `env:"NEURODESK_P2P_TOKEN,P2P_TOKEN,TOKEN" name:"p2p-token" aliases:"p2ptoken" help:"Token for P2P mode (optional; --p2ptoken is deprecated, use --p2p-token)" group:"p2p"`
	RandomWorker       bool   `env:"NEURODESK_RANDOM_WORKER,RANDOM_WORKER" default:"false" help:"Select a random worker from the pool" group:"p2p"`
	Peer2PeerNetworkID string `env:"NEURODESK_P2P_NETWORK_ID,P2P_NETWORK_ID" help:"Network ID for P2P mode, can be set arbitrarly by the user for grouping a set of instances." group:"p2p"`
	TargetWorker       string `env:"NEURODESK_TARGET_WORKER,TARGET_WORKER" help:"Target worker to run the federated server on" group:"p2p"`
}

func (f *FederatedCLI) Run(ctx *cliContext.Context) error {
	warnDeprecatedFlags()

	fs := p2p.NewFederatedServer(f.Address, p2p.NetworkID(f.Peer2PeerNetworkID, p2p.FederatedID), f.Peer2PeerToken, !f.RandomWorker, f.TargetWorker)

	c, cancel := context.WithCancel(context.Background())

	signals.RegisterGracefulTerminationHandler(func() {
		cancel()
	})

	return fs.Start(c)
}
