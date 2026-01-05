# Day 4 Final Challenge: The Production Incident

## 🚨 Scenario: Friday Afternoon, 4:47 PM

You're the on-call engineer for **CloudMart**, an e-commerce platform. Your phone buzzes with alerts:

```
** ALERT: High error rate on /api/orders endpoint
** ALERT: P95 latency > 10s (SLA: 2s)
** ALERT: Multiple pod restarts in production namespace
```

Your manager messages you:

> "Customers are complaining they can't complete purchases. The CEO is in a meeting with investors and keeps refreshing the site. Fix this ASAP!"

**Your mission**: Identify all issues, fix them, and restore the system to healthy operation.

---

## System Architecture

CloudMart consists of 5 microservices:

```
                          ┌─────────────┐
                          │   Gateway   │  (Entry point)
                          └──────┬──────┘
                                 │
                    ┌────────────┼────────────┐
                    │                         │
              ┌─────▼──────┐           ┌─────▼──────┐
              │API Service │           │Auth Service│
              └─────┬──────┘           └────────────┘
                    │
         ┌──────────┼──────────┐
         │                     │
    ┌────▼─────┐        ┌─────▼──────┐
    │  Order   │───────▶│  Database  │
    │ Service  │        │  Service   │
    └────┬─────┘        └────────────┘
         │
    ┌────▼────────┐
    │Notification │
    │  Service    │
    └─────────────┘
```

**Request Flow**:
1. Gateway receives user request
2. API Service authenticates via Auth Service
3. API Service calls Order Service to create order
4. Order Service stores in Database Service
5. Order Service notifies via Notification Service

---

## What You Have

### Tools & Observability Stack

### Tools & Observability Stack

You have full access to:
- **Kubernetes cluster (`kubectl`)** - Your primary tool
- **Standard Linux tools** (`curl`, `grep`)
- **Optional**: You can reinstall the Day 3 Observability stack (Prometheus/Loki/Tempo) if you wish, but `kubectl` is sufficient to solve 100% of the problems.

### Services

All service code is in `services/day-4/broken-production/`:
- `gateway/` - Simple Nginx-based gateway
- `api-service/` - Node.js API orchestrator
- `auth-service/` - Node.js authentication
- `order-service/` - Node.js order processing
- `database-service/` - Simple in-memory "database"
- `notification-service/` - Webhook simulator

### Manifests

Kubernetes manifests are in `k8s/day-4/broken-production/`:
- `01-namespace.yaml`
- `02-gateway.yaml`
- `03-api-service.yaml`
- `04-auth-service.yaml`
- `05-order-service.yaml`
- `06-database-service.yaml`
- `07-notification-service.yaml`

---

## 1. Prepare the Environment

**Recommendation:** Create a clean cluster for this challenge to ensure a fresh start.

```bash
# 1. Delete the old cluster (optional)
k3d cluster delete day4

# 2. Create a fresh cluster for the incident
k3d cluster create brokenprod \
  -p "8080:80@loadbalancer"
```

Now, build and import the broken services into this cluster. We've provided a script to automate this.

```bash
# 3. Build and import all broken service images
chmod +x services/day-4/broken-production/build-and-import.sh
./services/day-4/broken-production/build-and-import.sh brokenprod
```

This script will:
- Build 6 microservices (gateway, api, auth, order, database, notification)
- Import them into your `brokenprod` k3d cluster
- Note: It purposely DOES NOT tag `notification-service:v2.0` (this is part of the challenge!)


---

## 2. Deploy the Broken System

Now, deploy the broken manifests to create the production outage.

```bash
# 1. Deploy the entire broken stack
kubectl apply -f k8s/day-4/broken-production/

# 2. Watch the chaos unfold (wait ~1 minute)
kubectl get pods -n production --watch
```

**Expected Initial State:**
You should see a mix of errors:
- `CrashLoopBackOff`
- `ImagePullBackOff`
- `OOMKilled` (eventually)
- Pods running but not working

**Verify the Broken State:**

```bash
# Forward the gateway port
kubectl port-forward -n production svc/gateway 8080:80 &

# Try to create an order (this SHOULD fail)
curl -v -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{"item": "laptop", "quantity": 1}'
```

**What you might see:**
- Connection refused?
- 502 Bad Gateway?
- 500 Internal Server Error?
- Timeout?

This is your starting point. The system is down. Good luck!

---

## 3. Your Tasks

### Phase 1: Triage (Identify All Issues)

Use your debugging skills from Day 3 and observability tools to identify:

1. **Which services are unhealthy?**
   - Check pod status
   - Check restarts
   - Look at Events

2. **What errors are being logged?**
   - Use `kubectl logs`
   - Use Loki in Grafana
   - Look for stack traces, connection errors, timeouts

3. **Where is time being spent?**
   - Use Tempo distributed tracing
   - Identify slow services
   - Find the bottleneck

4. **Are there resource issues?**
   - Use Prometheus metrics
   - Check CPU/memory usage
   - Look for OOMKilled events

**Document every issue you find** (create a list!). There are multiple problems.

---

### Phase 2: Root Cause Analysis

For each issue, determine:
- **Symptom**: What is failing?
- **Root cause**: Why is it failing?
- **Impact**: How does this affect users?
- **Fix**: What needs to change?

**Example**:
```
Issue #1:
  Symptom: Pod restarting every 30 seconds
  Root Cause: Liveness probe checking wrong port (8080 vs 3000)
  Impact: Service unavailable 50% of the time
  Fix: Change livenessProbe port from 8080 to 3000
```

---

### Phase 3: Fix Everything

1. **Fix one issue at a time**
2. **Apply the fix**: `kubectl apply -f ...`
3. **Verify the fix**: Check logs, metrics, traces
4. **Move to the next issue**

**Don't move on until you understand each fix!**

---

### Phase 4: Verify System Health

After all fixes, the system should:

****All pods Running** with 0 restarts (for at least 2 minutes)
****End-to-end requests succeed** with < 2s latency
****No errors in logs** across any service
****Traces show complete request flow** through all services
****Metrics show healthy resource usage** (CPU < 50%, memory stable)

**Test the system**:
```bash
# Generate 20 orders and measure success rate
for i in {1..20}; do
  curl -X POST http://localhost:8080/api/orders \
    -H "Content-Type: application/json" \
    -d "{\"item\": \"item-$i\", \"quantity\": 1}" \
    -w "\nStatus: %{http_code}, Time: %{time_total}s\n"
  sleep 1
done
```

**Success criteria**:
- 20/20 requests succeed (HTTP 200)
- All requests complete in < 2 seconds
- No errors in any service logs

---

## Hints (Reveal Progressively)

### Hint 1: Start with Pod Status
<details>
<summary>Click for Hint 1</summary>

```bash
kubectl get pods -n production
```

Look for:
- CrashLoopBackOff status
- High restart count
- Pods stuck in Pending

Start debugging the pod with the most restarts first.
</details>

### Hint 2: Check Service Connectivity
<details>
<summary>Click for Hint 2</summary>

```bash
# For each service, check endpoints
kubectl get endpoints -n production

# If a service has no endpoints, check:
kubectl get pods -n production -l app=<service-name> --show-labels
```

Does the Service selector match the Pod labels?
</details>

### Hint 3: Use Distributed Tracing
<details>
<summary>Click for Hint 3</summary>

Once some services are working, generate a request and get its trace ID:

```bash
curl -v http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{"item": "test"}'
```

Look for `traceparent` in response headers or logs.

Go to Grafana → Tempo → Search by trace ID.

Which service is slowest? Why?
</details>

### Hint 4: Check Configuration
<details>
<summary>Click for Hint 4</summary>

```bash
# For each pod, check environment variables
kubectl exec -n production <pod-name> -- env | grep -E "URL|HOST|PORT"
```

Are the dependency URLs correct?
Do they match the actual service names?
</details>

### Hint 5: Resource Constraints
<details>
<summary>Click for Hint 5</summary>

```bash
kubectl describe pod -n production <pod-name>
```

Look for:
- `OOMKilled` in events
- Resource limits vs requests
- Memory/CPU usage

Is the pod being killed because it exceeds limits?
</details>

### Hint 6: Health Probes
<details>
<summary>Click for Hint 6</summary>

For each deployment, check:
- Liveness probe path and port
- Readiness probe configuration
- Initial delay and period

Do the probes match the actual application endpoints?
Are they too aggressive (checking too frequently)?
</details>

### Hint 7: Network Policies & Timeouts
<details>
<summary>Click for Hint 7</summary>

Check application code for:
- HTTP client timeouts
- Retry logic (is there backoff?)
- Connection pooling

Are timeouts too long or too short?
Is aggressive retrying making things worse?
</details>

---

## Suggested Debugging Workflow

1. **Get the big picture**:
   ```bash
   kubectl get all -n production
   ```

2. **Identify the worst offender**:
   ```bash
   kubectl get pods -n production --sort-by=.status.containerStatuses[0].restartCount
   ```

3. **Dive into that pod**:
   ```bash
   kubectl logs -n production <pod-name> --tail=100
   kubectl describe pod -n production <pod-name>
   ```

4. **Fix it, test it, move on**

5. **Once services are stable, test end-to-end**

6. **Use observability to find performance issues**

---

## Expected Issues (Instructor Reference - Don't Peek!)

<details>
<summary> Solution - For Instructors Only</summary>

### Issue List

#### 1. **Database Service - CrashLoopBackOff**
- **Cause**: Missing environment variable `DB_NAME` (required for startup)
- **Symptom**: Pod restarts continuously
- **Fix**: Add `DB_NAME: cloudmart-db` to environment variables

#### 2. **Notification Service - ImagePullBackOff**
- **Cause**: Image tag is `notification-service:v2.0` but doesn't exist
- **Symptom**: Pod stuck in ImagePullBackOff
- **Fix**: Change to `notification-service:latest` or build the correct image

#### 3. **Order Service - Wrong Dependency URL**
- **Cause**: `DATABASE_URL` points to `database:8080` (should be `database-service:8080`)
- **Symptom**: "Connection refused" errors in logs
- **Fix**: Correct the environment variable

#### 4. **API Service - Liveness Probe Wrong Port**
- **Cause**: Liveness probe checks port 8080, app listens on 3000
- **Symptom**: Pod restarts periodically
- **Fix**: Change livenessProbe port to 3000

#### 5. **Gateway - Service Selector Mismatch**
- **Cause**: Service selector is `app: nginx-gateway`, pod label is `app: gateway`
- **Symptom**: No endpoints, requests timeout
- **Fix**: Align selector with pod labels

#### 6. **Auth Service - Resource Limit Too Low**
- **Cause**: Memory limit is 64Mi, actual usage is ~80Mi under load
- **Symptom**: OOMKilled under load
- **Fix**: Increase memory limit to 128Mi

#### 7. **Order Service - Aggressive Retry Logic**
- **Cause**: No backoff in retry logic, retries immediately on failure
- **Symptom**: Amplifies errors, cascading failures
- **Fix**: Add exponential backoff (code change)

#### 8. **Database Service - Artificial Chaos Enabled**
- **Cause**: Environment variable `CHAOS_FAILURE_RATE=0.5` (50% failure)
- **Symptom**: Intermittent 500 errors
- **Fix**: Set `CHAOS_FAILURE_RATE=0` or remove the variable

### Debugging Path

**Order of discovery (likely)**:
1. Database CrashLoopBackOff → fix env var
2. Notification ImagePullBackOff → fix image
3. Gateway no endpoints → fix selector
4. API pod restarts → fix liveness probe
5. Order can't reach database → fix URL
6. Auth OOMKilled under load → increase limit
7. High error rate persists → find chaos flag
8. Slow responses → find retry without backoff

</details>

---

## Reflection

After completing this challenge:

1. **What was the hardest issue to find? Why?**
2. **Which debugging technique was most valuable?**
3. **How did observability tools help (or not help)?**
4. **If this were a real production incident, what would you do differently?**
5. **What preventive measures could avoid these issues?**

---

## Congratulations!

If you successfully debugged and fixed the entire system, you've demonstrated:

**Systematic debugging methodology
**Understanding of Kubernetes internals
**Effective use of observability tools
**Root cause analysis skills
**Production-ready operational thinking

**You're ready to operate cloud native systems in production!** 🎉

---

[Next: Step 6 - What We Didn't Cover (And Why)](./step-06-what-we-didnt-cover.md)
