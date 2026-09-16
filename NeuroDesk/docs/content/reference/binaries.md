
+++
disableToc = false
title = "NeuroDesk binaries"
weight = 26
+++

NeuroDesk binaries are available for both Linux and MacOS platforms and can be executed directly from your command line. These binaries are continuously updated and hosted on [our GitHub Releases page](https://github.com/mudler/NeuroDesk/releases). This method also supports Windows users via the Windows Subsystem for Linux (WSL).

### macOS Download

You can download the DMG and install the application:

<a href="https://github.com/mudler/NeuroDesk/releases/latest/download/NeuroDesk.dmg">
  <img src="https://img.shields.io/badge/Download-macOS-blue?style=for-the-badge&logo=apple&logoColor=white" alt="Download NeuroDesk for macOS"/>
</a> 

> Note: the DMGs are not signed by Apple as quarantined. See https://github.com/mudler/NeuroDesk/issues/6268 for a workaround, fix is tracked here: https://github.com/mudler/NeuroDesk/issues/6244

Otherwise, use the following one-liner command in your terminal to download and run NeuroDesk on Linux or MacOS:

```bash
curl -Lo neurodesk "https://github.com/mudler/NeuroDesk/releases/download/{{< version >}}/neurodesk-$(uname -s)-$(uname -m)" && chmod +x neurodesk && ./neurodesk
```

Otherwise, here are the links to the binaries:

| OS | Link | 
| --- | --- |
| Linux (amd64)  | [Download](https://github.com/mudler/NeuroDesk/releases/download/{{< version >}}/neurodesk-Linux-x86_64) |
| Linux (arm64)  | [Download](https://github.com/mudler/NeuroDesk/releases/download/{{< version >}}/neurodesk-Linux-arm64) |
| MacOS (arm64)  | [Download](https://github.com/mudler/NeuroDesk/releases/download/{{< version >}}/neurodesk-Darwin-arm64) |


{{% notice icon="⚡" context="warning" %}}
Binaries do have limited support compared to container images:

- Python-based backends are not shipped with binaries (e.g. `diffusers` or `transformers`)
- MacOS binaries and Linux-arm64 do not ship TTS nor `stablediffusion-cpp` backends
- Linux binaries do not ship `stablediffusion-cpp` backend
 {{% /notice %}}
