# Step 8 – Scheduling: Where does my Pod go?

![Scheduling](/img/day-2/08-scheduling-01.jpg)
---
![Taints & Tolerations](/img/day-2/08-scheduling-02.jpg)
---
![Using Taints & Tolerations](/img/day-2/08-scheduling-03.jpg)
---
![Example use cases for Taints](/img/day-2/08-scheduling-04.jpg)
---
![Example use cases for Taints](/img/day-2/08-scheduling-05.jpg)
---
![Affinity & Anti-affinity](/img/day-2/08-scheduling-06.jpg)
---

## Concept

By default, the Kubernetes Scheduler places Pods on any available node that has enough resources.
However, often we want more control:

1.  **Node Affinity**: "I *love* this node" (e.g., has GPU, high CPU).
2.  **Taints & Tolerations**: "This node *hates* you" (e.g., reserved for admin, or maintenance mode).
3.  **Pod Affinity/Anti-Affinity**: "I want to be close to/far from *that* Pod" (e.g., HA spreading).

---

## 0. Preparation: Clean Slate

Let's clean up our cluster to see things clearly.

```bash
# Delete existing deployments
kubectl delete deployment --all
kubectl delete pod --all
```

Now, let's identify our nodes and give them "personalities".

```bash
kubectl get nodes
```

Label `k3d-day2-agent-1` as a "high performance" node:

```bash
kubectl label node k3d-day2-agent-1 hardware=high-cpu
```

Verify labels:
```bash
kubectl get nodes --show-labels
```

---

## 1. Node Affinity (Attraction)

We want our `prime-numbers` generator (from Step 5) to run **only** on the `high-cpu` node.

Edit `k8s/day-2/prime-numbers.yaml` and add the affinity block:

```yaml
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: hardware
                operator: In
                values:
                - high-cpu
      containers:
      # ...
```

Apply it:

```bash
kubectl apply -f k8s/day-2/prime-numbers.yaml
```

Check where it landed:

```bash
kubectl get pods -o wide
```

Matched? It should be on `k3d-day2-agent-1`.

**Experiment**: Delete the pod (`kubectl delete pod ...`). Watch it respawn. It will *always* go to `k3d-day2-agent-1`.
**Experiment**: Label `k3d-day2-agent-0` with `hardware=high-cpu` too. Now it can go to either!

---

## 2. Taints & Tolerations (Repulsion)

Now let's say `k3d-day2-agent-1` is TOO powerful. We want to **reserve** it for special tasks only. We don't want regular junk running there.

**Taint the node**:

```bash
kubectl taint node k3d-day2-agent-1 reserved=true:NoSchedule
```

Now, deploy a "regular" app, like our `log-service`.

```bash
kubectl apply -f k8s/day-2/log-service.yaml
kubectl scale deployment log-service --replicas=5
```

Check distribution:

```bash
kubectl get pods -o wide -l app=log-service
```

**Observation**: None of them should be on `k3d-day2-agent-1`. The taint repelled them.

### How to break the barrier?

If we *really* want something to run there, we must give it a "ticket" (Toleration).
(We won't do this now, but know that `tolerations` in the Pod spec matches `taints` on the Node).

---

## 3. Pod Anti-Affinity (Social Distancing)

We have `service-a`. For High Availability (HA), we want its replicas to run on **different nodes**. If one node dies, we don't want to lose all replicas!

Edit `k8s/day-1/service-a.yaml` to add **Anti-Affinity**:

```yaml
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: app
                operator: In
                values:
                - service-a
            topologyKey: "kubernetes.io/hostname"
      containers:
      # ...
```

Apply and scale:

```bash
kubectl apply -f k8s/day-1/service-a.yaml
kubectl scale deployment service-a --replicas=3
```

Check status:

```bash
kubectl get pods -o wide -l app=service-a
```

**Observation**:
*   1 replica on `k3d-day2-server-0` (maybe, if it runs workloads)
*   1 replica on `k3d-day2-agent-0`
*   1 replica on `k3d-day2-agent-1` (Wait! It has a taint!)

**Wait...** `service-a` typically *won't* schedule on `k3d-day2-agent-1` because of the Taint we added in Step 2.
So you might see:
*   1 Running on `k3d-day2-agent-0`
*   1 Running on `k3d-day2-server-0` (if untainted)
*   **1 Pending** (because it has nowhere to go! It hates the other replicas, and the other node hates it!).

This is a perfect demonstration of **Scheduling Constraints Collision**.

---

## Cleanup

Remove the taint so our cluster goes back to normal:

```bash
kubectl taint node k3d-day2-agent-1 reserved-
```

(Note the minus sign `-` at the end).
