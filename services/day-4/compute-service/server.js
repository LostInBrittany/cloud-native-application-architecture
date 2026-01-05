const express = require('express');
const app = express();

const port = Number(process.env.PORT ?? 8080);
const APP_VERSION = process.env.APP_VERSION ?? "v1";
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

app.get('/health', (req, res) => {
  res.send('OK');
});

app.get('/compute', async (req, res) => {
  const workUnits = parseInt(req.query.work) || 100;
  const start = Date.now();
  
  let result = 0;
  
  // Break work into chunks that yield control
  async function doWork(remaining) {
    if (remaining <= 0) return;
    
    // Do a small chunk of CPU work (non-blocking)
    for (let i = 0; i < 100000; i++) {
      result += Math.sqrt(i);
    }
    
    // Yield control to event loop
    await new Promise(resolve => setImmediate(resolve));
    
    // Continue with remaining work
    await doWork(remaining - 1);
  }
  
  await doWork(workUnits);
  
  const duration = Date.now() - start;
  res.json({ result, duration, workUnits });
});

app.listen(port, () => {
    console.log(`compute-service starting on port ${port} (version: ${APP_VERSION})`);
});