# Step 1 – Ingress Basics

Before diving into complex resilience patterns, we need a reliable way to expose our services.
Up to now, we've experimented with `kubectl port-forward` or simple LoadBalancers. In a real platform, we use an **Ingress Controller**.

## 1. What is an Ingress?

At its most basic level, an **Ingress** is a smart router (reverse proxy) that sits at the edge of your cluster. It allows all your Kubernetes services to be accessible behind a **single external IP address** (or Entrypoint).

Instead of creating a separate LoadBalancer for every service (which is expensive and difficult to manage), you create one Ingress. It accepts incoming traffic and routes it to the correct internal Service based on rules you define.

Technically speaking:
*   **Service (L4)**: Routes raw TCP/UDP traffic to Pods. Main usage: Internal communications.
*   **Ingress (L7)**: Routes HTTP/HTTPS traffic from the outside world to Services.

It acts as a gateway that handles:
*   **Single Entry Point**: One IP for the whole cluster.
*   **Path Routing**: e.g., `/api` -> `backend-service`, `/` -> `frontend-service`.
*   **Host Routing**: e.g., `api.example.com`, `app.example.com`.
*   **TLS Termination**: Handles SSL/HTTPS so your services don't have to.

In our local `k3d` setup, **Traefik** is pre-installed as the Ingress Controller. It listens on port `80` (mapped to `8080` on your host).

## 2. Cluster Setup

Let's start fresh with a cluster tailored for Day 3.

```bash
# Delete previous cluster
k3d cluster delete day2

# Create new cluster mapping port 8080 (host) to 80 (cluster ingress)
k3d cluster create day3 -p "8080:80@loadbalancer" --agents 2
```

## 3. Deploy a Whoami Service

Let's deploy a simple service to test our routing.

1.  Create `k8s/day-3/whoami.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: whoami
  labels:
    app: whoami
spec:
  replicas: 1
  selector:
    matchLabels:
      app: whoami
  template:
    metadata:
      labels:
        app: whoami
    spec:
      containers:
        - name: whoami
          image: traefik/whoami
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: whoami
  labels:
    app: whoami
spec:
  type: ClusterIP
  selector:
    app: whoami
  ports:
    - name: http
      port: 80
      targetPort: 80
```

2.  Apply it:
    ```bash
    kubectl apply -f k8s/day-3/whoami.yaml
    ```

## 4. Create an Ingress

Now, let's expose it via Ingress. Instead of port-forwarding, we defined a routing rule.

1.  Create `k8s/day-3/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: day3-ingress
spec:
  rules:
    - http:
        paths:
          - path: /whoami
            pathType: Prefix
            backend:
              service:
                name: whoami
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: whoami
                port:
                  number: 80
```

2.  Apply it:
    ```bash
    kubectl apply -f k8s/day-3/ingress.yaml
    ```

## 5. Test It

Now verify you can access the service directly via localhost:

```bash
curl localhost:80/whoami
```

> **Troubleshooting:**
> If you get `curl: (52) Empty reply from server`, it means **Traefik (the Ingress Controller) is not ready yet**.
> k3d takes a minute to start the ingress controller.
> Check the status with: `kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik`
> Wait for it to be `Running` and `1/1`.


You should see output similar to:

```text
Hostname: whoami-6b8...
IP: 10.42.0.5...
GET /whoami HTTP/1.1
Host: localhost:8080
...
```

**Why this matters**:
For the rest of Day 3 and Day 4, we will assume all services are accessible via `localhost:8080/service-name` (if we configure the Ingress for them). We stop fighting with `port-forward` commands in separate terminal tabs.

---

[Next: Graceful Degradation](./step-02-graceful-degradation.md)
