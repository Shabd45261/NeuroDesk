# Kokoro TTS Backend for NeuroDesk

This is a gRPC server backend for NeuroDesk that uses the Kokoro TTS pipeline.

## Creating a separate environment for kokoro project

```bash
make kokoro
```

## Testing the gRPC server

```bash
make test
```

## Features

- Lightweight TTS model with 82 million parameters
- Apache-licensed weights
- Fast and cost-efficient
- Multi-language support
- Multiple voice options