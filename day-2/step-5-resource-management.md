# Step 5 – Resource Management: Requests and Limits

![Resource Management](/img/day-2/05-resource-management-01.jpg)

![Requests & Limits](/img/day-2/05-resource-management-02.jpg)

![What if a pod uses too many resources?](/img/day-2/05-resource-management-03.jpg)

![Resource quota](/img/day-2/05-resource-management-04.jpg)

![Limit range](/img/day-2/05-resource-management-05.jpg)

![Verifying resource usage](/img/day-2/05-resource-management-06.jpg)

## Concept

Kubernetes schedules Pods based on **resource specifications**.
If you don't specify them, Kubernetes treats your pod as "Best Effort" — it gets whatever is left over, and is the first to be killed when things get tight.

Two key concepts:

1.  **Requests**: What the Pod *needs* to run. Kubernetes uses this for **scheduling**.
2.  **Limits**: The maximum the Pod *may consume*. Kubernetes uses this for **enforcement** (throttling or killing).

Key idea:

> Kubernetes is a **scheduler**, not a magician. It needs to know size requirements to pack boxes efficiently.

---

## 1. CPU Starvation (Throttling)

Refresher: **CPU is a compressible resource**.
If a process tries to use more CPU than its limit, Kubernetes **throttles** it (slows it down). It does *not* kill it.

### Hands-on

We have a service that calculates prime numbers in an infinite loop. It wants to eat 100% of a CPU core.

Deploy it with a strict limit (200 millicores):

```bash
kubectl apply -f k8s/day-2/prime-numbers.yaml
```

Check the pod status:

```bash
kubectl get pods
```

Check resource usage (might take a minute to show up):

```bash
kubectl top pod -l app=cpu-stress-test
```

You should see it capped around `200m` (or 0.2 cores).

### Relaxing the Limit

Let's give it more power. Edit the deployment:

```bash
kubectl edit deployment cpu-stress-test
```

Change `limits.cpu` from `200m` to `1000m` (1 core). Keys to edit:

```yaml
        resources:
          limits:
            cpu: 1000m
```

Save and exit. K8s will restart the pod with new config.
Wait a moment, then check `kubectl top pod` again.

**Observation**: The new pod should be consuming much more CPU (up to 1000m or whatever your node allows).

---

## 2. Memory OOM (Killing)

Refresher: **Memory is an incompressible resource**.
You cannot "slow down" memory usage. If a process needs RAM and hits its limit, the kernel **kills** it (OOMKilled).

### Hands-on

We have a service `memory-grabber` that allocates RAM in a loop.

Deploy it with a small limit (100Mi):

```bash
kubectl apply -f k8s/day-2/memory-grabber.yaml
```

Watch the pods:

```bash
kubectl get pods -w
```

**Observation**:
You will see the Pod status change from `Running` to `OOMKilled`, then `CrashLoopBackOff` as it restarts and dies again.

### Why?

The container tried to allocate more than `100Mi`. Kubernetes (via cgroups) said "NO", and the kernel terminated the process.

This is a **good thing**: it protects the *Node* and other *Pods* from a memory leak taking down the whole server.

---

## Cleanup

Delete the stress tests so they don't eat your laptop's battery:

```bash
kubectl delete -f k8s/day-2/prime-numbers.yaml
kubectl delete -f k8s/day-2/memory-grabber.yaml
```
