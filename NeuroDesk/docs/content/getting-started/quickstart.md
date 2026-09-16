+++
disableToc = false
title = "Quickstart"
weight = 2
url = '/basics/getting_started/'
icon = "rocket_launch"
+++

![Quickstart journey: install, start NeuroDesk, pick a model, then chat or curl the API](/images/diagrams/quickstart-journey.png)

**NeuroDesk** is a free, open-source alternative to OpenAI (Anthropic, etc.), functioning as a drop-in replacement REST API for local inferencing. It allows you to run [LLMs]({{% relref "features/text-generation" %}}), generate images, and produce audio, all locally or on-premises with consumer-grade hardware, supporting multiple model families and architectures.

NeuroDesk comes with a **built-in web interface** for chatting with models, managing installations, configuring AI agents, and more, with no extra tools needed.

{{% notice tip %}}

**Security considerations**

If you are exposing NeuroDesk remotely, make sure you protect the API endpoints adequately. You have two options:

- **Simple API keys**: Run with `NEURODESK_API_KEY=your-key` to gate access. API keys grant full admin access with no role separation.
- **User authentication**: Run with `NEURODESK_AUTH=true` for multi-user support with admin/user roles, OAuth login, per-user API keys, and usage tracking. See [Authentication & Authorization]({{%relref "features/authentication" %}}) for details.

 {{% /notice %}}

## Quickstart

This guide assumes you have already [installed NeuroDesk](/installation/). If you haven't installed it yet, see the [Installation guide](/installation/) first.

### Starting NeuroDesk

Once installed, start NeuroDesk. For Docker installations:

```bash
docker run -p 8080:8080 --name neurodesk -ti neurodesk/neurodesk:latest
```

For GPU acceleration, choose the image that matches your hardware:

| Hardware | Docker image |
|----------|-------------|
| CPU only | `neurodesk/neurodesk:latest` |
| NVIDIA CUDA | `neurodesk/neurodesk:latest-gpu-nvidia-cuda-12` |
| AMD (ROCm) | `neurodesk/neurodesk:latest-gpu-hipblas` |
| Intel GPU | `neurodesk/neurodesk:latest-gpu-intel` |
| Vulkan | `neurodesk/neurodesk:latest-gpu-vulkan` |

For NVIDIA GPUs, add `--gpus all`. For AMD/Intel/Vulkan, add the appropriate `--device` flags. See [Container images]({{% relref "getting-started/containers" %}}) for the full reference.

### Using the Web Interface

Open **http://localhost:8080** in your browser. The web interface lets you:

- **Chat** with any installed model
- **Explore, install, and manage models** from the Models page
- **Generate images**, audio, and more
- **Create and manage AI agents** with MCP tool support
- **Monitor system resources** and loaded models
- **Configure settings** including GPU acceleration

To get your first chat working:

1. Open **Models → Explore** and search for `qwen3-4b`. Click **Install** on the `qwen3-4b` entry and wait for the download to finish. (`qwen3-4b` is a small, CPU-friendly Qwen3 model that also supports tool calling, so you can reuse it later in the [Build your first agent]({{% relref "getting-started/first-agent" %}}) walkthrough.)
2. Open the **Chat** page, select `qwen3-4b` from the model dropdown, type a message, and send it. You should get a reply within a few seconds.

To correct an earlier prompt or response without running the model again, hover
over the saved message and select **Edit**. **Save** updates that conversation's
local history; **Cancel** discards the draft.

### Downloading models from the CLI

When starting NeuroDesk (either via Docker or via CLI) you can specify as argument a list of models to install automatically before starting the API, for example:

```bash
neurodesk run qwen3-4b
neurodesk run huggingface://TheBloke/phi-2-GGUF/phi-2.Q8_0.gguf
neurodesk run ollama://gemma:2b
neurodesk run https://gist.githubusercontent.com/.../phi-2.yaml
neurodesk run oci://neurodesk/phi-2:latest
```

You can also manage models with the CLI:

```bash
neurodesk models list          # List available models in the gallery
neurodesk models install <name> # Install a model
```

{{% notice tip %}}
**Automatic Backend Detection**: When you install models from the gallery or YAML files, NeuroDesk automatically detects your system's GPU capabilities (NVIDIA, AMD, Intel) and downloads the appropriate backend. For advanced configuration options, see [GPU Acceleration]({{% relref "features/gpu-acceleration#automatic-backend-detection" %}}).
 {{% /notice %}}

For a full list of options, run NeuroDesk with `--help`, or see the [Linux Installation guide]({{% relref "getting-started/linux" %}}).

### Using the API

NeuroDesk exposes an OpenAI-compatible API. You can use it with any OpenAI SDK or client by pointing it to `http://localhost:8080`. For example:

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-4b",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

NeuroDesk also supports the **Anthropic Messages API**, the **Open Responses API**, and more. See [Try it out]({{% relref "getting-started/try-it-out" %}}) for examples of all supported endpoints.

## Built-in AI Agents

NeuroDesk includes a built-in AI agent platform with support for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). You can create agents that use tools, browse the web, execute code, and interact with external services, all from the web interface.

To get started with agents:

1. Install a model that supports tool calling (most modern LLMs do)
2. Navigate to the **Agents** page in the web interface
3. Create a new agent, configure its tools and system prompt
4. Start chatting; the agent will use tools autonomously

No separate installation required: agents are part of NeuroDesk. For a full step-by-step walkthrough, see [Build your first agent]({{% relref "getting-started/first-agent" %}}).

## Scaling with Distributed Mode

For production deployments or when you need more compute, NeuroDesk supports distributed mode with horizontal scaling:

- **Distributed nodes**: Add GPU worker nodes that self-register with a frontend coordinator
- **P2P federation**: Connect multiple NeuroDesk instances for load-balanced inference
- **Model sharding**: Split large models across multiple machines

See the **Nodes** page in the web interface or the [Distributed inference docs]({{% relref "features/distributed_inferencing" %}}) for setup instructions.

## What's Next?

There is much more to explore! NeuroDesk supports video generation, voice cloning, embeddings, image understanding, and more. Check out:

- [Container images reference]({{% relref "getting-started/containers" %}})
- [Try the API endpoints]({{% relref "getting-started/try-it-out" %}})
- [All features]({{% relref "features" %}})
- [Model gallery](https://models.localai.io)
- [Run models manually]({{% relref "getting-started/models" %}})
- [Build from source]({{% relref "getting-started/build" %}})
- [Examples](https://github.com/mudler/NeuroDesk/tree/master/examples#examples)
