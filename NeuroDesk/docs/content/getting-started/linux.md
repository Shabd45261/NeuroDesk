---
title: "Linux Installation"
description: "Install NeuroDesk on Linux using binaries"
weight: 9
url: '/installation/linux/'
---

## Manual Installation

### Download Binary

You can manually download the appropriate binary for your system from the [releases page](https://github.com/mudler/NeuroDesk/releases):

1. Go to  [GitHub Releases](https://github.com/mudler/NeuroDesk/releases)
2. Download the binary for your architecture (amd64, arm64, etc.)
3. Make it executable:

```bash
chmod +x neurodesk-*
```

4. Run NeuroDesk:

```bash
./neurodesk-*
```

### Run your first model

Starting the binary on its own gives you an empty server. To get a working chat right away, run NeuroDesk with a model name and it will download and serve it from the gallery:

```bash
./neurodesk-* run qwen3-4b
```

Once it is ready, open the WebUI at `http://localhost:8080` or send a request to the API:

```bash
curl http://localhost:8080/v1/chat/completions -H "Content-Type: application/json" -d '{
  "model": "qwen3-4b",
  "messages": [{"role": "user", "content": "Hello!"}]
}'
```

### System Requirements

Hardware requirements vary based on:
- Model size
- Quantization method
- Backend used

For performance benchmarks with different backends like `llama.cpp`, visit [this link](https://github.com/ggerganov/llama.cpp#memorydisk-requirements).

## Configuration

After installation, you can:

- Access the WebUI at `http://localhost:8080`
- Configure models in the models directory
- Customize settings via environment variables or config files

## Start NeuroDesk on demand with systemd

NeuroDesk accepts a single TCP listener passed through the systemd socket
activation protocol. This lets systemd listen on the public port and start
NeuroDesk only when the first client connects.

Create `/etc/systemd/system/neurodesk.socket`:

```ini
[Unit]
Description=NeuroDesk API socket

[Socket]
ListenStream=8080
NoDelay=true

[Install]
WantedBy=sockets.target
```

Create the matching `/etc/systemd/system/neurodesk.service`:

```ini
[Unit]
Description=NeuroDesk

[Service]
Type=simple
User=neurodesk
Group=neurodesk
ExecStart=/usr/local/bin/neurodesk run
WorkingDirectory=/var/lib/neurodesk
```

Adjust the user, binary path, working directory, and model configuration for
your installation. Then enable the socket, not the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now neurodesk.socket
```

The first connection to port 8080 starts `neurodesk.service`; systemd holds that
connection until NeuroDesk is ready to accept it. `NEURODESK_ADDRESS` and
`--address` are ignored while an inherited listener is present. NeuroDesk
rejects activation with multiple stream listeners so it cannot silently choose
the wrong endpoint.

For a Podman-managed container, configure Podman to preserve and pass the
systemd socket file descriptor into the container. The NeuroDesk process inside
the container consumes the same activation protocol.

Activation needs both `LISTEN_PID` and `LISTEN_FDS`. If only one of them is set,
NeuroDesk ignores them and binds `--address` as usual. A container engine started
from a socket-activated system unit can leak a bare `LISTEN_PID` into every
container it spawns, and that is not an activation attempt.

## Next Steps

- [Try it out with examples](/basics/try/)
- [Learn about available models](/models/)
- [Configure GPU acceleration](/features/gpu-acceleration/)
- [Customize your configuration](/advanced/model-configuration/)
