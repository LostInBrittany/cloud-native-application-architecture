# Step 7 – Health Probes: Self-Healing Applications

![Health probes](/img/day-2/07-health-probes-01.jpg)

![Liveness probe](/img/day-2/07-health-probes-02.jpg)

![Readiness probe](/img/day-2/07-health-probes-03.jpg)

![Startup probe](/img/day-2/07-health-probes-04.jpg)

## Concept

In a distributed system, things fail. Processes hang, memory leaks, connections drop.
Kubernetes does not know *how* your application fails unless you tell it.

We use **Health Probes** to give Kubernetes "eyes" into our application:

1.  **LivenessProbe**: "Are you alive?"
    *   If NO: Restart the container.
    *   Use case: Deadlocks, broken states.
2.  **ReadinessProbe**: "Are you ready to handle traffic?"
    *   If NO: Remove IP from the Service (stop sending traffic).
    *   Use case: Initializing, overloaded, or missing dependencies.

---

## 1. Update Your Code (Again!)

To demonstrate this, we need an application that can report its health... and also one that we can **break**.

### The Task

Modify your `log-service` code (from Step 6) to add:

1.  **A Health Endpoint** (`GET /healthz`):
    *   Return `200 OK` if the app is healthy.
    *   Return `500 Internal Server Error` if it is not.
2.  **A Sabotage Endpoint** (`POST /admin/break`):
    *   When called (with the API Key), it sets the internal state to "unhealthy".
    *   Subsequent calls to `/healthz` should return 500.

### Reference Implementation

A fully working example is in:
📂 `services/day-2/log-service-step-7`

### Build and Load

```bash
# Don't forget to rebuild!```bash
docker build -t log-service:v3 services/day-2/log-service-step-7
k3d image import log-service:v3 -c day2
```

---

## 2. Configure LivenessProbe

Update your deployment `k8s/day-2/log-service.yml`.
Use the new image `v3` and add the probe section.

```yaml
      containers:
        - name: log-service
          image: log-service:v3   # <--- v3
          # ... env vars ...
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 3
            periodSeconds: 3      # Check frequently for demo purposes
```

Apply it:

```bash
kubectl apply -f k8s/day-2/log-service.yml
```

---

## 3. The Demo: Break it!

1.  **Watch the pods** in one terminal:
    ```bash
    kubectl get pods -w
    ```

2.  **Verify it works** (in another terminal):
    ```bash
    # Check health
    curl localhost:8080/healthz
    # {"status":"OK"}
    ```

3.  **Sabotage the application**:
    ```bash
    curl -X POST -H "X-API-KEY: secret123" localhost:8080/admin/break
    ```

4.  **Observe!**

    *   Wait about 3 iterations (~10 seconds).
    *   The `livenessProbe` will fail 3 times.
    *   Kubernetes will kill the container.
    *   You will see the **RESTARTS** count increment in your watch window.
    *   The new container starts fresh (healthy).

### Key Takeaway

You just witnessed **automated self-healing**.
You broke the app, and Kubernetes fixed it without you waking up at 3 AM.
