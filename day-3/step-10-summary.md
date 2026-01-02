# Day 3 – Summary & Takeaways

## What we learned today

We moved from "deploying containers" to "operating a system".

### 1. Resilience is Mandatory
*   Services **will** fail.
*   **Timeouts** prevent cascading failures.
*   **Retries** (with Backoff/Jitter) rescue transient errors.
*   **Circuit Breakers** give failing systems a break.

### 2. Observability is "Why", Monitoring is "What"
*   **Logs**: The detailed story (Structured JSON is a must).
*   **Metrics**: The high-level trends (RED Method).
*   **Tracing**: The map of the journey.

### 3. Debugging is a Process, not Magic
*   Using `kubectl` to inspect the state.
*   Using `port-forward` and `run` to isolate variables.

---

## Looking ahead to Day 4

Now that we have a resilient, observable system, how do we manage it at scale?

In **Day 4**, we will explore:
*   **Service Mesh** (Istio/Linkerd): Automating all the things we did today (Retries, Tracing, mTLS) without code changes.
*   **Serverless**: Running code without managing Pods.
*   **GitOps**: Managing the cluster state via Git.
