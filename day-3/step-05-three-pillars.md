# Step 5 – The Three Pillars of Observability

## Why "Monitoring" is not enough

*   **Monitoring** tells you **that** the system is failing ("CPU is high", "Error rate is 5%"). It is about the *known knowns*.
*   **Observability** allows you to ask **why** it is failing ("It's the payments service, but only for iOS users, when the cart has > 5 items"). It is about exploring the *unknown unknowns*.

To achieve observability, we need three complementary types of data:

## 1. Logs (The "What")

*   **Definition**: A textual record of a discrete event.
*   **Best Practice**: **Structured Logging** (JSON).
    *   *Bad*: `[INFO] User 123 login failed` (Requires regex to parse).
    *   *Good*: `{"level":"info", "event":"login_failed", "userId":123, "reason":"bad_password"}` (Queryable like a DB).
*   **Use Case**: Debugging specific errors, auditing, "forensics".
*   **Cost**: High (volume increases linearly with traffic).

## 2. Metrics (The "Trends")

*   **Definition**: Aggregated numbers over time.
    *   **Counters**: "Total requests: 10,420" (Always goes up).
    *   **Gauges**: "Current Memory: 512MB" (Goes up and down).
    *   **Histograms**: "99% of requests constitute < 300ms".
*   **Key Concept**: **Labels / Dimensions**.
    *   `http_requests_total` is useless.
    *   `http_requests_total{service="log-service", status="500"}` is powerful.
*   **The Four Golden Signals** (Google SRE):
    1.  **Latency**: Time it takes to serve a request.
    2.  **Traffic**: Demand on your system (req/sec).
    3.  **Errors**: Rate of requests that fail.
    4.  **Saturation**: "How full" your service is (CPU, Memory, Queue depth).
*   **Cost**: Low (Constant size. Storing "1 request" takes same space as "1 million").

## 3. Traces (The "Where")

*   **Definition**: Represent a causal chain of events (a request journey) through a distributed system.
*   **Components**:
    *   **Trace**: The whole journey.
    *   **Span**: A single hop (e.g., "Service A calling DB").
*   **Use Case**: Finding performance bottlenecks ("Why did this take 3s?"), dependency graphing.

## The Holy Grail: Correlation

The real power comes when you link them:

1.  **Alert** (Metric) fires: "High Error Rate".
2.  **Dashboard** (Metric) shows: "It's jumping on `log-service` pod-xyz".
3.  **Filter Logs** (Log) for `pod-xyz` + `status=500`.
4.  **Find Trace ID** (Log) in one of the error logs.
5.  **View Trace** (Trace) in Jaeger to see *exactly* where it failed (e.g., "Connection Timeout to Redis").

## The Challenge in Kubernetes

In traditional VM monoliths, you just "SSH and grep logs". In 100-node k8s clusters with short-lived pods, this is impossible:
*   **Logs are ephemeral**: Gone when the Pod dies.
*   **Metrics are elusive**: Pods change IPs constantly; you can't statically configure a monitor.
*   **Context is lost**: A request jumps between 10 pods; measuring 1 pod doesn't tell the whole story.

## The Cloud Native Solution

We use specialized tools to **aggregate** and **centralize** this data, independent of the pod lifecycle.

In this course, we use the industry standards (CNCF):

| Pillar | Standard / Protocol | Tool (Visualization/Store) |
| :--- | :--- | :--- |
| **Logs** | JSON / Fluent Bit | **Loki** / ElasticSearch |
| **Metrics** | OpenMetrics | **Prometheus** / Grafana |
| **Traces** | OpenTelemetry | **Jaeger** / Tempo |

---

[Next: Centralized Logging](./step-06-centralized-logging.md)

