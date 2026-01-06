# Step 0 – Day 4 Cluster Setup

## Why a Fresh Cluster?

Day 4 focuses on **production readiness**, which means we'll be working with:
* Security policies (Pod Security Standards)
* Network policies
* Multiple namespaces (default, production)
* Clean slate for testing hardening configurations

A fresh cluster ensures everyone starts from the same baseline.

---

## 1. Delete the Day 3 Cluster

If you still have the `day3` cluster running, delete it:

```bash
k3d cluster delete day3
```

This will clean up all resources from Days 1-3.

---

## 2. Create the Day 4 Cluster

Create a new cluster with the same ingress port mapping:

```bash
k3d cluster create day4 -p "8080:80@loadbalancer" --agents 2
```

**What this does:**
* Creates a cluster named `day4`
* Maps port `8080` on your host to port `80` in the cluster (for Traefik ingress)
* Creates 2 agent nodes (for testing scheduling, network policies, etc.)

Wait for the cluster to be ready (~30 seconds).

---

## 3. Verify Traefik is Running

Traefik is the ingress controller that comes pre-installed with k3d. It takes about 1 minute to fully start.

Watch all pods in the `kube-system` namespace:

```bash
kubectl get pods -n kube-system -w
```

**What you'll see (typical progression):**

**Step 1** - Helm install jobs start (first ~30 seconds):
```
NAME                                  READY   STATUS              RESTARTS   AGE
helm-install-traefik-crd-hkl4c        0/1     ContainerCreating   0          10s
helm-install-traefik-hvlnr            0/1     ContainerCreating   0          10s
coredns-xxxxxx-xxxxx                  1/1     Running             0          15s
```

**Step 2** - Helm jobs complete, Traefik pod appears (~45 seconds):
```
helm-install-traefik-crd-hkl4c        0/1     Completed           0          35s
helm-install-traefik-hvlnr            0/1     Completed           0          35s
traefik-df4ff85d6-xxxxx               0/1     ContainerCreating   0          5s
```

**Step 3** - Traefik is Running (~60 seconds):
```
traefik-df4ff85d6-xxxxx               1/1     Running             0          25s
```

**When you see Traefik with `1/1 Running`, press `Ctrl+C` to stop watching.**

> **Tip:** The `-w` flag watches for changes in real-time. This is useful when waiting for resources to be ready.

---

## 4. Deploy the Whoami Test Service

We'll use a simple service to verify ingress routing works before proceeding.

Create `k8s/day-4/whoami.yaml`:

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

Apply it:

```bash
kubectl apply -f k8s/day-4/whoami.yaml
```

Verify the pod is running:

```bash
kubectl get pods -l app=whoami
```

Expected:
```
NAME                      READY   STATUS    RESTARTS   AGE
whoami-xxxxxxxxxx-xxxxx   1/1     Running   0          10s
```

---

## 5. Create the Ingress

We'll create an ingress with routes for all services we'll use throughout Day 4.

**Why define all routes now?**
- We'll deploy `echo-service` and `log-service` during the security hardening exercises
- Defining the routes upfront means we won't have to keep editing the ingress
- Services that don't exist yet will simply return 503 (Service Unavailable) until we deploy them

Create `k8s/day-4/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: day4-ingress
spec:
  rules:
    - http:
        paths:
          # Test service (deployed now)
          - path: /whoami
            pathType: Prefix
            backend:
              service:
                name: whoami
                port:
                  number: 80

          # Echo service (will be deployed in Step 1 - Security Hardening)
          - path: /echo
            pathType: Prefix
            backend:
              service:
                name: echo-service
                port:
                  number: 8080

          # Log service (will be deployed in Step 1 - Security Hardening)
          - path: /log
            pathType: Prefix
            backend:
              service:
                name: log-service
                port:
                  number: 8080
```

> **Note:** We're not adding a default `/` route because with `pathType: Prefix`, it would match all paths and interfere with our specific routes. Access whoami explicitly via `/whoami`.

Apply it:

```bash
kubectl apply -f k8s/day-4/ingress.yaml
```

---

## 6. Test the Ingress

Wait a few seconds for the ingress to configure, then test the whoami service:

```bash
curl localhost:8080/whoami
```

Expected output (something like):

```
Hostname: whoami-6b8...
IP: 10.42.0.5
IP: ::1
RemoteAddr: 10.42.0.4:52134
GET /whoami HTTP/1.1
Host: localhost:8080
User-Agent: curl/7.x.x
Accept: */*
...
```

****If you see this output, your cluster and ingress are working correctly!**

**Optional:** Verify that routes for not-yet-deployed services return 503:

```bash
curl localhost:8080/echo
# Expected: 404 Not Found or 503 Service Unavailable (service doesn't exist yet)

curl localhost:8080/log
# Expected: 404 Not Found or 503 Service Unavailable (service doesn't exist yet)
```

This is normal! We'll deploy these services during the security hardening exercises in Step 1.

**Also verify that undefined paths return 404:**

```bash
curl localhost:8080/
# Expected: 404 page not found (no default route defined)

curl localhost:8080/nonexistent
# Expected: 404 page not found
```

---

## 7. Troubleshooting

### Issue: `curl: (52) Empty reply from server`

**Cause:** Traefik is not ready yet.

**Solution:**
```bash
# Check Traefik status
kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik

# Wait for it to be Running, then retry curl
```

### Issue: `curl: (7) Failed to connect`

**Cause:** Port mapping may not be working.

**Solution:**
```bash
# Check k3d cluster exists and has port mapping
k3d cluster list

# Recreate if needed
k3d cluster delete day4
k3d cluster create day4 -p "8080:80@loadbalancer" --agents 2
```

### Issue: `404 page not found`

**Cause:** Ingress not applied or service selector mismatch.

**Solution:**
```bash
# Check ingress exists
kubectl get ingress

# Check service has endpoints
kubectl get endpoints whoami

# If no endpoints, check pod labels match service selector
kubectl get pods --show-labels
```

---

## 8. You're Ready for Day 4!

Once you can successfully `curl localhost:8080/whoami` and get a response, you're ready to proceed.

Throughout Day 4, we'll add more services to this ingress as we deploy hardened workloads.

---

**Summary of what you have:**
* **Fresh `day4` k3d cluster with 2 agent nodes
* **Traefik ingress controller running
* **Whoami test service deployed and accessible at `localhost:8080`
* **Ingress routing working correctly

---

[Next: Security Hardening](./step-01-security-hardening.md)
