+++
disableToc = false
title = "Run with Kubernetes"
weight = 11
url = '/basics/kubernetes/'
ico = "rocket_launch"
+++


For installing NeuroDesk in Kubernetes, the deployment file from the `examples` can be used and customized as preferred:

```
kubectl apply -f https://raw.githubusercontent.com/mudler/NeuroDesk-examples/refs/heads/main/kubernetes/deployment.yaml
```

For Nvidia GPUs:

```
kubectl apply -f https://raw.githubusercontent.com/mudler/NeuroDesk-examples/refs/heads/main/kubernetes/deployment-nvidia.yaml
```

Alternatively, the [helm chart](https://github.com/go-skynet/helm-charts) can be used as well:

```bash
helm repo add go-skynet https://go-skynet.github.io/helm-charts/
helm repo update
helm show values go-skynet/neurodesk > values.yaml


helm install neurodesk go-skynet/neurodesk -f values.yaml
```
