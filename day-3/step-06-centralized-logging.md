# Step 6 – Centralized Logging

## 1. The Problem with `kubectl logs`

`kubectl logs -f my-pod` works great for one pod. But what happens at scale?

### Task 1.1: Simulating Scale

1.  Scale up your log-service:
    ```bash
    kubectl scale deployment log-service --replicas=3
    ```
2.  Send some traffic (to generate logs across random pods):
    ```bash
    for i in {1..10}; do curl localhost:8080/log; done
    ```
3.  Now try to find the logs. Which pod handled which request?
    ```bash
    kubectl get pods -l app=log-service
    # Pick one... is your log there? Maybe.
    kubectl logs log-service-xxxx-yyyy
    ```

You cannot "SSH and grep" when you have 50 microservices moving constantly across nodes.

## 2. The Solution: Log Aggregation

We need a system that:
1.  **Reads** logs from *all* containers (Stdout/Stderr).
2.  **Tags** them with metadata (Pod Name, Namespace, App Version).
3.  **Ships** them to a central database.
4.  **Lets us search/filter** efficiently.

### The Cloud Native Stack (FLG)

We will implement the **FLG Stack** (Fluent Bit, Loki, Grafana), a modern, lightweight alternative to the traditional ELK stack.

#### 1. The Collector: Fluent Bit
*   **Role**: The "Truck Driver".
*   **How it works**: Runs as a **DaemonSet** (one agent per Node). It tails the container log files in `/var/log/containers/`, parses them, adds Kubernetes metadata (e.g., "This log came from Pod X in Namespace Y"), and pushes them to Loki.
*   **Why**: It is extremely lightweight (written in C), fast, and reliable.

#### 2. The Store: Loki
*   **Role**: The "Warehouse".
*   **How it works**: A datastore optimized for logs. Unlike Elasticsearch, it **does not index the full text** of logs. Instead, it only indexes the **labels** (e.g., `app=log-service`, `env=prod`).
*   **Why**: This makes it incredibly cheap to operate and resource-efficient (perfect for Kubernetes). It behaves like "Distributed Grep".

#### 3. The Visualization: Grafana
*   **Role**: The "Dashboard".
*   **How it works**: Connects to Loki (and Prometheus) to query and visualize data.
*   **Why**: It is the industry standard for observability dashboards. It allows you to correlate logs with metrics side-by-side.

## 3. Deploying the Stack

We will use Helm to deploy Loki, Fluent Bit, and Grafana.

### Task 3.1: Add Repos & Namespace

1.  Add repositories:
    ```bash
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo add fluent https://fluent.github.io/helm-charts
    helm repo update
    ```
2.  Create namespace:
    ```bash
    kubectl create namespace monitoring
    ```

### Task 3.2: Install Loki (The Store)

We use the "Single Binary" mode for simplicity.

```bash
helm upgrade --install loki grafana/loki \
  --namespace monitoring \
  --set deploymentMode=SingleBinary \
  --set loki.auth_enabled=false \
  --set loki.commonConfig.replication_factor=1 \
  --set loki.storage.type=filesystem \
  --set gateway.enabled=false \
  --set resultsCache.enabled=false \
  --set chunksCache.enabled=false \
  --set backend.replicas=0 \
  --set read.replicas=0 \
  --set write.replicas=0 \
  --set singleBinary.replicas=1 \
  --set loki.useTestSchema=true
```

**Verify Loki is running:**

```bash
# Check if the pod is running
kubectl get pods -n monitoring -l app.kubernetes.io/name=loki

# Check the logs
kubectl logs -n monitoring -l app.kubernetes.io/name=loki --tail=50

# Verify the service is available
kubectl get svc -n monitoring loki
```

You should see:
- Pod status: `Running`
- Service: `loki` on port `3100`
- Logs showing: `"msg":"Loki started"` or similar

**Test Loki API:**

```bash
# Port-forward to access Loki
kubectl port-forward -n monitoring svc/loki 3100:3100 &

# Check Loki is ready
curl http://localhost:3100/ready

# Should return: "ready"
```

### Task 3.3: Install Fluent Bit (The Agent)

We need to configure Fluent Bit to send logs to Loki.

1.  Create `k8s/day-3/fluent-bit-values.yaml`:

    ```yaml
    config:
      outputs: |
        [OUTPUT]
            Name loki
            Match *
            Host loki.monitoring.svc
            Port 3100
            Labels job=fluentbit
            auto_kubernetes_labels on

    # Disable problematic host mounts for k3d
    hostNetwork: false
    dnsPolicy: ClusterFirst

    # Don't mount /etc/machine-id
    daemonSetVolumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
      - name: etcmachineid
        hostPath:
          path: /etc/machine-id
          type: ""

    daemonSetVolumeMounts:
      - name: varlog
        mountPath: /var/log
        readOnly: true
      - name: varlibdockercontainers
        mountPath: /var/lib/docker/containers
        readOnly: true
    ```

2.  Install it:

    ```bash
    helm upgrade --install fluent-bit fluent/fluent-bit \
      --namespace monitoring \
      --values k8s/day-3/fluent-bit-values.yaml
    ```

3. Verify it's running and sending messages to Loki:

    ```bash
    # Check Fluent Bit logs
    kubectl logs -n monitoring -l app.kubernetes.io/name=fluent-bit --tail=50

    # Look for successful connections to Loki
    kubectl logs -n monitoring -l app.kubernetes.io/name=fluent-bit | grep -i loki
    ```

### Task 3.4: Install Grafana (The UI)

We configure Grafana to automatically add Loki as a data source.

1. Create `k8s/day-3/grafana-values.yaml`:

    ```yaml
    persistence:
      enabled: false
    adminPassword: admin
    grafana.ini:
      server:
        root_url: http://localhost:8080/grafana
        serve_from_sub_path: true
    ```

    **What this does:**
    - `persistence: false` - No persistent storage (simplified for development)
    - `adminPassword: admin` - Set a simple password for admin user
    - `root_url` and `serve_from_sub_path` - Allow Grafana to work behind an Ingress at `/grafana` path

2. Install Grafana:

    ```bash
    helm install grafana grafana/grafana \
      --namespace monitoring \
      -f k8s/day-3/grafana-values.yaml
    ```

3. Verify Grafana is running:

    ```bash
    kubectl get pods -n monitoring -l app.kubernetes.io/name=grafana
    ```

### Task 3.5: Create Ingress

To access Grafana without port-forwarding, we create an Ingress in the `monitoring` namespace.

Create `k8s/day-3/grafana-ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana-ingress
  namespace: monitoring
spec:
  ingressClassName: traefik
  rules:
    - http:
        paths:
          - path: /grafana
            pathType: Prefix
            backend:
              service:
                name: grafana
                port:
                  number: 80
```

Apply it:

```bash
kubectl apply -f k8s/day-3/grafana-ingress.yaml
```

### Task 3.6: Wait
Wait for the pods:
```bash
kubectl get pods -n monitoring -w
```

## 4. Accessing Grafana

We have configured Grafana to be accessible at `http://localhost:8080/grafana`.

1.  Open [http://localhost:8080/grafana](http://localhost:8080/grafana) in your browser.
2.  Login with:
    *   User: `admin`
    *   Password: `admin` (configured in values.yaml)

### Task 4.1: Connect Loki Data Source

Since we installed them separately, we need to add Loki as a data source manually (or auto-provision it via config, but let's do it manually for practice).

1.  Click **Connections** -> **Data Sources**.
2.  Click **+ Add new data source**.
3.  Select **Loki**.
4.  URL: `http://loki:3100` (Internal Kubernetes DNS).
5.  Click **Save & Test**. You should see "Data source connected and labels found.".

## 5. Querying Logs (LogQL)

### Task 5.1: Generate Traffic

Before querying logs, let's generate some activity to ensure we have logs to view:

```bash
# Make some requests to generate logs
for i in {1..10}; do
  curl -X POST http://localhost:8080/logs -H "Content-Type: application/json" -d '{"message": "Test log entry '$i'"}'
  sleep 1
done

# Check that logs were created
kubectl logs -n production -l app=log-service --tail=20
```

You should see the log entries from your requests.

### Task 5.2: Query Logs in Grafana

1.  Go to **Explore** (Compass icon on the left).
2.  Ensure datasource is set to **Loki**.
3.  Select Label Filter: `app` = `log-service`.
4.  Click **Run Query** (top right).

You should see logs from **all replicas** merged together, including the test logs you just generated!

### Task 5.3: Advanced Filtering
Try these queries in the query bar:

*   **Filter by string**:
    Search for lines containing "attempt" (retries):
    ```promql
    {app="log-service"} |= "attempt"
    ```
*   **Filter by JSON field** (Since we did structured logging!):
    Filter where the method is GET:
    ```promql
    {app="log-service"} | json | method="GET"
    ```
*   **Find a Trace**:
    Take a Trace ID from your terminal output and search for it:
    ```promql
    {app=~".+"} | json | traceId="YOUR-TRACE-ID-HERE"
    ```

> You now have a production-grade logging system running locally!

---

[Next: Metrics with Prometheus](./step-07-metrics-prometheus.md)

