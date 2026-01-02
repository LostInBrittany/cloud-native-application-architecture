# Step 4 – Retry Strategies & Backoff

## "Network glitches happen"

Sometimes a request fails simply due to a temporary packet loss, a GC pause, or a route update.
If we fail immediately, the user sees an error for a transient issue.

## Goal

Implement robust retry logic using **Exponential Backoff and Jitter**.

## 1. The Theory

### 1.1 Naive Retry (The Storm)

If `Service A` retries immediately 3 times:
1.  `Service B` is overloaded.
2.  `Service A` sends 3x more traffic instantly.
3.  `Service B` is **definitely** dead now.

**Rule**: Never retry without a delay.

### 1.2 Exponential Backoff

Wait longer between each attempt:
1.  Fail -> Wait 100ms
2.  Fail -> Wait 200ms
3.  Fail -> Wait 400ms
4.  Give up.

### 1.3 Jitter (Randomness)

If 100 instances of `Service A` fail at the same time (e.g., due to a brief network blip), and they all retry in exactly 100ms, they will D-DoS `Service B` in synchronized waves (**Thundering Herd** problem).

**Solution**: Add randomness (Jitter).
Wait `BackoffTime + Random(0, 50ms)`.

## 2. Prepare: The "Flaky" Service

We need a service that fails randomly to test our retries.

**Task 2.1**: Create `echo-service-flaky`
1.  Copy `services/day-1/echo-service` (the original simple one) to `services/day-3/echo-service-flaky`.
2.  Modify `services/day-3/echo-service-flaky/server.js` to fail 50% of the time.

Add this middleware at the top:

```javascript
// CHAOS MONKEY
const FLAKY_RATE = 0.5; // 50% chance of failure

app.use((req, res, next) => {
    if (Math.random() < FLAKY_RATE) {
        console.log("💥 Simulating chaos failure (500)");
        return res.status(500).json({ error: "Internal Server Error (Simulated)" });
    }
    next();
});
```

3.  Build and deploy it (create `k8s/day-3/echo-service-flaky.yaml` pointing to this new image).


## 3. Implement Retries in Consumer

Now we modify the consumer to tolerate these failures.

**Task 3.1**: Create `log-service-with-retries`
1.  Copy `services/day-3/log-service-with-tracing` (so we keep our nice JSON logs & trace IDs) to `services/day-3/log-service-with-retries`.
2.  Install `async-retry` or implement a simple loop. Let's do a simple loop for clarity.

**Task 3.2**: Implement Exponential Backoff + Jitter
Update `services/day-3/log-service-with-retries/server.js`:

```javascript
// Helper: Wait function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Fetch with Retry
async function fetchWithRetry(url, options = {}, retriesLeft = 3) {
    const MAX_RETRIES = 3;
    const attempt = MAX_RETRIES - retriesLeft + 1;
    const backoff = 100 * Math.pow(2, attempt - 1); // recalculate backoff based on attempt

    try {
        const response = await fetch(url, options);

        // Success: Return response
        if (response.ok) {
            console.log(`✅ Dependency call succeeded on attempt #${attempt}`);
            return response;
        }

        // Failure (4xx): Do NOT retry client errors
        if (response.status >= 400 && response.status < 500) return response;

        throw new Error(`Server returned ${response.status}`);
    } catch (error) {
        if (retriesLeft === 0) throw error; // No more retries

        // Jitter: Add random 0-50ms to avoid thundering herd
        const jitter = Math.floor(Math.random() * 50);
        const delay = backoff + jitter;

        console.warn(`Request failed: ${error.message}. Retrying in ${delay}ms... (${retriesLeft} retries left)`);
        await sleep(delay);

        // Recursive retry
        return fetchWithRetry(url, options, retriesLeft - 1);
    }
}

// ... Inside your route handler ...
// Replace your old fetch(DEPENDENCY_URL) with:
    try {
        // Ensure you pass the headers for tracing!
        const fetchOptions = {
            headers: {
                'X-Request-ID': req.traceId // Propagate Trace ID
            }
        };
        const response = await fetchWithRetry(DEPENDENCY_URL, fetchOptions);
        // ... (rest of logic)
```

## 4. Verify

1.  Deploy `echo-service-flaky` and `log-service-with-retries` (update ingress `/log` to point to `log-service-with-retries`).
2.  Send requests:
    ```bash
    for i in {1..10}; do curl localhost:8080/log; echo; done
    ```
3.  **Observation**:
    *   `log-service` logs should show warning messages: *"Request failed: Server returned 500. Retrying in 123ms..."*.
    *   But the **Users** (curl) should see `200 OK` almost every time (unless all 3 retries failed).

> You have successfully masked internal instability from the user!

---

[Next: The Three Pillars of Observability](./step-05-three-pillars.md)

