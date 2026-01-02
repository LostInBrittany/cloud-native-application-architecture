import express from "express";
import os from "os";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
    console.log(
        JSON.stringify({
            msg: "request",
            method: req.method,
            path: req.path,
            hostname: os.hostname(),
            timestamp: new Date().toISOString()
        })
    );
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
