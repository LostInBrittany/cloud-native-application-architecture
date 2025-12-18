# Step 1 – Build Your Own Log Service

## Objectives

In Day 1, you used a pre-built `echo-service`.
In Day 2, we need a service that we can **inspect and modify** to understand:

* Health probes (Liveness/Readiness)
* Configuration loading (ConfigMaps/Secrets)
* Graceful shutdown

Therefore, your first task is to **build and deploy your own service**.

---

## 1. The Specification

You need to create a simple HTTP service (in Node, Python, Go, etc.) that:

1. Listens on port **8080**.
2. Logs every request to **stdout** (JSON format preferred).
3. Returns a JSON response containing:
    * The request details (method, path, headers).
    * System information (hostname, environment variables).

### Why "Build Your Own"?

Later today, we will ask you to *break* this service (e.g., make it unhealthy) to see how Kubernetes reacts. Detailed knowledge of the code is required for this "white-box" testing.

---

## 2. Implementation

Create a folder `log-service` (or use the provided skeleton).

### Option A: Use the Reference Implementation (Fast Path)

We have provided a reference implementation in `services/day-2/log-service-step-1`.
It uses Node.js and Express.

Review the code:

* **[server.js](../../services/day-2/log-service-step-1/server.js)**: Note the request logging middleware.
* **[Dockerfile](../../services/day-2/log-service-step-1/Dockerfile)**: Standard Node.js Alpine build.

### Option B: Use the PHP Implementation (Alternative)

If you prefer PHP, we also provided a simplified PHP version in `services/day-2/log-service-php`.

* **[index.php](../../services/day-2/log-service-php/index.php)**: A simple script using PHP's built-in server.
* **[Dockerfile](../../services/day-2/log-service-php/Dockerfile)**: Based on `php:alpine`.
* **[log-service-php.yaml](../../k8s/day-2/log-service-php.yaml)**: Ready-to-use Kubernetes manifest.

To use this, build the image as `log-service-php:dev` and use the provided manifest.

### Option C: Bring Your Own Code (BYOC)

Feel free to write this in Python (Flask/FastAPI), Go, or Java.
Just ensure it meets the **spec** above.

---

## 3. Build and Load the Image

Once your code is ready, build the Docker image.

```bash
# Assuming you are in the service directory
docker build -t log-service:v1 .
```

**Crucial Step**: Load the image into the `k3d` cluster.

Since `k3d` runs in Docker, it cannot see your local Docker daemon's images unless you move them.

```bash
k3d image import log-service:v1 -c day2
```

---

## 4. Create Kubernetes Manifests

Create a file `k8s/day-2/log-service.yml`.

It must contain:

1. A **Deployment** named `log-service`.
    * Replicas: 1
    * Image: `log-service:v1`
    * ImagePullPolicy: `IfNotPresent` (Important for local images!)
2. A **Service** named `log-service`.
    * Port: 8080

<details>
<summary>👉 Click for Solution (YAML)</summary>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: log-service
  labels:
    app: log-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: log-service
  template:
    metadata:
      labels:
        app: log-service
    spec:
      containers:
        - name: log-service
          image: log-service:v1
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          env:
            - name: APP_VERSION
              value: "v1"
---
apiVersion: v1
kind: Service
metadata:
  name: log-service
  labels:
    app: log-service
spec:
  type: ClusterIP
  selector:
    app: log-service
  ports:
    - name: http
      port: 8080
      targetPort: 8080
```
</details>

---

## 5. Deploy and Verify

Apply the manifest:

```bash
kubectl apply -f k8s/day-2/log-service.yml
```

Verify it is running:

```bash
kubectl get pods
```

Check the logs (this is why we built it!):

```bash
# Generate some traffic (in another terminal, use port-forward)
kubectl port-forward svc/log-service 8080:8080
curl localhost:8080

# Check logs
kubectl logs -l app=log-service
```

✅ **Checkpoint**: You have a running service that you built, loaded, and deployed.
