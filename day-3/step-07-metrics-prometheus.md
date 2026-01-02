# Step 7 – Metrics with Prometheus & Grafana

We have Logs (The "What"). Now we need Metrics (The "Trends").

## 1. The Theory: What to Measure?

When defining metrics, we use two industry-standard methodologies created by Brendan Gregg.

### 1.1 The RED Method (By Tom Wilkie)

**For Request-Driven Services** (Microservices, HTTP APIs).

*   **R**ate: The number of requests per second.
    *   *Why?* To know if traffic is spiking or dropping (DDoS? DNS issue?).
    *   *Metric*: `http_requests_total`.
*   **E**rrors: The number of failed requests per second.
    *   *Why?* To know if users are seeing 500s.
    *   *Metric*: `http_requests_total{status="500"}`.
*   **D**uration: The amount of time requests take (Distribution).
    *   *Why?* To know if the system is slow (Latency).
    *   *Metric*: `http_request_duration_seconds_bucket`.

### 1.2 The USE Method (By Brendan Gregg)

**For Resources** (CPU, Memory, Disks, Databases).

*   **U**tilization: The average time that the resource was busy doing work.
    *   *Example*: "CPU is at 90%".
*   **S**aturation: The degree to which extra work involves waiting (queueing).
    *   *Example*: "Disks are writing, but 50 operations are pending in queue".
*   **E**rrors: Count of error events.
    *   *Example*: "Out of Memory OOM Kills", "Disk Read Errors".

> **Rule of Thumb**: 
> *   Monitor your APIS with **RED**.
> *   Monitor your Infrastructure (Pods/Nodes) with **USE**.

## 2. Prometheus Architecture

Prometheus works on a **Pull Model**:

1.  **Expose**: Your application runs a tiny HTTP server (e.g., `/metrics`) returning plain text data.
2.  **Scrape**: Prometheus wakes up every 15s (configurable), calls that endpoint, and stores the result.
3.  **Query**: You use PromQL to aggregate and graph that data.

## 2. Instrumenting the Application

We need to modify our service to count requests and expose them.

### Task 2.1: Create `log-service-with-metrics`

1.  Copy your retry-enabled service:
    ```bash
    cp -r services/day-3/log-service-with-retries services/day-3/log-service-with-metrics
    ```
2.  Install the client library:
    ```bash
    cd services/day-3/log-service-with-metrics
    npm install prom-client
    ```

### Task 2.2: Add Metrics Code

Update `services/day-3/log-service-with-metrics/server.js` (Add this before routes):

```javascript
import client from 'prom-client';

// 1. Create Registry
const register = new client.Registry();
client.collectDefaultMetrics({ register }); // CPU, Memory, etc.

// 2. Define Custom Metric (RED: Rate & Errors)
const httpRequestCounter = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'path', 'status_code'],
});
register.registerMetric(httpRequestCounter);

// 3. Middleware to Count
app.use((req, res, next) => {
    res.on('finish', () => {
        // Only count interesting paths (ignore health checks to reduce noise)
        if (req.path !== '/metrics' && req.path !== '/healthz') {
             httpRequestCounter.inc({
                method: req.method,
                path: req.path,
                status_code: res.statusCode,
            });
        }
    });
    next();
});

// 4. Expose Endpoint
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});
```

### Task 2.3: Build & Deploy

1.  Build the image:
    ```bash
    docker build -t log-service-with-metrics:latest services/day-3/log-service-with-metrics
    k3d image import log-service-with-metrics:latest -c day3
    ```
2.  Create `k8s/day-3/log-service-with-metrics.yaml` to use this image AND add **Scrape Annotations**.

    Prometheus needs to know *where* to find metrics. We use Kubernetes Annotations:

    ```yaml
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: log-service
    spec:
      template:
        metadata:
          annotations:
            prometheus.io/scrape: "true"
            prometheus.io/port: "8080"
            prometheus.io/path: "/metrics"
    # ... rest of deployment
    ```

3.  Apply the new deployment.

### Task 2.4: Also Instrument `echo-service`

To see the full picture (Client vs Server perspective), we should also instrument the downstream service.

1.  Copy `echo-service-flaky` to `echo-service-with-metrics`:
    ```bash
    cp -r services/day-3/echo-service-flaky services/day-3/echo-service-with-metrics
    cd services/day-3/echo-service-with-metrics
    npm install prom-client
    ```

2.  Update `server.js` with the **same metrics code** as `log-service` (Imports + Middleware + Endpoint).

3.  Build and deploy:
    ```bash
    docker build -t echo-service-with-metrics:latest services/day-3/echo-service-with-metrics
    k3d image import echo-service-with-metrics:latest -c day3
    ```

4.  Create `k8s/day-3/echo-service-with-metrics.yaml` (Clone `echo-service-flaky.yaml`):
    *   Change image to `echo-service-with-metrics:latest`.
    *   **Crucial**: Add the same Prometheus annotations to the Pod template!

## 3. Deploying Prometheus

We will install a standalone Prometheus server (connected to our existing Grafana).

### Task 3.1: Install via Helm

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install prometheus prometheus-community/prometheus \
  --namespace monitoring \
  --set alertmanager.enabled=false \
  --set kubeStateMetrics.enabled=false \
  --set prometheus-pushgateway.enabled=false \
  --set server.global.scrape_interval=5s \
  --set server.global.scrape_timeout=4s
```
*(We disable extra components to save resources. 5s scrape interval makes testing faster).*

## 4. Connecting Grafana

Now we link our **Step 6 Grafana** to our **Step 7 Prometheus**.

### Task 4.1: Add Data Source
1.  Open Grafana: [http://localhost:8080/grafana](http://localhost:8080/grafana) (admin/admin).
2.  **Connections** -> **Data Sources** -> **Add new**.
3.  Select **Prometheus**.
4.  URL: `http://prometheus-server.monitoring.svc.cluster.local`
5.  Click **Save & Test**.

## 5. Visualizing Metrics

### Task 5.1: Run PromQL Queries
Go to **Explore** -> Select **Prometheus**.

Try these queries:
*   **Current total** (raw counter value):
    ```promql
    http_requests_total
    ```

    **HTTP request rate per minute**:
    ```promql
    rate(http_requests_total[1m])
    ```
*   **Total Errors** (Only 5xx):
    ```promql
    http_requests_total{status_code=~"5.."}
    ```
*   **Error Rate per minute** (Only 5xx):
    ```promql
    rate(http_requests_total{status_code=~"5.."}[1m])
    ```

### Task 5.2: Create a Dashboard
1.  **Dashboards** -> **New Dashboard**.
2.  Build a panel using the queries above.

---

[Next: Debugging Challenge](./step-08-debugging.md)

