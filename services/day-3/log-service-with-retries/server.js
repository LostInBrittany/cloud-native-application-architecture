import express from "express";
import os from "os";

const app = express();
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT ?? 8080);
const APP_VERSION = process.env.APP_VERSION ?? "v1";
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

// Middleware to log every request
// Middleware to log every request
app.use((req, res, next) => {
    // 1. Get or Generate Trace ID
    const traceId = req.headers['x-request-id'] || crypto.randomUUID();

    // Attach traceId to request object for use in route handlers
    req.traceId = traceId;

    const context = {
        timestamp: new Date().toISOString(),
        msg: "Handling request",
        traceId: traceId,
        method: req.method,
        path: req.path,
        hostname: os.hostname(),
        version: APP_VERSION,
        // headers: req.headers, // Optional: reduce noise
    };

    // Log to stdout (standard way in K8s)
    console.log(JSON.stringify(context));

    next();
});


// Mock dependency URL (in K8s this would be the service DNS)
const DEPENDENCY_URL = process.env.DEPENDENCY_URL || "http://echo-service:8080/info";

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

app.all("*", async (req, res) => {
    let dependencyInfo = null;

    try {
        console.log(`Calling dependency: ${DEPENDENCY_URL}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout

        try {
            const fetchOptions = {
                signal: controller.signal,
                headers: {
                    'X-Request-ID': req.traceId // <--- Use ID from middleware
                }
            };
            const response = await fetchWithRetry(DEPENDENCY_URL, fetchOptions);
            if (response.ok) {
                dependencyInfo = await response.json();
            } else {
                dependencyInfo = { error: `Dependency returned ${response.status}` };
            }
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn("Dependency call timed out");
            dependencyInfo = { error: "upstream_dependency_timeout", degraded: true };
        } else {
            console.error("Dependency call failed:", error.message);
            dependencyInfo = { error: error.message };
        }
    }

    res.json({
        message: "Hello from log-service",
        received: {
            method: req.method,
            path: req.path,
            query: req.query,
            body: req.body,
            headers: req.headers
        },
        enrichment: dependencyInfo, // The data from the slow service
        environment: {
            hostname: os.hostname(),
            version: APP_VERSION,
            logLevel: LOG_LEVEL
        }
    });
});

app.listen(port, () => {
    console.log(`log-service starting on port ${port} (version: ${APP_VERSION})`);
});
