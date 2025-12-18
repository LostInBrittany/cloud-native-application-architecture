# Preparing a Multi-Node Local Kubernetes Cluster (Important)


Many Kubernetes features only make sense when:
- there is more than one node
- the scheduler has real choices to make

For Day 2, we will recreate our local cluster with **multiple worker nodes**.

---

## Why We Are Doing This

A single-node cluster is sufficient for:
- basic deployments
- Services
- self-healing demonstrations

It is **not sufficient** to meaningfully explore:
- resource requests and limits
- scheduling decisions
- taints and tolerations
- affinity and anti-affinity rules

To observe these mechanisms, Kubernetes needs **options**.

---

## Step 0 – Choose Your Tool: Kind vs K3d

We have two excellent tools for running local Kubernetes clusters.

### Option A: Kind (Kubernetes in Docker)
*   **What is it?**: Uses official Kubernetes container images.
*   **Pros**: Closest to "upstream" Kubernetes. Reference implementation.
*   **Cons**: Can be heavy, slower to start, images are large.

### Option B: K3d (K3s in Docker)
*   **What is it?**: Runs **K3s** (a lightweight, certified Kubernetes distro) in Docker.
*   **Pros**: Extremely fast, very low memory footprint, binary is small.
*   **Cons**: Uses K3s (embedded SQLite by default), slightly different internal components (Traefik ingress by default).

**For Day 2, we will use K3d.**

For this workshop, we use **k3d** to run a local Kubernetes cluster. k3d provides a lightweight, multi-node Kubernetes setup that behaves consistently across **Linux, Windows (WSL2), and macOS**. It offers built-in load balancer support and simple port mappings, which lets us access services via `localhost` without resorting to `kubectl port-forward`, custom networking hacks, or OS-specific workarounds. This keeps the focus on **Kubernetes concepts** rather than local environment differences.

---

## Step 1 – Install K3d

If you don't have it yet:

**Mac/Linux:**
```bash
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
```

**Mac (Homebrew):**
```bash
brew install k3d
```

Verify it:
```bash
k3d version
```

---

## Step 2 – Create a Multi-Node Cluster

We want a cluster named `day2` with:
*   1 Server node (Control Plane)
*   2 Agent nodes (Workers)
*   **Important**: We will disable the default LoadBalancer (`servicelb`) so we can learn to install MetalLB manually.

Run this command:

```bash
k3d cluster create day2 --agents 2 -p "8080:8080@loadbalancer"
```

*   `--agents 2`: Spawns two worker nodes.
*   `-p "8080:8080@loadbalancer"`: Maps port 8080 on your laptop to port 8080 on the cluster load balancer. This allows you to access services directly!

Verify the nodes:

```bash
kubectl get nodes
```

You should see 3 nodes:
*   `k3d-day2-server-0`
*   `k3d-day2-agent-0`
*   `k3d-day2-agent-1`

✅ **Checkpoint**: You have a multi-node cluster running!

---

## What This Enables Today

With this cluster, you will be able to:

* see Pods scheduled on different nodes
* observe how resource requests affect placement
* apply taints to nodes and watch Pods avoid them
* use affinity and anti-affinity rules meaningfully

From now on, when Kubernetes makes a decision, you can **see why**.

---

## Important Note About Local Clusters

This is still a **local learning environment**:

* nodes are containers, not real machines
* networking and storage are simplified
* performance characteristics are not realistic

That’s fine.

What matters is:

* **behavior**
* **intent**
* **constraints**

---

## Step 3 – Verify LoadBalancer Support (Default)

K3d/K3s comes with a built-in Load Balancer called `svclb` (Service Load Balancer).
This means `type: LoadBalancer` works "out of the box".

Let's use our **echo-service** from Day 1 to prove it.

1.  **Ensure you have the image**:

    ```bash
    docker build -t echo-service:dev ./services/day-1/echo-service
    ```

2.  **Import the image into K3d**:

    ```bash
    k3d image import echo-service:dev -c day2
    ```

3.  **Deploy**:

    ```bash
    kubectl apply -f k8s/day-2/echo-service.yml
    ```

    *(Note: This service listens on port 8080).*

4.  **Watch it get an IP**:

    ```bash
    kubectl get svc echo-service -w
    ```

    You should see an `EXTERNAL-IP` appear (likely matching a Node IP).

    ```text
    NAME           TYPE           CLUSTER-IP     EXTERNAL-IP      PORT(S)          AGE
    echo-service   LoadBalancer   10.43.x.x      172.20.0.3       8080:31976/TCP   5s
    ```

    **Success!** The built-in controller assigned an IP.

5.  **Access the Service**:

    Because we mapped port 8080 when creating the cluster, you can access the service directly!

    **Open in Browser:** [http://localhost:8080/info](http://localhost:8080/info)

    **Or via curl:**
    ```bash
    curl localhost:8080/info
    ```

    You should see the JSON log response from your service.

6.  **Cleanup**:

    ```bash
    kubectl delete -f k8s/day-2/echo-service.yml
    ```

---

## Final Checkpoint

Before continuing, ensure:
1.  Running `kubectl get nodes` shows 3 nodes (`server-0`, `agent-0`, `agent-1`).
2.  You understand that we are using **K3d** now.

```bash
kubectl get nodes
kubectl get pods -o wide
```

And explain:

* how many nodes exist
* where a Pod is running
* why Kubernetes made that choice


