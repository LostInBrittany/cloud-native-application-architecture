import express from "express";
import os from "os";

import client from 'prom-client';

// 1. Create Registry
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// 2. Define Custom Metric
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

// Health check endpoint
app.get('/healthz', (req, res) => {
    res.status(200).send('ok');
});

const port = Number(process.env.PORT ?? 8080);
const APP_VERSION = process.env.APP_VERSION ?? "v1";
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

// Middleware to log
app.use((req, res, next) => {
    const context = {
        timestamp: new Date().toISOString(),
        msg: "Handling request",
        method: req.method,
        path: req.path,
        hostname: os.hostname(),
        version: APP_VERSION,
    };
    console.log(JSON.stringify(context));
    next();
});

const DEPENDENCY_URL = process.env.DEPENDENCY_URL || "http://echo-service:8080/info";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// FETCH WITH RETRY (USING NATIVE FETCH)
async function fetchWithRetry(url, options = {}, retriesLeft = 3) {
    const MAX_RETRIES = 3;
    const attempt = MAX_RETRIES - retriesLeft + 1;
    const backoff = 100 * Math.pow(2, attempt - 1);

    try {
        // Native fetch call with timeout using AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: options.headers,
            body: options.body,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            console.log(`✅ Dependency call succeeded on attempt #${attempt}`);
            return response;
        }

        // Don't retry on 4xx client errors
        if (response.status >= 400 && response.status < 500) {
            return response;
        }

        throw new Error(`Server returned ${response.status}`);
    } catch (error) {
        if (retriesLeft === 0) throw error;

        const jitter = Math.floor(Math.random() * 50);
        const delay = backoff + jitter;

        console.warn(`Request failed: ${error.message}. Retrying in ${delay}ms... (${retriesLeft} retries left)`);
        await sleep(delay);

        return fetchWithRetry(url, options, retriesLeft - 1);
    }
}

app.all("*", async (req, res) => {
    let dependencyInfo = null;

    try {
        console.log(`Calling dependency: ${DEPENDENCY_URL}`);

        // OTel handles Context Propagation automatically with fetch/HTTP
        const response = await fetchWithRetry(DEPENDENCY_URL);

        if (response.ok) {
            dependencyInfo = await response.json();
        } else {
            dependencyInfo = { error: `Dependency returned ${response.status}` };
        }

    } catch (error) {
        console.error("Dependency call failed:", error.message);
        dependencyInfo = { error: error.message };
    }

    res.json({
        message: "Hello from log-service",
        received: {
            method: req.method,
            path: req.path,
            headers: req.headers
        },
        enrichment: dependencyInfo,
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
