# Step 3 – Distributed Tracing (The Manual Way)

## "Where did my request die?"

In a microservices architecture, a single user action might trigger calls to 5 different services.
If an error occurs, checking the logs of 5 services manually is impossible at scale unless you can correlate them.

## The Solution: Correlation IDs (Trace IDs)

We need to pass a unique ID along the chain:

```text
[Client] -> [Service A] (TraceID=abc) -> [Service B] (TraceID=abc)
```

We will implement this **manually** to understand the mechanism before using tools like OpenTelemetry.

### 2.1 Modify `log-service` (The Initiator)

We need `log-service` to:
1.  Check if a `X-Request-ID` header exists (from Ingress).
2.  If not, generate a new UUID.
3.  **Log it**.
4.  **Propagate it** to `echo-service`.

**Task:**
1.  Copy `services/day-3/log-service-with-timeout` to `services/day-3/log-service-with-tracing`.
2.  Update `services/day-3/log-service-with-tracing/server.js`:

```javascript
import { v4 as uuidv4 } from 'uuid'; // You might need to install this or use crypto.randomUUID()

// ... inside your request handler ...

app.all("*", async (req, res) => {
    // 1. Get or Generate Trace ID
    const traceId = req.headers['x-request-id'] || crypto.randomUUID();

    // 2. Add to Logger Context
    console.log(JSON.stringify({
        msg: "Handling request",
        traceId: traceId,
        // ... other fields
    }));

    // ...

    // 3. Propagate to Dependency
    try {
        const response = await fetch(DEPENDENCY_URL, {
            headers: {
                'X-Request-ID': traceId // <--- CRITICAL: Passing the baton
            },
            signal: controller.signal
        });
        // ...
    }
    // ...
});
```

*(Note: In Node.js > 14, `crypto.randomUUID()` is built-in. No need for npm `uuid`)*

### 2.2 Modify `echo-service` (The Receiver)

We need `echo-service` to:
1.  Read the `X-Request-ID`.
2.  Log it.

**Task:**
1.  Copy `services/day-3/echo-service-with-delay` (or `-step-01`) to `services/day-3/echo-service-with-tracing`.
2.  Update `services/day-3/echo-service-with-tracing/server.js`:

```javascript
app.use((req, res, next) => {
    const traceId = req.headers['x-request-id'] || "unknown";

    console.log(JSON.stringify({
        msg: "request received",
        traceId: traceId, // <--- Correlation happens here
        method: req.method,
        path: req.path
        // ...
    }));
    next();
});
```

### 2.3 Verify

1.  **Rebuild** and **Redeploy** both services (update image tags to `:tracing` or `:latest`).
2.  Send a request:
    ```bash
    curl localhost:8080/log
    ```
3.  **Find the Trace:**
    Get the logs from both services and look for the matching ID.

    ```bash
    # Get logs from log-service
    kubectl logs -l app=log-service --tail=10

    # Get logs from echo-service
    kubectl logs -l app=echo-service --tail=10
    ```

    You should see the **same UUID** in both outputs.

> **Why this matters:**
> If `echo-service` throws an error, you can grep for that TraceID and instantly find the log entry in `log-service` that triggered it.

---

[Next: Retry Strategies](./step-04-retry-strategies.md)

