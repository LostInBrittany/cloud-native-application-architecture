import express from "express";
import os from "os";

const app = express();
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT ?? 8080);
const APP_VERSION = process.env.APP_VERSION ?? "v1";
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
// [NEW] Read feature flag from ConfigMap
const PROCESS_NAME = process.env.PROCESS_NAME ?? "";
// [NEW] Read secret from Secret
const API_KEY = process.env.API_KEY ?? "";

// Middleware to log every request
app.use((req, res, next) => {
    const context = {
        timestamp: new Date().toISOString(),
        // [NEW] Add process name if it exists (from ConfigMap)
        process: PROCESS_NAME || undefined,
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

// [NEW] Health state
let isHealthy = true;

// [NEW] Health probe endpoint
app.get("/healthz", (req, res) => {
    if (isHealthy) {
        res.status(200).json({ status: "OK" });
    } else {
        res.status(500).json({ status: "Unhealthy" });
    }
});

// [NEW] Protected Admin Route (Requires API Key from Secret)
app.get("/admin", (req, res) => {
    const authHeader = req.headers["x-api-key"];

    // If API_KEY is set in env, enforce it
    if (API_KEY && authHeader !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized. Missing or invalid X-API-KEY." });
    }

    res.json({
        message: "Admin access granted.",
        secrets: {
            apiKey: "****** (hidden)",
            internalState: "secure"
        }
    });
});

// [NEW] Admin endpoint to sabotage the app
app.post("/admin/break", (req, res) => {
    const authHeader = req.headers["x-api-key"];
    if (API_KEY && authHeader !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized. Missing or invalid X-API-KEY." });
    }

    isHealthy = false;
    console.log("⚠️ Application sabotaged! /healthz will now return 500.");
    res.json({ message: "Application broken successfully. Good luck!" });
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
            logLevel: LOG_LEVEL,
            processName: PROCESS_NAME // [NEW] Show config
        }
    });
});

app.listen(port, () => {
    console.log(`log-service starting on port ${port} (version: ${APP_VERSION})`);
});
