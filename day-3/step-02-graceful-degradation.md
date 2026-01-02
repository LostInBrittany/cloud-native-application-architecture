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

### 1.1 Modify `echo-service`

Open `services/day-1/echo-service/server.js` and add this middleware **before** the routes (e.g., around line 18):

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

### 1.2 Update the Deployment

Update your deployment YAML (e.g., `k8s/day-1/echo-service.yml`) to include the delay configuration:

```yaml
          env:
            - name: SIMULATE_DELAY_MS
              value: "3000" # 3 seconds delay
```

Apply the changes:

```bash
# Apply the new deployment configuration
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
