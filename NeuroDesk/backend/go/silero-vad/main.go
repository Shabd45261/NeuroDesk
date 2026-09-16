package main

// Note: this is started internally by NeuroDesk and a server is allocated for each model

import (
	"flag"

	grpc "github.com/mudler/NeuroDesk/pkg/grpc"
)

var (
	addr = flag.String("addr", "localhost:50051", "the address to connect to")
)

func main() {
	flag.Parse()

	if err := grpc.StartServer(*addr, &VAD{}); err != nil {
		panic(err)
	}
}
