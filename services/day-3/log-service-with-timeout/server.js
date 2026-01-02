import express from "express";
import os from "os";

const app = express();
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT ?? 8080);
const APP_VERSION = process.env.APP_VERSION ?? "v1";
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

// Middleware to log every request
app.use((req, res, next) => {
    const context = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        hostname: os.hostname(),
        version: APP_VERSION,
        headers: req.headers,
    };

    // Log to stdout (standard way in K8s)
    console.log(JSON.stringify(context));

    next();
});


// Mock dependency URL (in K8s this would be the service DNS)
const DEPENDENCY_URL = process.env.DEPENDENCY_URL || "http://echo-service:8080/info";

app.all("*", async (req, res) => {
    let dependencyInfo = null;

    try {
        console.log(`Calling dependency: ${DEPENDENCY_URL}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout

        try {
            const response = await fetch(DEPENDENCY_URL, { signal: controller.signal });
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
