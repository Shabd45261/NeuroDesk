package main

import (
	"flag"

	grpc "github.com/mudler/NeuroDesk/pkg/grpc"
)

var addr = flag.String("addr", "localhost:50051", "the address to connect to")

func main() {
	flag.Parse()
	if err := grpc.StartServer(*addr, &Opus{}); err != nil {
		panic(err)
	}
}
