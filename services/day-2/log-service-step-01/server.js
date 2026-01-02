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

app.all("*", (req, res) => {
    res.json({
        message: "Hello from log-service",
        received: {
            method: req.method,
            path: req.path,
            query: req.query,
            body: req.body,
            headers: req.headers
        },
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
