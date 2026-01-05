# Step 2 – Autoscaling & Availability

## Overview

In production, your services face two challenges:
1. **Variable load** - Traffic spikes during peak hours, drops at night
2. **Cluster maintenance** - Nodes get updated, pods get evicted

**The Questions:**
- How do you scale pods automatically based on demand?
- How do you ensure your service stays available during maintenance?
- How do you handle slow-starting applications?

This step covers the production-readiness patterns that keep your services running smoothly.

---

## 1. Horizontal Pod Autoscaler (HPA)

### 1.1 The Problem: Fixed Replicas

Look at your current deployment:

```bash
kubectl get deployment compute-service -n production
```

You'll see something like:
```
NAME              READY   UP-TO-DATE   AVAILABLE   AGE
compute-service   1/1     1            1           2h
```

**Fixed at 1 replica.** What happens when:
- Traffic spikes 10x during a sale?
- One pod crashes?

### 1.2 The Solution: Horizontal Pod Autoscaler

HPA automatically scales pods based on metrics (CPU, memory, custom metrics).

**How it works:**
1. HPA queries metrics from the Metrics Server
2. Compares current metric value to target
3. Calculates desired replicas: `desiredReplicas = currentReplicas * (currentMetric / targetMetric)`
4. Scales the deployment up or down

### 1.3 Verify Metrics Server

k3s (which k3d uses) includes Metrics Server by default in recent versions (v1.21+). Verify it's running:

```bash
kubectl get deployment metrics-server -n kube-system
```

You should see:
```
NAME             READY   UP-TO-DATE   AVAILABLE   AGE
metrics-server   1/1     1            1           5m
```

Test that metrics are available:

```bash
kubectl top nodes
kubectl top pods -n production
```

You should see CPU and memory usage for nodes and pods.

**If Metrics Server is not installed** (older k3d versions), install it:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# k3d needs TLS verification disabled for metrics-server
kubectl patch deployment metrics-server -n kube-system --type='json' -p='[
  {
    "op": "add",
    "path": "/spec/template/spec/containers/0/args/-",
    "value": "--kubelet-insecure-tls"
  }
]'

# Wait for it to be ready
kubectl wait --for=condition=available --timeout=60s deployment/metrics-server -n kube-system
```

### 1.4 Deploy the Compute Service

First, we need a CPU-intensive service to demonstrate autoscaling. The echo-service is too lightweight to trigger CPU-based scaling.

**Deploy compute-service:**

```bash
kubectl apply -f k8s/day-4/compute-service.yaml
kubectl apply -f k8s/day-4/ingress-step-02.yaml
```

The compute-service performs CPU-intensive prime number calculations that periodically yield to the event loop. This allows:
- Multiple concurrent requests to share CPU time
- CPU usage to scale proportionally with concurrent load
- HPA to trigger when aggregate CPU crosses the 50% threshold

**Why periodic yielding?** Without yielding (`setImmediate`), Node.js would block the event loop, processing one request at a time. With yielding every 10,000 iterations, multiple concurrent requests execute interleaved, creating cumulative CPU load.

Test it:

```bash
curl "http://production.localhost:8080/compute?limit=100000"
```

### 1.5 Create an HPA

Create `k8s/day-4/compute-service-hpa.yaml`:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: compute-service-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: compute-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: AverageValue
          averageValue: 200m  # Scale when average CPU > 200m
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 60  # Wait 60s before scaling down
      policies:
        - type: Percent
          value: 50  # Scale down by max 50% of current pods
          periodSeconds: 15
    scaleUp:
      stabilizationWindowSeconds: 0  # Scale up immediately
      policies:
        - type: Percent
          value: 100  # Double the pods
          periodSeconds: 15
        - type: Pods
          value: 4  # Or add 4 pods
          periodSeconds: 15
      selectPolicy: Max  # Use whichever gives more pods
```

**Why use `AverageValue` instead of `Utilization`?**

There are two ways to configure CPU-based HPA:

1. **`Utilization` (percentage-based)**: Scales based on % of CPU *requests*
   - Example: `averageUtilization: 50` means "scale when CPU > 50% of the request"
   - Problem: If request is 100m but pods use 500m, that's 500% utilization!
   - Can cause unexpected scaling behavior

2. **`AverageValue` (absolute)**: Scales based on absolute CPU usage
   - Example: `averageValue: 200m` means "scale when average CPU > 200 millicores"
   - Clearer and more predictable
   - **This is what we're using**

**How HPA decides when to scale:**

The HPA uses this formula to calculate desired replicas:

```
desiredReplicas = ceil(currentReplicas * (currentMetricValue / targetMetricValue))
```

For example, if you have:
- **2 current replicas**
- **Current CPU: 250m** (averaged across all pods)
- **Target CPU: 200m**

Then: `desiredReplicas = ceil(2 * (250 / 200)) = ceil(2.5) = 3 replicas`

The HPA checks metrics every **15 seconds** by default and scales when the current value differs from the target.

**How the scaling behavior policies work:**

The `behavior` section controls **how fast** the HPA scales, not **when** it scales:

**Scale Up policies:**
```yaml
stabilizationWindowSeconds: 0  # Scale up immediately when needed
policies:
  - type: Percent
    value: 100  # Can double the current pod count
    periodSeconds: 15
  - type: Pods
    value: 4    # Can add 4 pods
    periodSeconds: 15
selectPolicy: Max  # Use whichever gives MORE pods
```

This means: Every 15 seconds, the HPA can either:
- **Double** the current replicas (100% increase), OR
- **Add 4 pods**, whichever is MORE

Example: If you have 2 pods and need to scale up:
- Option 1: 2 * 100% = 2 more pods → total 4 pods
- Option 2: 2 + 4 = 6 pods
- **Result:** Scales to 6 pods (because `selectPolicy: Max`)

**Scale Down policies:**
```yaml
stabilizationWindowSeconds: 60  # Wait 60s before scaling down
policies:
  - type: Percent
    value: 50   # Can remove max 50% of current pods
    periodSeconds: 15
```

This means: After load decreases, wait **60 seconds** to ensure it's not a temporary dip. Then, every 15 seconds, remove at most **50% of current pods**.

Example: If you have 6 pods and need to scale down:
- Every 15s: remove at most 50% → 6 → 3 → (wait 15s) → 2 (minimum reached)

**What this achieves:**
- Maintains between 2-10 replicas
- Targets 200m CPU (absolute) across all pods
- Scales up aggressively (adds 4 pods or doubles, whichever is more)
- Scales down conservatively (max 50% reduction every 15s, after waiting 60s)

Apply it:

```bash
kubectl apply -f k8s/day-4/compute-service-hpa.yaml
```

Check the HPA status:

```bash
kubectl get hpa -n production
```

You should see:
```
NAME                   REFERENCE                    TARGETS        MINPODS   MAXPODS   REPLICAS   AGE
compute-service-hpa    Deployment/compute-service   cpu: 1m/200m   2         10        2          10s
```

**Note:** The TARGETS column may initially show `<unknown>/200m` for 15-30 seconds while the Metrics Server collects the first CPU metrics. Wait a moment and check again.

The deployment now has **2 replicas** (the minimum).

### 1.6 Test Load-Based Scaling

Generate load to trigger autoscaling:

```bash
# Install oha (HTTP load generator - modern replacement for hey)
# On macOS: brew install oha
# On Linux: cargo install oha
# Alternative: Use k6 (brew install k6) or wrk (brew install wrk)

# Generate sustained CPU load: 2 concurrent requests for 180 seconds
oha -c 2 -z 180s "http://production.localhost:8080/compute?work=1000000000000"
```

**Why these parameters?**
- `-c 2`: 2 concurrent connections (enough to push CPU over 200m)
- `-z 180s`: Run for 180 seconds (3 minutes) to observe scaling behavior
- `work=1000000000000`: Large work value to ensure sustained CPU usage

While the load runs, watch the HPA in another terminal:

```bash
kubectl get hpa -n production -w
```

You should see something like:
```
NAME                   REFERENCE                    TARGETS        MINPODS   MAXPODS   REPLICAS
compute-service-hpa    Deployment/compute-service   cpu: 1m/200m   2         10        2
compute-service-hpa    Deployment/compute-service   cpu: 218m/200m 2         10        2
compute-service-hpa    Deployment/compute-service   cpu: 250m/200m 2         10        2
compute-service-hpa    Deployment/compute-service   cpu: 251m/200m 2         10        3
compute-service-hpa    Deployment/compute-service   cpu: 250m/200m 2         10        3
compute-service-hpa    Deployment/compute-service   cpu: 314m/200m 2         10        5
compute-service-hpa    Deployment/compute-service   cpu: 250m/200m 2         10        5
compute-service-hpa    Deployment/compute-service   cpu: 200m/200m 2         10        5
```

The HPA scales up when average CPU > 200m, then scales down after load stops (with a 60s stabilization window).

**Watch the pods scale:**

```bash
kubectl get pods -n production -l app=compute-service -w
```

**Describe the HPA for details:**

```bash
kubectl describe hpa compute-service-hpa -n production
```

You'll see events like:
```
Events:
  Type    Reason             Age   From                       Message
  ----    ------             ----  ----                       -------
  Normal  SuccessfulRescale  2m    horizontal-pod-autoscaler  New size: 4; reason: cpu resource utilization above target
  Normal  SuccessfulRescale  1m    horizontal-pod-autoscaler  New size: 2; reason: All metrics below target
```

---

## 2. Pod Disruption Budgets (PDB)

### 2.1 The Problem: Voluntary Disruptions

Kubernetes performs maintenance that evicts pods:
- Node drains (upgrades, scaling down)
- Cluster autoscaler removing nodes
- Manual `kubectl drain`

**Without PDB:** All your pods could be evicted at once, causing downtime.

### 2.2 The Solution: Pod Disruption Budgets

PDB ensures a minimum number of pods stay available during voluntary disruptions.

Create `k8s/day-4/compute-service-pdb.yaml`:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: compute-service-pdb
  namespace: production
spec:
  minAvailable: 1  # At least 1 pod must remain available
  selector:
    matchLabels:
      app: compute-service
```

**Alternative approaches:**

```yaml
# Option 1: Minimum available (what we're using)
minAvailable: 1

# Option 2: Maximum unavailable
maxUnavailable: 1

# Option 3: Percentage
minAvailable: 50%  # At least 50% of pods must be available
```

Apply it:

```bash
kubectl apply -f k8s/day-4/compute-service-pdb.yaml
```

### 2.3 Test PDB Protection

Check current pods and which nodes they're on:

```bash
kubectl get pods -n production -l app=compute-service -o wide
```

You should see output like:
```
NAME                               READY   STATUS    NODE
compute-service-658d9c9cc-abc12    1/1     Running   k3d-day3-agent-0
compute-service-658d9c9cc-def34    1/1     Running   k3d-day3-agent-1
```

Note which nodes have `compute-service` pods. You should have at least 2 pods (from HPA minimum).

**Simulate a node drain:**

To see the PDB in action, you need to drain a node that **has** `compute-service` pods on it.

```bash
# First, identify a node with compute-service pods
NODE_TO_DRAIN=$(kubectl get pods -n production -l app=compute-service -o jsonpath='{.items[0].status.hostIP}' | xargs -I {} kubectl get nodes -o jsonpath='{.items[?(@.status.addresses[0].address=="{}")].metadata.name}')

echo "Draining node: $NODE_TO_DRAIN"

# Drain the node
kubectl drain $NODE_TO_DRAIN --ignore-daemonsets --delete-emptydir-data
```

**What happens:**

1. **If you have 2 pods on different nodes:**
   - Kubernetes will evict the pod on the drained node
   - The other pod remains running (satisfies `minAvailable: 1`)
   - Drain succeeds, but takes time as it waits for the evicted pod to reschedule

2. **If both pods are on the same node:**
   - Kubernetes tries to evict both pods
   - PDB blocks the eviction because it would violate `minAvailable: 1`
   - You'll see: `error when evicting pods/... Cannot evict pod as it would violate the pod's disruption budget`
   - The drain will wait indefinitely (you can Ctrl+C to cancel)

**To see the PDB block a drain** (optional advanced test):

Force all pods onto one node, then try to drain it:

```bash
# Get the node name where compute-service pods are running
NODE_NAME=$(kubectl get pods -n production -l app=compute-service -o jsonpath='{.items[0].spec.nodeName}')

# Add a node affinity to force all pods to that node
kubectl patch deployment compute-service -n production --type='json' -p='[
  {
    "op": "add",
    "path": "/spec/template/spec/affinity",
    "value": {
      "nodeAffinity": {
        "requiredDuringSchedulingIgnoredDuringExecution": {
          "nodeSelectorTerms": [{
            "matchExpressions": [{
              "key": "kubernetes.io/hostname",
              "operator": "In",
              "values": ["'$NODE_NAME'"]
            }]
          }]
        }
      }
    }
  }
]'

# Wait for pods to reschedule
kubectl wait --for=condition=ready pod -l app=compute-service -n production --timeout=60s

# Now try to drain that node - PDB will block it!
kubectl drain $NODE_NAME --ignore-daemonsets --delete-emptydir-data --timeout=30s
```

You'll see the drain fail with a PDB violation error.

### 2.4 Understanding Cordon and Uncordon

When you drain a node, Kubernetes actually performs two operations:

1. **Cordon**: Marks the node as unschedulable (no new pods can be placed on it)
2. **Drain**: Evicts existing pods from the node

After draining, the node remains **cordoned** - it won't accept new pods until you **uncordon** it.

**Check node status:**

```bash
kubectl get nodes
```

You'll see:
```
NAME                 STATUS                     ROLES    AGE
k3d-day3-agent-0     Ready,SchedulingDisabled   <none>   1h
k3d-day3-agent-1     Ready                      <none>   1h
```

Notice `SchedulingDisabled` - this means the node is cordoned.

**What this means:**
- Existing pods on other nodes: ✅ Keep running
- New pods (from scaling, restarts): ❌ Won't be scheduled to the cordoned node
- The node is "offline" for scheduling purposes

**To make the node available again, you must uncordon it:**

```bash
kubectl uncordon $NODE_TO_DRAIN
```

This removes the `SchedulingDisabled` taint and allows new pods to be scheduled on the node again.

**Clean up the test:**

```bash
# Remove the node affinity
kubectl patch deployment compute-service -n production --type='json' -p='[{"op": "remove", "path": "/spec/template/spec/affinity"}]'

# Uncordon the node
kubectl uncordon $NODE_TO_DRAIN
```

**Check PDB status:**

```bash
kubectl get pdb -n production
```

Output:
```
NAME                    MIN AVAILABLE   MAX UNAVAILABLE   ALLOWED DISRUPTIONS   AGE
compute-service-pdb     1               N/A               1                     5m
```

`ALLOWED DISRUPTIONS: 1` means we can safely evict 1 pod while maintaining our minAvailable.

**Describe the PDB for details:**

```bash
kubectl describe pdb compute-service-pdb -n production
```

You'll see:
```
Status:
  Current Number Scheduled:        2
  Desired Healthy:                 1
  Disruptions Allowed:             1
  Expected Pods:                   2
  Observed Generation:             1
```

This confirms that with 2 pods running, we can disrupt 1 pod while keeping 1 available.

---

## 3. Startup Probes for Slow-Starting Applications

### 3.1 The Problem: Slow Initialization

Some applications take time to start:
- Loading large datasets
- Connecting to external services
- Compiling/warming up caches

**The issue with liveness probes:**
- If liveness probe timeout is too short: Kubernetes kills the pod during legitimate startup
- If liveness probe timeout is too long: Kubernetes waits too long to detect actual failures

### 3.2 The Solution: Startup Probes

Startup probes handle slow initialization separately from runtime health checks.

**How it works:**
1. **Startup probe** runs first (with longer timeout/more attempts)
2. Once startup probe succeeds, it stops running
3. **Liveness and readiness probes** take over for runtime health

### 3.3 Example: Slow-Starting Service

Create a service that simulates slow startup:

**Copy and modify the service:**

```bash
cp -r services/day-4/echo-service-hardened services/day-4/echo-service-slow-start
```

Edit `services/day-4/echo-service-slow-start/server.js` and add at the top (after requires):

```javascript
// Simulate slow startup (30 seconds)
const STARTUP_DELAY_MS = 30000;
let isStartupComplete = false;

console.log(`Simulating startup delay of ${STARTUP_DELAY_MS}ms...`);
setTimeout(() => {
    isStartupComplete = true;
    console.log('Startup complete!');
}, STARTUP_DELAY_MS);
```

Then add a `/startup` endpoint before the other routes:

```javascript
// Startup probe endpoint
app.get('/startup', (req, res) => {
    if (isStartupComplete) {
        res.status(200).send('ready');
    } else {
        res.status(503).send('starting');
    }
});
```

**Build and import:**

```bash
docker build -t echo-service-slow-start:latest services/day-4/echo-service-slow-start
k3d image import echo-service-slow-start:latest -c day4
```

**Create deployment with startup probe:**

Create `k8s/day-4/echo-service-slow-start.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: echo-service-slow
  namespace: production
  labels:
    app: echo-service-slow
spec:
  replicas: 1
  selector:
    matchLabels:
      app: echo-service-slow
  template:
    metadata:
      labels:
        app: echo-service-slow
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 2000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: echo-service
          image: echo-service-slow-start:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          env:
            - name: APP_NAME
              value: "echo-service-slow"
            - name: PORT
              value: "8080"
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
            readOnlyRootFilesystem: true
          volumeMounts:
            - name: tmp
              mountPath: /tmp
          resources:
            requests:
              memory: "32Mi"
              cpu: "50m"
            limits:
              memory: "128Mi"
              cpu: "200m"
          # Startup probe: More lenient, only runs during startup
          startupProbe:
            httpGet:
              path: /startup
              port: 8080
            initialDelaySeconds: 0
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 10  # 10 attempts * 5s = 50s max startup time
          # Liveness probe: Stricter, runs after startup
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3  # Kill pod after 3 failed checks
          # Readiness probe: Determines if pod receives traffic
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 0
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 2
      volumes:
        - name: tmp
          emptyDir: {}
      automountServiceAccountToken: false
```

**Deploy and watch:**

```bash
kubectl apply -f k8s/day-4/echo-service-slow-start.yaml

# Watch the pod start
kubectl get pods -n production -l app=echo-service-slow -w
```

You'll see:
```
NAME                                READY   STATUS    RESTARTS   AGE
echo-service-slow-xxxxxxxxx-xxxxx   0/1     Running   0          5s
echo-service-slow-xxxxxxxxx-xxxxx   0/1     Running   0          10s
...
echo-service-slow-xxxxxxxxx-xxxxx   1/1     Running   0          35s
```

The pod stays `0/1` (not ready) during startup, then becomes `1/1` after the startup probe succeeds.

**Without startup probe,** the liveness probe would have killed the pod during the 30s startup!

### 3.4 Test It: What Happens Without Startup Probe?

To see why startup probes are essential, let's test what happens without one.

**Temporarily remove the startup probe:**

```bash
kubectl patch deployment echo-service -n production --type='json' -p='[
  {
    "op": "remove",
    "path": "/spec/template/spec/containers/0/startupProbe"
  }
]'
```

**Watch the pod restart loop:**

```bash
kubectl get pods -n production -l app=echo-service -w
```

You'll see:
```
NAME                            READY   STATUS    RESTARTS   AGE
echo-service-xxxxxxxxx-xxxxx    0/1     Running   0          5s
echo-service-xxxxxxxxx-xxxxx    0/1     Running   1          15s   ← Restarted!
echo-service-xxxxxxxxx-xxxxx    0/1     Running   2          25s   ← Restarted again!
```

**Why?** The liveness probe starts checking `/healthz` after 5 seconds (initialDelaySeconds). But the app is still in its 30-second startup phase, so it might not respond properly. After 3 failed checks (failureThreshold: 3), Kubernetes kills the pod.

**Check the events:**

```bash
kubectl describe pod -n production -l app=echo-service | grep -A 5 Events
```

You'll see:
```
Events:
  Type     Reason     Age   From               Message
  ----     ------     ----  ----               -------
  Warning  Unhealthy  10s   kubelet            Liveness probe failed: ...
  Normal   Killing    10s   kubelet            Container echo-service failed liveness probe, will be restarted
```

**Restore the startup probe:**

```bash
kubectl apply -f k8s/day-4/echo-service-slow-start.yaml
```

Now the pod starts successfully because the startup probe gives it 50 seconds (10 attempts × 5s) to complete initialization.

---

## 4. Quality of Service (QoS) Classes

### 4.1 The Problem: Resource Contention

Imagine your Kubernetes cluster is running low on memory. Which pods should be evicted first?

**The scenario:**
- Node has 8GB RAM
- 10 pods are running, total memory usage: 7.5GB
- A new pod needs 1GB
- Kubernetes must evict some pods to make room

**The question:** Which pods get evicted?

This is where **Quality of Service (QoS) classes** come in. Kubernetes uses QoS to prioritize which pods to keep and which to evict under resource pressure.

### 4.2 The Three QoS Classes

Kubernetes automatically assigns a QoS class to every pod based on how you configure resource requests and limits:

| Class | Configuration | Eviction Priority | Use Case |
|-------|--------------|-------------------|----------|
| **Guaranteed** | `requests == limits` for all resources | **Last** to be evicted | Critical services (databases, auth) |
| **Burstable** | Has requests/limits, but `requests ≠ limits` | **Middle** priority | Most production services |
| **BestEffort** | No requests or limits | **First** to be evicted | Batch jobs, dev/test pods |

**How Kubernetes assigns QoS:**

1. **Guaranteed**: Every container must have:
   - Memory request == memory limit
   - CPU request == CPU limit
   
2. **Burstable**: At least one container has:
   - A memory or CPU request/limit defined
   - But requests ≠ limits
   
3. **BestEffort**: No container has any requests or limits

### 4.3 Check Current QoS

Let's see what QoS class our pods have:

```bash
kubectl get pods -n production -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass
```

You should see:
```
NAME                              QOS
compute-service-658d9c9cc-abc12   Burstable
echo-service-xxxxxxxxx-xxxxx      Burstable
```

**Why Burstable?** Our pods have:
- Requests: `memory: 128Mi, cpu: 250m` (for compute-service)
- Limits: `memory: 512Mi, cpu: 500m`
- Since requests ≠ limits → **Burstable**

**What this means:**
- ✅ Kubernetes reserves 128Mi memory and 250m CPU for the pod
- ✅ Pod can burst up to 512Mi memory and 500m CPU if available
- ⚠️ If the node runs out of memory, Burstable pods may be evicted (after BestEffort pods)

### 4.4 Example: Guaranteed QoS

For critical services, you want **Guaranteed** QoS to ensure they're never evicted:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "200m"
  limits:
    memory: "256Mi"  # ← Same as requests
    cpu: "200m"      # ← Same as requests
```

**What this achieves:**
- Pod gets **exactly** 256Mi memory and 200m CPU
- Kubernetes **reserves** these resources (won't overcommit)
- Pod is **last to be evicted** under memory pressure
- No bursting allowed (can't use more than reserved)

**Trade-off:** Less efficient resource usage (no overcommitment), but maximum stability.

### 4.5 Example: BestEffort QoS

For non-critical batch jobs:

```yaml
# No resources section at all
containers:
  - name: batch-job
    image: my-batch-processor:latest
```

**What this means:**
- Pod can use **any available resources**
- **First to be evicted** when node is under pressure
- Good for: batch processing, CI/CD jobs, dev/test environments

### 4.6 Real-World Scenario: Memory Pressure

Let's simulate what happens under memory pressure:

**Setup:**
- Node has 4GB RAM
- Pod A (Guaranteed): requests/limits = 1GB
- Pod B (Burstable): requests = 512MB, limits = 2GB
- Pod C (BestEffort): no requests/limits

**Scenario 1: Normal operation**
- Pod A uses: 1GB (can't use more)
- Pod B uses: 1.5GB (bursting above request)
- Pod C uses: 500MB
- Total: 3GB / 4GB → All pods happy ✅

**Scenario 2: Memory pressure (3.8GB used)**
- New pod needs 1GB
- Kubernetes eviction order:
  1. **Pod C (BestEffort)** → Evicted first
  2. Pod B (Burstable) → Safe (for now)
  3. Pod A (Guaranteed) → Safe

**Scenario 3: Extreme pressure**
- If even after evicting BestEffort pods, memory is still low
- Kubernetes evicts **Burstable** pods that are using more than their request
- **Guaranteed** pods are only evicted as a last resort

### 4.7 When to Use Each QoS Class

**Guaranteed** (requests == limits):
- ✅ Critical services: databases, auth, payment processing
- ✅ Services with predictable, stable resource needs
- ✅ When you can't tolerate eviction
- ❌ Wastes resources if pod doesn't use full allocation

**Burstable** (requests < limits):
- ✅ Most production services (recommended default)
- ✅ Services with variable load
- ✅ Good balance of efficiency and reliability
- ⚠️ May be evicted under extreme pressure

**BestEffort** (no requests/limits):
- ✅ Batch jobs, CI/CD pipelines
- ✅ Development/testing pods
- ✅ Non-critical background tasks
- ❌ First to be killed under any pressure

---

## 5. Putting It All Together

You now have production-ready availability patterns:

**compute-service with full production setup:**

```bash
kubectl get deployment compute-service -n production
kubectl get hpa compute-service-hpa -n production
kubectl get pdb -n production
kubectl describe pod -n production -l app=compute-service | grep "QoS"
```

**What this achieves:**

1. **Autoscaling (HPA)**: Scales 2-10 replicas based on absolute CPU (200m target)
2. **CPU-Intensive Workload**: Performs mathematical calculations that yield to the event loop
3. **Resource QoS**: Burstable class with appropriate requests (250m CPU, 128Mi memory)
4. **Security Hardening**: Runs as non-root, read-only filesystem, dropped capabilities

**Test the full setup:**

```bash
# Generate sustained CPU load
oha -c 2 -z 180s "http://production.localhost:8080/compute?work=1000000000000"

# Watch scaling
kubectl get hpa -n production -w

# Monitor pods
kubectl get pods -n production -l app=compute-service -w

# Check resource usage
kubectl top pods -n production -l app=compute-service
```

---

## 6. Summary & Best Practices

### Key Concepts

1. **HPA**: Automatically scales pods based on metrics
2. **PDB**: Protects availability during voluntary disruptions
3. **Startup Probes**: Handle slow initialization separately from runtime health
4. **QoS Classes**: Control pod eviction priority under resource pressure

### Production Checklist

- [ ] HPA configured with appropriate min/max replicas
- [ ] HPA uses realistic target metrics (absolute values like 200m CPU, or 50-70% utilization)
- [ ] PDB ensures minimum availability (at least 1 pod, or 50%)
- [ ] Startup probes for services that take >10s to start
- [ ] Liveness probes detect hung/deadlocked processes
- [ ] Readiness probes prevent traffic to unhealthy pods
- [ ] Resources have both requests and limits (Burstable QoS)
- [ ] Critical services use Guaranteed QoS

### Common Pitfalls

**HPA:**
- Using `Utilization` with low CPU requests → unexpected scaling (use `AverageValue` instead)
- Target too low (e.g., 20% CPU or 50m) → constant scaling noise
- Min replicas = 1 → no redundancy, vulnerable to pod failures
- No scale-down stabilization → pods thrash up and down

**PDB:**
- `minAvailable` too high → prevents drains, blocks maintenance
- No PDB → all pods can be evicted simultaneously

**Probes:**
- Startup probe missing → pods killed during legitimate startup
- Liveness probe too sensitive → pods restart unnecessarily
- Readiness probe missing → traffic sent to unhealthy pods

**Resources:**
- No limits → one pod can starve others
- Limits too low → pods killed by OOM
- No requests → scheduler can't make good decisions

---

## Next Steps

You've hardened your services for production availability. Next:

**Step 3: GitOps with ArgoCD** - Deploy safely with declarative, Git-based deployments

[Continue to Step 3: GitOps with ArgoCD](./step-03-gitops-argocd.md)
