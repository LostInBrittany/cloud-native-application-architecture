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
4.  **Lets us search/filter**.

### The Cloud Native Stack (PLG)
*   **Promtail**: Agent running on every node. Reads logs and sends them to Loki.
*   **Loki**: The database. Indexed by labels (k8s-native), low resource usage.
*   **Grafana**: The UI to visualize and query.

## 3. Deploying the Stack

We will use Helm to deploy the "Loki Stack" (Loki + Promtail + Grafana).

### Task 3.1: Add Repo & Namespace

1.  Add the Grafana repo:
    ```bash
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update
    ```
2.  Create namespace:
    ```bash
    kubectl create namespace monitoring
    ```

### Task 3.2: Install Loki (The Store)

We use the "Single Binary" mode for simplicity in the lab.

```bash
helm upgrade --install loki grafana/loki \
  --namespace monitoring \
  --create-namespace \
  --set deploymentMode=SingleBinary \
  --set loki.commonConfig.replication_factor=1 \
  --set loki.auth_enabled=false \
  --set singleBinary.replicas=1 \
  --set write.replicas=0 \
  --set read.replicas=0 \
  --set backend.replicas=0 \
  --set loki.storage.type=filesystem \
  --set loki.useTestSchema=true
```
*(This minimizes resource usage by disabling high-availability features meant for cloud storage)*

### Task 3.3: Install Promtail (The Agent)

Promtail needs to know where Loki is (`loki-gateway` or `loki` service). Since we disabled the gateway, it's just `loki`.

```bash
helm upgrade --install promtail grafana/promtail \
  --namespace monitoring \
  --set "config.clients[0].url=http://loki:3100/loki/api/v1/push"
```

### Task 3.4: Install Grafana (The UI)
We configure it to automatically add Loki as a data source.

```bash
helm install grafana grafana/grafana \
  --namespace monitoring \
  -f k8s/day-3/grafana-values.yaml
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

1.  Go to **Explore** (Compass icon on the left).
2.  Ensure datasource is set to **Loki**.
3.  Select Label Filter: `app` = `log-service`.
4.  Click **Run Query** (top right).

You should see logs from **all 3 replicas** merged together!

### Task 5.1: Advanced Filtering
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
    {app="log-service"} | json | method="GET" | traceId="YOUR-TRACE-ID-HERE"
    ```

> You now have a production-grade logging system running locally!

---

[Next: Metrics with Prometheus](./step-07-metrics-prometheus.md)

