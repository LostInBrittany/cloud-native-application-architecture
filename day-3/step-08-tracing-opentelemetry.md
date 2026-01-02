# Step 8 – Distributed Tracing with OpenTelemetry & Tempo

Logs tell you *what* happened. Metrics tell you *trends*. Tracing tells you *where* time was spent.

## 1. The Theory: Spans and Traces

*   **Trace**: The journey of a single request across multiple microservices.
*   **Span**: A single unit of work (e.g., "HTTP GET /info", "SQL Query", "Function Call").
*   **Context Propagation**: Passing the `TraceID` from service A to service B (via HTTP Headers).

In Step 4, we did "Manual Tracing" by passing headers ourselves. Now, we will use **OpenTelemetry (OTel)** to do this **automatically**.

## 2. Deploying Tempo (The Store)

Tempo is Grafana's high-volume, cost-effective trace backend.

### Task 2.1: Install Tempo

```bash
helm upgrade --install tempo grafana/tempo \
  --namespace monitoring \
  --set tempo.receiver.otlp.protocols.grpc.endpoint="0.0.0.0:4317" \
  --set tempo.receiver.otlp.protocols.http.endpoint="0.0.0.0:4318"
```

## 3. Instrumenting Services with OpenTelemetry

We will use the **OpenTelemetry Node.js SDK** to auto-instrument our apps. This captures HTTP requests automatically!

### Task 3.1: Create `log-service-with-otel`

1.  Copy the service (we build upon our Metrics version to achieve the Holy Grail: Logs + Metrics + Traces):
    ```bash
    cp -r services/day-3/log-service-with-metrics services/day-3/log-service-with-otel
    cd services/day-3/log-service-with-otel
    npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-grpc
    ```

2.  Create `instrumentation.js` (The Magic):

    ```javascript
    /* instrumentation.js */
    import { NodeSDK } from '@opentelemetry/sdk-node';
    import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
    import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        // Tempo is running in 'monitoring' namespace.
        // Cluster DNS: tempo.monitoring.svc.cluster.local:4317
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
      }),
      instrumentations: [getNodeAutoInstrumentations()],
      serviceName: process.env.OTEL_SERVICE_NAME || 'unknown-service',
    });

    sdk.start();
    console.log('✨ OpenTelemetry Auto-Instrumentation started');
    ```

3.  Modify `package.json` to run this **before** your app starts:
    Change `"start": "node server.js"` to:
    ```json
    "start": "node --import ./instrumentation.js server.js"
    ```
    *(Note: For Node < 20.6, use `node -r ./instrumentation.js server.js`)*

4.  Build and Import:
    ```bash
    docker build -t log-service-with-otel:latest services/day-3/log-service-with-otel
    k3d image import log-service-with-otel:latest -c day3
    ```

### Task 3.2: Create `echo-service-with-otel`

Repeat the same process for `echo-service`!
1.  Copy `services/day-3/echo-service-with-metrics` to `services/day-3/echo-service-with-otel`.
2.  Install dependencies.
3.  Add `instrumentation.js`.
4.  Update `package.json`.
5.  Build `echo-service-with-otel:latest` and import to k3d.

## 4. Deploying OTel Services

We need to create new manifests that point to our new images and configure the OTel exporter.

### Task 4.1: Log Service Manifest

Create `k8s/day-3/log-service-with-otel.yaml` (Clone `log-service-with-metrics.yaml`).
1.  **Update Image**: `log-service-with-otel:latest`.
2.  **Add Environment Variables**:
    *   `OTEL_SERVICE_NAME`: `log-service`
    *   `OTEL_EXPORTER_OTLP_ENDPOINT`: `http://tempo.monitoring.svc.cluster.local:4317`

```yaml
# Snippet
    env:
      - name: OTEL_SERVICE_NAME
        value: "log-service"
      - name: OTEL_EXPORTER_OTLP_ENDPOINT
        value: "http://tempo.monitoring.svc.cluster.local:4317"
```

### Task 4.2: Echo Service Manifest

Create `k8s/day-3/echo-service-with-otel.yaml` (Clone `echo-service-with-metrics.yaml`).
1.  **Update Image**: `echo-service-with-otel:latest`.
2.  **Add Environment Variables**:
    *   `OTEL_SERVICE_NAME`: `echo-service`
    *   `OTEL_EXPORTER_OTLP_ENDPOINT`: `http://tempo.monitoring.svc.cluster.local:4317`

```yaml
# Snippet
    env:
      - name: OTEL_SERVICE_NAME
        value: "echo-service"
      - name: OTEL_EXPORTER_OTLP_ENDPOINT
        value: "http://tempo.monitoring.svc.cluster.local:4317"
```

### Task 4.3: Apply

```bash
kubectl apply -f k8s/day-3/log-service-with-otel.yaml
kubectl apply -f k8s/day-3/echo-service-with-otel.yaml
```

## 5. Visualizing in Grafana

1.  **Add Data Source**:
    *   Type: **Tempo**
    *   URL: `http://tempo.monitoring.svc.cluster.local:3200`
    *   Save & Test.

2.  **Explore**:
    *   Go to Explore -> **Tempo**.
    *   Search -> Service Name: `log-service`.
    *   Find a trace and click it.

3.  **The Waterfall**:
    *   You should see a Span for `log-service`.
    *   UNDER it, nested, you should see a Span for `echo-service`.
    *   This proves `log-service` called `echo-service`!

---

[Next: Debugging Challenge](./step-09-debugging.md)
