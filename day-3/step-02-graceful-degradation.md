# Step 2 – Graceful Degradation & Timeouts

## The Fallacy of the Happy Path

In a monolith, a function call is fast and reliable.
In a distributed system, a network call to another service is **slow and unreliable**.

If `Service A` calls `Service B` and `Service B` hangs:
1.  `Service A` waits...
2.  `Service A`'s threads/resources fill up.
3.  `Service A` crashes or becomes unresponsive.
4.  **Cascading Failure**: The entire platform goes down because of one slow service.

## Goal

We will modify our `log-service` consumer to handle failures gracefully.

## 1. Simulate Latency

To test timeouts, we need a slow service. Instead of finding a real slow server, we will make our `echo-service` artificially slow.

### 1.1 Create `echo-service-with-delay`

We'll create a new version of echo-service with artificial latency.

**Step 1: Copy the service code**

```bash
# Copy from Day 1's echo-service
cp -r services/day-1/echo-service services/day-3/echo-service-with-delay
```

**Step 2: Modify the server code**

Open `services/day-3/echo-service-with-delay/server.js` and add this middleware **before** the routes (around line 18):

```javascript
// SIMULATE LATENCY
const SIMULATE_DELAY_MS = Number(process.env.SIMULATE_DELAY_MS ?? 0);

app.use((req, res, next) => {
    if (SIMULATE_DELAY_MS > 0) {
        // console.log(`Simulating delay of ${SIMULATE_DELAY_MS}ms...`);
        setTimeout(next, SIMULATE_DELAY_MS);
    } else {
        next();
    }
});
```

**Step 3: Build and import the Docker image**

```bash
# Build the new image
docker build -t echo-service-with-delay:latest services/day-3/echo-service-with-delay

# Import into k3d cluster
k3d image import echo-service-with-delay:latest -c day3
```

### 1.2 Create the Deployment Manifest

Create `k8s/day-3/echo-service-with-delay.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: echo-service
  labels:
    app: echo-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: echo-service
  template:
    metadata:
      labels:
        app: echo-service
    spec:
      containers:
        - name: echo-service
          image: echo-service-with-delay:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          env:
            - name: APP_NAME
              value: "echo-service"
            - name: APP_VERSION
              value: "v1"
            - name: PORT
              value: "8080"
            - name: SIMULATE_DELAY_MS
              value: "3000"  # 3 seconds delay
---
apiVersion: v1
kind: Service
metadata:
  name: echo-service
  labels:
    app: echo-service
spec:
  type: ClusterIP
  selector:
    app: echo-service
  ports:
    - name: http
      port: 8080
      targetPort: 8080
```

**Deploy it:**

```bash
kubectl apply -f k8s/day-3/echo-service-with-delay.yaml
```

### 1.3 Expose via Ingress

Now, update your Ingress to route `/echo` to this service.
Add the following rule to `k8s/day-3/ingress.yaml`:

```yaml
          - path: /echo
            pathType: Prefix
            backend:
              service:
                name: echo-service
                port:
                  number: 8080
```

Apply the ingress change:

```bash
kubectl apply -f k8s/day-3/ingress.yaml
```

**Verify Latency:**
Wait a few seconds for pods to restart, then run:

```bash
time curl localhost:8080/echo/echo
```
_(Note: The first '/echo' is the ingress path, the second '/echo' is the service endpoint)_

You should see it takes ~3 seconds to respond.


## 2. The Timeout Pattern

We are going to simulate a real-world scenario: **Cascading Latency**.

You have two services:
1.  **`log-service`** (Consumer): Receives logs from users. Use the code from Day 2.
2.  **`echo-service`** (Dependency): A downstream service that is now **slow** (taking 3s to respond).

### 2.1 Setup: The "Enrichment" Feature

We want to "enrich" every log message with information from `echo-service`.

1.  Copy your `log-service` from Day 2 to Day 3 (e.g., `services/day-3/log-service-step-01`).
2.  Create a Kubernetes deployment for it.
3.  **Dependency Configuration**: Ensure `log-service` calls the **internal Kubernetes Service DNS** (`http://echo-service`), NOT localhost.
4.  **Ingress**: Expose `log-service` on path `/log`.

Add to `k8s/day-3/ingress.yaml`:
```yaml
          - path: /log
            pathType: Prefix
            backend:
              service:
                name: log-service
                port:
                  number: 8080
```

**The Problem:**
Since Ingress routes `/log` -> `log-service` -> `echo-service` (internal), and `echo-service` answers in 3 seconds, `log-service` will now effectively "hang" for 3 seconds.

**Verify Cascading Latency:**
```bash
time curl -X POST -H "Content-Type: application/json" -d '{}' localhost:8080/log
```
Expected time: **3+ seconds**.


### 2.2 Task: Implement a Timeout

We cannot let a helper service bring down our main service.

**Goal:** modifying `log-service` to give up if `echo-service` takes more than **1 second**.

**Steps:**
1.  Use `fetch` (or `axios`) with an `AbortSignal` to enforce a timeout.
2.  Set the timeout to `1000ms`.
3.  **Handle the error**: Do NOT crash. Do NOT return 500.
    *   If the request fails (timeout), log a warning and return the log **without** enrichment.
    *   This is **Graceful Degradation**.

### 2.3 Verify

1.  Deploy the updated `log-service`.
2.  Send a request via Ingress:

```bash
time curl -X POST -H "Content-Type: application/json" -d '{}' localhost:8080/log
```

3.  **Expected result**:
    *   Response time: **~1 second** (timeout threshold).
    *   Status: **200 OK**.
    *   Content: Log is saved, but "enrichment" data is missing (or says "unavailable").

> You have successfully turned a critical failure (3s latency) into a minor degradation (missing field).


---

[Next: Distributed Tracing](./step-03-distributed-tracing.md)
