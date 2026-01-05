import express from "express";
import os from "os";

import client from 'prom-client';

// Simulate slow startup (configurable via env, default 30 seconds)
const STARTUP_DELAY_MS = Number(process.env.STARTUP_DELAY_MS ?? 30000);
let isStartupComplete = false;

console.log(`Simulating startup delay of ${STARTUP_DELAY_MS}ms...`);
setTimeout(() => {
    isStartupComplete = true;
    console.log('Startup complete!');
}, STARTUP_DELAY_MS);

// 1. Create Registry
const register = new client.Registry();
client.collectDefaultMetrics({ register }); // CPU, Memory, etc.

// 2. Define Custom Metric (RED: Rate & Errors)
const httpRequestCounter = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'path', 'status_code'],
});
register.registerMetric(httpRequestCounter);

const app = express();
app.use(express.json({ limit: "1mb" }));

// 3. Middleware to Count
app.use((req, res, next) => {
    res.on('finish', () => {
        // Only count interesting paths (ignore health checks to reduce noise)
        if (req.path !== '/metrics' && req.path !== '/healthz') {
            httpRequestCounter.inc({
                method: req.method,
                path: req.path,
                status_code: res.statusCode,
            });
        }
    });
    next();
});

// 4. Expose Endpoint
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {

    console.log("Headers:", JSON.stringify(req.headers)); // Debug OTel headers

    console.log(
        JSON.stringify({
            timestamp: new Date().toISOString(),
            msg: "Handling request",
            method: req.method,
            path: req.path,
            hostname: os.hostname(),
        })
    );
    next();
});


// CHAOS MONKEY
const FLAKY_RATE = 0.5; // 50% chance of failure

app.use((req, res, next) => {
    // Don't apply chaos to health checks or metrics
    if (req.path === '/healthz' || req.path === '/metrics') {
        return next();
    }

    if (Math.random() < FLAKY_RATE) {
        console.log(
            JSON.stringify({
                timestamp: new Date().toISOString(),
                msg: "💥 Simulating chaos failure (500)",
                method: req.method,
                path: req.path,
                hostname: os.hostname(),
            })
        );
        return res.status(500).json({ error: "Internal Server Error (Simulated)" });
    }
    next();
});

// SIMULATE LATENCY
const SIMULATE_DELAY_MS = Number(process.env.SIMULATE_DELAY_MS ?? 0);

app.use((req, res, next) => {
    if (SIMULATE_DELAY_MS > 0) {
        // console.log(`Simulating delay of ${SIMULATE_DELAY_MS}ms...`);
        setTimeout(next, SIMULATE_DELAY_MS);
    } else {
        next();
    }
});

const port = Number(process.env.PORT ?? 8080);

const APP_NAME = process.env.APP_NAME ?? "echo-service";
const APP_VERSION = process.env.APP_VERSION ?? "dev";
const FEATURE_FLAG_X = process.env.FEATURE_FLAG_X ?? "off";

/**
 * Startup probe endpoint (checks if slow initialization is complete)
 */
app.get('/startup', (req, res) => {
    if (isStartupComplete) {
        res.status(200).send('ready');
    } else {
        res.status(503).send('starting');
    }
});

/**
 * Health endpoint (for k8s probes later)
 */
app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
});

/**
 * Instance / runtime info (useful to show scaling and ephemeral instances)
 */
app.get("/info", (_req, res) => {
    res.json({
        app: { name: APP_NAME, version: APP_VERSION },
        runtime: {
            node: process.version,
            pid: process.pid,
            hostname: os.hostname(),
            uptimeSeconds: Math.floor(process.uptime())
        }
    });
});

/**
 * Safe config view (demonstrates config outside image)
 */
app.get("/config", (_req, res) => {
    res.json({
        APP_NAME,
        APP_VERSION,
        FEATURE_FLAG_X
    });
});

/**
 * Echo endpoint (simple smoke test, useful for curl)
 */
app.post("/echo", (req, res) => {
    res.json({
        received: req.body,
        meta: {
            method: req.method,
            path: req.path,
            hostname: os.hostname(),
            timestamp: new Date().toISOString()
        }
    });
});

app.listen(port, () => {
    // Intentionally log config at startup (safe subset only)
    console.log(
        JSON.stringify(
            {
                msg: "service started",
                port,
                APP_NAME,
                APP_VERSION,
                FEATURE_FLAG_X,
                SIMULATE_DELAY_MS
            },
            null,
            2
        )
    );
});
