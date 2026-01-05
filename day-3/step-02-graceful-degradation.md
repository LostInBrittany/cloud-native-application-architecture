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

**Step 1: Copy the service**

```bash
# Copy from Day 2
cp -r services/day-2/log-service-step-01 services/day-3/log-service-with-service-dependencies
```

**Step 2: Add service dependency call**

In your `services/day-3/log-service-with-service-dependencies/server.js`, add a function to call echo-service.

At the top of the file, add the echo-service URL configuration:

```javascript
const ECHO_SERVICE_URL = process.env.ECHO_SERVICE_URL || "http://echo-service:8080";
```

> **Note:** We use `http://echo-service:8080` to call the service **internally within the Kubernetes cluster** (pod-to-pod communication). This bypasses the Ingress entirely. The Ingress (`localhost:8080/echo`) is only for external access from outside the cluster.

Then create a helper function to enrich log messages by calling echo-service:

```javascript
// Helper function to enrich logs with data from echo-service
async function enrichLogWithEchoData(logEntry) {
    try {
        // Call echo-service to get enrichment data
        const response = await fetch(`${ECHO_SERVICE_URL}/echo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'enrich' })
        });

        if (!response.ok) {
            console.warn(`Echo service returned ${response.status}`);
            return logEntry; // Return without enrichment
        }

        const echoData = await response.json();

        // Add enrichment data to the log entry
        return {
            ...logEntry,
            enrichment: {
                echoedAt: echoData.timestamp,
                echoedBy: echoData.hostname
            }
        };
    } catch (error) {
        console.warn('Failed to enrich log:', error.message);
        return logEntry; // Return without enrichment on error
    }
}
```

Then update your `/log` endpoint to use this enrichment function:

```javascript
app.post('/log', async (req, res) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        message: req.body.message || 'No message',
        level: req.body.level || 'info'
    };

    // Enrich the log with data from echo-service
    const enrichedLog = await enrichLogWithEchoData(logEntry);

    console.log(JSON.stringify(enrichedLog));

    res.json({
        status: 'logged',
        entry: enrichedLog
    });
});
```

**Step 3: Build and import the image**

```bash
# Build the image
docker build -t log-service-with-service-dependencies:latest services/day-3/log-service-with-service-dependencies

# Import into k3d
k3d image import log-service-with-service-dependencies:latest -c day3
```

**Step 4: Create the deployment**

Create `k8s/day-3/log-service-with-service-dependencies.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: log-service
  labels:
    app: log-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: log-service
  template:
    metadata:
      labels:
        app: log-service
    spec:
      containers:
        - name: log-service
          image: log-service-with-service-dependencies:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          env:
            - name: APP_NAME
              value: "log-service"
            - name: APP_VERSION
              value: "v1"
            - name: PORT
              value: "8080"
            - name: ECHO_SERVICE_URL
              value: "http://echo-service:8080"  # Kubernetes Service DNS
---
apiVersion: v1
kind: Service
metadata:
  name: log-service
  labels:
    app: log-service
spec:
  type: ClusterIP
  selector:
    app: log-service
  ports:
    - name: http
      port: 8080
      targetPort: 8080
```

**Deploy it:**

```bash
kubectl apply -f k8s/day-3/log-service-with-service-dependencies.yaml
```

**Step 5: Expose via Ingress**

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

**Goal:** Modify `log-service` to give up if `echo-service` takes more than **1 second**.

**Step 1: Copy the service**

```bash
# Copy from the previous version
cp -r services/day-3/log-service-with-service-dependencies services/day-3/log-service-with-timeout
```

**Step 2: Add timeout to the fetch call**

Modern JavaScript's `fetch()` API supports timeouts using `AbortController` and `AbortSignal`. Here's how it works:

1. Create an `AbortController` - this gives you control to cancel the request
2. Pass its `signal` to the fetch call
3. Set a timeout that calls `controller.abort()` after your time limit
4. Catch the `AbortError` and handle it gracefully

Update your `enrichLogWithEchoData` function in `services/day-3/log-service-with-timeout/server.js`:

```javascript
// Helper function to enrich logs with data from echo-service (with timeout)
async function enrichLogWithEchoData(logEntry) {
    // Create an AbortController to cancel the request if it takes too long
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout

    try {
        // Call echo-service with the abort signal
        const response = await fetch(`${ECHO_SERVICE_URL}/echo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'enrich' }),
            signal: controller.signal  // Pass the abort signal
        });

        // Clear the timeout if the request completed in time
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`Echo service returned ${response.status}`);
            return {
                ...logEntry,
                enrichment: 'unavailable (service error)'
            };
        }

        const echoData = await response.json();

        // Add enrichment data to the log entry
        return {
            ...logEntry,
            enrichment: {
                echoedAt: echoData.timestamp,
                echoedBy: echoData.hostname
            }
        };
    } catch (error) {
        // Clear the timeout
        clearTimeout(timeoutId);

        // Check if the error was due to timeout
        if (error.name === 'AbortError') {
            console.warn('Echo service timeout - request took longer than 1s');
            return {
                ...logEntry,
                enrichment: 'unavailable (timeout)'
            };
        }

        // Handle other errors (network issues, etc.)
        console.warn('Failed to enrich log:', error.message);
        return {
            ...logEntry,
            enrichment: 'unavailable (error)'
        };
    }
}
```

**What this code does:**

1. **Creates AbortController**: `const controller = new AbortController()` - gives us a way to cancel the request
2. **Sets timeout**: `setTimeout(() => controller.abort(), 1000)` - after 1 second, call `abort()` which cancels the fetch
3. **Passes signal**: `signal: controller.signal` - connects the abort controller to the fetch request
4. **Clears timeout on success**: If the request completes before 1s, we clear the timeout
5. **Handles AbortError**: When the timeout fires, fetch throws an `AbortError` - we catch it and return the log without enrichment
6. **Graceful degradation**: Always returns a valid log entry, never crashes the service

**Step 3: Build and import the image**

```bash
# Build the image
docker build -t log-service-with-timeout:latest services/day-3/log-service-with-timeout

# Import into k3d
k3d image import log-service-with-timeout:latest -c day3
```

**Step 4: Create deployment manifest**

Create `k8s/day-3/log-service-with-timeout.yaml` (copy from the previous manifest and update the image name):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: log-service
  labels:
    app: log-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: log-service
  template:
    metadata:
      labels:
        app: log-service
    spec:
      containers:
        - name: log-service
          image: log-service-with-timeout:latest  # Updated image name
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          env:
            - name: APP_NAME
              value: "log-service"
            - name: APP_VERSION
              value: "v1"
            - name: PORT
              value: "8080"
            - name: ECHO_SERVICE_URL
              value: "http://echo-service:8080"
---
apiVersion: v1
kind: Service
metadata:
  name: log-service
  labels:
    app: log-service
spec:
  type: ClusterIP
  selector:
    app: log-service
  ports:
    - name: http
      port: 8080
      targetPort: 8080
```

**Deploy it:**

```bash
kubectl apply -f k8s/day-3/log-service-with-timeout.yaml
```

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
