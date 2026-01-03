# Step 8 – Distributed Tracing with OpenTelemetry & Tempo

Logs tell you *what* happened. Metrics tell you *trends*. **Tracing tells you *where* time was spent.**

## 1. The Theory: Spans and Traces

In a distributed system, a single user request often flows through multiple services. When something goes wrong (or is slow), you need to understand **the entire journey** of that request.

This is what distributed tracing solves.

### Core Concepts

*   **Trace**: The complete journey of a single request across multiple microservices.
    *   Think of it as the "story" of one request from start to finish.
    *   Each trace has a unique **Trace ID** (e.g., `8320e84729a43429e7ab369a72ad0d79`).

*   **Span**: A single unit of work within a trace.
    *   Examples: "HTTP GET /info", "SQL Query", "DNS lookup", "Function call".
    *   Spans can be nested (parent-child relationships).
    *   Each span has: a name, start time, duration, and metadata (tags, logs).

*   **Context Propagation**: The mechanism for passing the Trace ID from service A to service B.
    *   Uses HTTP headers (specifically the **W3C Trace Context** standard).
    *   The header is called `traceparent` and looks like: `00-<trace-id>-<span-id>-01`.

### Why This Matters

In Step 4, we manually passed correlation headers between services. That approach:
- Required modifying every service
- Only gave us correlation, not detailed timing
- Didn't capture infrastructure operations (DNS, TCP connections, etc.)

**OpenTelemetry (OTel)** does all of this **automatically** with zero code changes to your business logic.

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

The beauty of OpenTelemetry's auto-instrumentation is that it:
- Wraps HTTP client libraries (like `fetch`, `axios`) to inject trace headers
- Wraps HTTP server libraries (like Express) to extract trace headers
- Records timing information for all operations
- Sends traces to your backend (Tempo) automatically

### Task 3.1: Create `log-service-with-otel`

1.  Copy the service (we build upon our Metrics version to achieve the Holy Grail: Logs + Metrics + Traces):
    ```bash
    cp -r services/day-3/log-service-with-metrics services/day-3/log-service-with-otel
    cd services/day-3/log-service-with-otel
    ```

2.  Install OpenTelemetry dependencies:
    ```bash
    npm install \
      @opentelemetry/sdk-node \
      @opentelemetry/auto-instrumentations-node \
      @opentelemetry/exporter-trace-otlp-grpc \
      @opentelemetry/resources \
      @opentelemetry/semantic-conventions \
      @opentelemetry/core
    ```

3.  Create `instrumentation.js` (The Magic):

    ```javascript
    /* instrumentation.js */
    import { NodeSDK } from '@opentelemetry/sdk-node';
    import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
    import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
    import { Resource } from '@opentelemetry/resources';
    import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
    import { W3CTraceContextPropagator } from '@opentelemetry/core';
    import { CompositePropagator } from '@opentelemetry/core';

    const sdk = new NodeSDK({
        resource: new Resource({
            [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'unknown-service',
        }),
        traceExporter: new OTLPTraceExporter({
            url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
        }),
        textMapPropagator: new CompositePropagator({
            propagators: [new W3CTraceContextPropagator()],
        }),
        instrumentations: [getNodeAutoInstrumentations({
            // Enable all default instrumentations
            '@opentelemetry/instrumentation-fs': {
                enabled: false, // Disable noisy filesystem instrumentation
            },
        })],
    });

    sdk.start();
    console.log('✨ OpenTelemetry Auto-Instrumentation started');

    // Graceful shutdown
    process.on('SIGTERM', () => {
        sdk.shutdown()
            .then(() => console.log('Tracing terminated'))
            .catch((error) => console.log('Error terminating tracing', error))
            .finally(() => process.exit(0));
    });
    ```

    **What each part does:**
    - **Resource**: Identifies the service with semantic attributes (service name)
    - **OTLPTraceExporter**: Sends traces to Tempo using gRPC
    - **W3CTraceContextPropagator**: Ensures `traceparent` headers are properly injected/extracted
    - **getNodeAutoInstrumentations()**: Automatically instruments HTTP, Express, fetch, DNS, and more
    - **fs instrumentation disabled**: Prevents noisy file system spans from cluttering traces
    - **Graceful shutdown**: Ensures all traces are flushed before the process exits

4.  Modify `package.json` to run instrumentation **before** your app starts:
    ```json
    {
      "scripts": {
        "start": "node --import ./instrumentation.js server.js"
      }
    }
    ```

    **Important**: The `--import` flag (Node.js 20.6+) loads the instrumentation before any other modules. This is critical for auto-instrumentation to work.

    For Node.js < 20.6, use: `"start": "node -r ./instrumentation.js server.js"`

5.  **No changes to your application code are needed!**

    Your existing code using `fetch()` will automatically be instrumented:
    ```javascript
    // This code doesn't change, but OTel instruments it automatically
    const response = await fetch(DEPENDENCY_URL);
    ```

6.  Build and Import:
    ```bash
    docker build -t log-service-with-otel:latest services/day-3/log-service-with-otel
    k3d image import log-service-with-otel:latest -c day3
    ```

### Task 3.2: Create `echo-service-with-otel`

Repeat the same process for `echo-service`!

1.  Copy `services/day-3/echo-service-with-metrics` to `services/day-3/echo-service-with-otel`.
2.  Install the same OpenTelemetry dependencies.
3.  Add the **exact same** `instrumentation.js` file.
4.  Update `package.json` with the `--import` flag.
5.  Build and import:
    ```bash
    docker build -t echo-service-with-otel:latest services/day-3/echo-service-with-otel
    k3d image import echo-service-with-otel:latest -c day3
    ```

**Note**: Both services use identical instrumentation configuration. The only difference is the `OTEL_SERVICE_NAME` environment variable we'll set in the Kubernetes manifests.

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

### Task 5.1: Add Tempo as a Data Source

1.  **Add Data Source**:
    *   Go to Grafana -> Configuration -> Data Sources -> Add data source
    *   Type: **Tempo**
    *   URL: `http://tempo.monitoring.svc.cluster.local:3200`
    *   Save & Test.

### Task 5.2: Generate Traffic and Explore

2.  **Generate some requests**:
    ```bash
    # Generate a few requests to create traces
    for i in {1..5}; do curl localhost:8080/logs; sleep 1; done
    ```

3.  **Explore traces in Grafana**:
    *   Go to Explore -> Select **Tempo** data source
    *   Search by:
        - **Service Name**: `log-service`
        - Or **Trace ID** if you have one from logs
    *   Click on a trace to open it

### Task 5.3: Understanding the Waterfall View

When you open a trace, you should see something like this:

```
log-service: GET                                    [████████████████████] 125.73ms
  └─ GET                                            [██]                  9.41ms
      ├─ tcp.connect                                [█]                   2.52ms
      ├─ dns.lookup                                 [█]                   1.61ms
      └─ echo-service: GET                          [█]                   2.54ms
  log-service: GET                                  [█]                   3.63ms
      └─ echo-service: GET                          [█]                   1.65ms
```

**What you're seeing:**

1. **Parent Span**: `log-service: GET` (125.73ms)
   - The top-level request to log-service

2. **HTTP Client Span**: `GET` (9.41ms)
   - The outgoing HTTP request from log-service to echo-service
   - Notice the nested infrastructure operations:

3. **Infrastructure Spans**:
   - `tcp.connect` (2.52ms) - Time to establish TCP connection
   - `dns.lookup` (1.61ms) - Time to resolve `echo-service` via Kubernetes DNS
   - These are captured automatically by OpenTelemetry!

4. **Downstream Service Span**: `echo-service: GET` (2.54ms)
   - The actual request handling in echo-service
   - Notice it's **nested under the client span** - this proves context propagation worked!

### Key Observations

**Trace Metadata:**
- **Trace ID**: Unique identifier shared across all spans
- **Duration**: 125.73ms total
- **Services**: 2 (log-service AND echo-service)
- **Spans**: 7 total

**What This Tells You:**

1. **Request Flow**: You can see exactly how the request traveled through your system
2. **Performance Breakdown**:
   - Total time: 125.73ms
   - Actual work in echo-service: 2.54ms
   - Network overhead: ~9.41ms
   - Most time is likely spent elsewhere (application logic, retry waits, etc.)
3. **Service Dependencies**: Clear visualization that log-service depends on echo-service
4. **Infrastructure Visibility**: DNS and TCP operations are visible (often overlooked!)

### Task 5.4: Experiment

Try these experiments to understand tracing better:

1. **Simulate a slow dependency**:
   ```bash
   # Scale echo-service to add artificial delay
   kubectl set env deployment/echo-service SIMULATE_DELAY_MS=2000
   ```
   Generate requests and observe how the waterfall changes. You'll see the delay in the `echo-service` span.

2. **Simulate a failure**:
   ```bash
   # Make echo-service fail 50% of requests (it has chaos built-in)
   # Check the traces for failed requests
   ```
   Failed requests will show up with error tags in the spans.

3. **Scale log-service**:
   ```bash
   kubectl scale deployment/log-service --replicas=3
   ```
   Generate multiple requests and observe that different pods handle different requests, but tracing works across all instances.

---

## 6. How Context Propagation Works Under the Hood

When log-service makes a request to echo-service, OpenTelemetry automatically:

1. **In log-service** (outgoing request):
   - Creates a new child span for the HTTP request
   - Injects the `traceparent` header into the HTTP request
   - The header looks like: `traceparent: 00-8320e84729a43429e7ab369a72ad0d79-129a46b88fd4fdf0-01`
   - Format: `<version>-<trace-id>-<parent-span-id>-<trace-flags>`

2. **Over the network**:
   - The HTTP request carries the header across the network
   - Kubernetes DNS, network policies, service mesh (if any) don't interfere

3. **In echo-service** (incoming request):
   - OTel extracts the `traceparent` header
   - Creates a new span with the **same trace ID**
   - Sets the parent span ID from the header
   - All work in echo-service is now part of the same trace!

You can actually see this header being sent! Look at the debug logs we added in echo-service:
```bash
kubectl logs -l app=echo-service | grep traceparent
```

You'll see:
```json
Headers: {
  "traceparent": "00-8320e84729a43429e7ab369a72ad0d79-129a46b88fd4fdf0-01",
  ...
}
```

---

## 7. The Three Pillars in Action

You now have all three pillars of observability working together:

| Pillar | Tool | Purpose | Example Question |
|--------|------|---------|-----------------|
| **Logs** | Loki | What happened? | What error message did the service log? |
| **Metrics** | Prometheus | How often? How much? | What's the request rate? Is memory increasing? |
| **Traces** | Tempo | Where did time go? | Why is this request slow? |

**Pro tip**: In Grafana, you can correlate between them:
- Click on a trace span → See logs from that time period
- See a metric spike → Search for traces during that time
- See an error in logs → Find the trace ID and see the full request path


---

[Next: Debugging Challenge](./step-09-debugging.md)
