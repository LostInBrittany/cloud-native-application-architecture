# Day 4 Final Challenge - Implementation Status

## **Completed**

### Documentation
- **step-05-final-challenge.md** - Comprehensive student-facing challenge document
  - Realistic scenario (Friday afternoon production incident)
  - Clear architecture diagram
  - Phased approach (Triage → RCA → Fix → Verify)
  - Progressive hint system
  - Success criteria
  - Reflection questions

### Kubernetes Manifests (Intentionally Broken)
- **01-namespace.yaml** - Production namespace
- **02-gateway.yaml** - Nginx gateway with selector bug
- **03-api-service.yaml** - API orchestrator with liveness probe bug
- **04-auth-service.yaml** - Auth service with memory limit bug
- **05-order-service.yaml** - Order service with wrong dependency URL
- **06-database-service.yaml** - Database with missing env var + chaos
- **07-notification-service.yaml** - Notification with wrong image tag

### Service Implementation (Node.js + Express)
- **api-service**: Orchestrator, listening on 3000 (probe checks 8080)
- **auth-service**: Token validator with memory leak (OOMKills 64Mi limit)
- **order-service**: Aggressive retry logic (no backoff), points to wrong DB host
- **database-service**: In-memory store, crashes if `DB_NAME` missing, 50% chaos failure
- **notification-service**: Simple webhook mock (missing image tag v2.0)
- **gateway**: Custom Nginx configuration
- **Build Script**: `services/day-4/broken-production/build-and-import.sh`

### Instructor Resources
- **broken-production/README.md** - Complete bug list and solutions

---

## 🚧 TODO: Final Verification


### Service Template (Node.js + Express)

```javascript
// services/day-4/broken-production/<service-name>/server.js
import express from 'express';
import os from 'os';

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'unknown';

app.use(express.json());

// Health endpoint (required for probes)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: SERVICE_NAME });
});

// Service-specific endpoints here...

app.listen(PORT, () => {
  console.log(JSON.stringify({
    msg: 'Service started',
    service: SERVICE_NAME,
    port: PORT,
    hostname: os.hostname()
  }));
});
```

### Quick Implementation Steps

1. **Create each service directory**:
   ```bash
   mkdir -p services/day-4/broken-production/{api-service,auth-service,order-service,database-service,notification-service}
   ```

2. **For each service**:
   - Create `server.js` with basic Express app
   - Create `package.json` with dependencies
   - Create `Dockerfile` (copy from day-3 services)
   - Add service-specific logic
   - Build and tag images:
     ```bash
     docker build -t <service-name>:latest services/day-4/broken-production/<service-name>
     ```

3. **Load into k3d**:
   ```bash
   k3d image import <service-name>:latest -c <your-cluster>
   ```

---

## Service Implementation Priorities

### Phase 1: Minimum Viable (60% functionality)
1. **database-service** - Simple in-memory store with chaos mode
2. **notification-service** - Just returns 200 OK
3. **api-service** - Proxies to order-service
4. **auth-service** - Always returns valid
5. **order-service** - Calls database + notification with retry bug

### Phase 2: Enhanced (100% functionality)
1. Add OpenTelemetry to all services
2. Add proper error handling
3. Add structured logging
4. Add Prometheus metrics
5. Test end-to-end flow

---

## Testing Without Service Code

If you don't have time to implement services, you can:

1. **Use placeholder images**:
   ```yaml
   image: hashicorp/http-echo:latest
   ```

2. **Focus on infrastructure bugs only**:
   - Gateway selector mismatch
   - API liveness probe
   - Auth memory limits
   - Order dependency URL
   - Database missing env var
   - Notification image tag

3. **Simplify the scenario**:
   - Skip the code-level bugs (retry logic, chaos)
   - Focus on Kubernetes-level debugging

---

## Alternative: Use Existing Services

You could reuse and adapt existing services:

```bash
# Use echo-service variants
cp -r services/day-3/echo-service-with-otel services/day-4/broken-production/api-service
cp -r services/day-3/echo-service-with-otel services/day-4/broken-production/auth-service
# etc.
```

Then rename them and add the specific bugs in manifests only.

---

## Estimated Implementation Time

- **Minimal** (just manifests, use placeholder images): Already done!
- **Basic** (simple Node.js services): ~2-3 hours
- **Full** (with OTel, proper logic, tests): ~6-8 hours

---

## Next Steps

1. Decide on service implementation approach:
   - [ ] Full custom services (best learning experience)
   - [ ] Reuse existing services with tweaks
   - [ ] Use placeholder images (focus on K8s bugs only)

2. Build and test the scenario:
   - [ ] Deploy to a test cluster
   - [ ] Verify all bugs are discoverable
   - [ ] Time the exercise (target: 45-90 minutes)

3. Create solution manifests:
   - [ ] Copy broken-production/ to broken-production-SOLUTIONS/
   - [ ] Fix all bugs
   - [ ] Test end-to-end

4. Prepare for delivery:
   - [ ] Pre-build all Docker images
   - [ ] Load images into cluster before class
   - [ ] Test that students can discover issues independently

---

## Questions to Consider

1. **How much time do you want students to spend?**
   - 30-45 min: Focus on obvious bugs (4-5 issues)
   - 60-90 min: Full challenge (8 issues)
   - 2+ hours: Add custom code analysis

2. **Should services be real or mocks?**
   - Real: Better learning, more realistic
   - Mocks: Easier to set up, less moving parts

3. **Observability stack ready?**
   - Do students have Prometheus/Loki/Tempo running?
   - Are they comfortable using Grafana?

Let me know which direction you'd like to go and I can help build out the services!
