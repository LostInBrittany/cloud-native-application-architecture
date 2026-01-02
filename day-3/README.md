# Day 3 – Cloud Native Patterns & Observability

## Objectives

At the end of this day, you should be able to:

*   Understand and implement **application-level resilience patterns** (timeouts, retries).
*   Trace a request across multiple services using **distributed tracing**.
*   Explain the "Three Pillars of Observability": **Logs, Metrics, and Traces**.
*   Ship structured logs to a centralized system (conceptually).
*   Expose application metrics and visualize them in **Prometheus & Grafana**.
*   **Debug** a broken distributed application using a systematic approach.

Day 3 helps you move from "It runs on my machine" to "It runs in production and I know what it's doing".

## Context

In Day 1 and 2, we focused on *deployment* and *platform primitives*.
But deploying is only Day 1 stuff.
Real engineering happens when things break—and in distributed systems, they **always** break.

Today we focus on two critical questions:

1.  **Resilience**: How do I keep serving users when a dependency fails?
2.  **Observability**: How do I know *why* it failed?

---

## Morning – Resilience & Patterns

We will purposefully introduce failures and network issues to see how our applications behave.

### Step 1 – Graceful Degradation & Timeouts
👉 [Go to Step 1: Graceful Degradation](./step-01-graceful-degradation.md)

### Step 2 – Distributed Tracing Basics
👉 [Go to Step 2: Distributed Tracing](./step-02-distributed-tracing.md)

### Step 3 – Retry Strategies & Backoff
👉 [Go to Step 3: Retry Strategies](./step-03-retry-strategies.md)

---

## Afternoon – Observability & Debugging

We stop guessing and start measuring.

### Step 4 – The Three Pillars of Observability
👉 [Go to Step 4: The Three Pillars](./step-04-three-pillars.md)

### Step 5 – Centralized Logging
👉 [Go to Step 5: Centralized Logging](./step-05-centralized-logging.md)

### Step 6 – Metrics with Prometheus & Grafana
👉 [Go to Step 6: Metrics & Prometheus](./step-06-metrics-prometheus.md)

### Step 7 – Debugging Distributed Applications
👉 [Go to Step 7: Debugging Challenge](./step-07-debugging.md)

---

## Conclusion & Summary

👉 [Go to Day 3 Summary](./step-08-summary.md)
