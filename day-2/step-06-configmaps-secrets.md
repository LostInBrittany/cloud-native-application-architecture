# Step 6 – ConfigMaps & Secrets: Decoupling Config from Code

![ConfigMaps & Secrets](/img/day-2/06-configmaps-and-secrets-01.jpg)
---
![Config files are a bad practice](/img/day-2/06-configmaps-and-secrets-02.jpg)
---
![Config maps](/img/day-2/06-configmaps-and-secrets-03.jpg)
---
![Creating a Config Map](/img/day-2/06-configmaps-and-secrets-04.jpg)
---
![Describing a Config Map](/img/day-2/06-configmaps-and-secrets-05.jpg)
---
![Using a Config Map in a Pod](/img/day-2/06-configmaps-and-secrets-06.jpg)
---
![Using a Config Map in a Pod](/img/day-2/06-configmaps-and-secrets-07.jpg)
---
![Using a Config Map in a Pod](/img/day-2/06-configmaps-and-secrets-08.jpg)
---
![Kubernetes secrets](/img/day-2/06-configmaps-and-secrets-09.jpg)
---
![A warning on Kubernetes Secrets](/img/day-2/06-configmaps-and-secrets-10.jpg)
---
![Creating a Secret](/img/day-2/06-configmaps-and-secrets-11.jpg)
---
![Verifying a Secret](/img/day-2/06-configmaps-and-secrets-12.jpg)
---
![Decoding a Secret](/img/day-2/06-configmaps-and-secrets-13.jpg)
---
![Using a Secret in a Pod](/img/day-2/06-configmaps-and-secrets-14.jpg)
---
![Using a Secret in a Pod](/img/day-2/06-configmaps-and-secrets-15.jpg)
---
![Using a Secret in a Pod](/img/day-2/06-configmaps-and-secrets-16.jpg)
---

## Concept

Cloud native applications should **not** have configuration baked into the container image.
If you need to change a database URL or an API key, you shouldn't have to rebuild the Docker image.

Kubernetes solves this with:

1.  **ConfigMaps**: For non-sensitive data (feature flags, UI colors, hostnames).
2.  **Secrets**: For sensitive data (passwords, API keys, tokens).

Both can be injected into Pods as **Environment Variables** or **Files**.

---

## 1. Update Your Service Code

We want to make our `log-service` configurable without touching the code.
You need to modify your `log-service` (from Step 1) to support two new features driven by environment variables.

### The Task

Modify your `server.js` (or `main.py` / `main.go`) to:

1.  **Read `PROCESS_NAME`**:
    *   Read this environment variable.
    *   If set, include it in the JSON output of every log line (e.g., `"process": "SuperLogger"`).
2.  **Read `API_KEY`**:
    *   Read this environment variable.
    *   Add a new route `/admin` that checks for a request header `X-API-KEY`.
    *   If `API_KEY` is set and the header doesn't match, return `401 Unauthorized`.
    *   Otherwise, return `200 OK` with some "secret" data.

### Reference Implementation

If you get stuck or want to move fast, we have provided an updated version of the code in:
📂 `services/day-2/log-service-step-6`

### Build and Load the Image

Once your code is ready, build a new version of the image:

```bash
docker build -t log-service:v2 services/day-2/log-service-step-6
k3d image import log-service:v2 -c day2
```

---

## 2. Create ConfigMap and Secret

We have prepared a manifest `k8s/day-2/log-config-secret.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: log-config
data:
  PROCESS_NAME: "SuperLogger"
---
apiVersion: v1
kind: Secret
metadata:
  name: log-secret
type: Opaque
stringData:
  API_KEY: "secret123"
```

Apply it:

```bash
kubectl apply -f k8s/day-2/log-config-secret.yaml
```

---

## 3. Update the Deployment

We need to tell the Pod to use these values.
Edit `k8s/day-2/log-service.yaml` to use image `v2` and inject the variables.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: log-service
  # ...
spec:
  # ...
  template:
    # ...
    spec:
      containers:
        - name: log-service
          image: log-service:v2  # <--- UPDATE IMAGE TAG
          imagePullPolicy: IfNotPresent
          env:
            - name: APP_VERSION
              value: "v2"
            # [NEW] Inject from ConfigMap
            - name: PROCESS_NAME
              valueFrom:
                configMapKeyRef:
                  name: log-config
                  key: PROCESS_NAME
            # [NEW] Inject from Secret
            - name: API_KEY
              valueFrom:
                secretKeyRef:
                  name: log-secret
                  key: API_KEY
```

Apply the changes:

```bash
kubectl apply -f k8s/day-2/log-service.yaml
```

---

## 4. Verification

### Check ConfigMap Injection

Tail the logs:

```bash
kubectl logs -l app=log-service -f
```

Generate a request (in another terminal):

```bash
curl localhost:8080
```

You should see `"process": "SuperLogger"` in the logs. The app read the config!

### Check Secret Protection

Try to access the admin endpoint without a key:

```bash
curl -v localhost:8080/admin
```

Response: `401 Unauthorized`. The Secret is working.

Now provide the key:

```bash
curl -v -H "X-API-KEY: secret123" localhost:8080/admin
```

Response: `200 OK`. Access granted.

---

## 5. Wait... Are Secrets Safe?

You might think that because it's called a "Secret", it is encrypted and safe.
**Think again.**

Try this command to view the secret you just created:

```bash
kubectl get secret log-secret -o yaml
```

You will see something like:

```yaml
data:
  API_KEY: c2VjcmV0MTIz
```

That strange string `c2VjcmV0MTIz` is **not encryption**. It is just **Base64 encoding**.
Anyone with `kubectl` access can decode it instantly:

```bash
echo "c2VjcmV0MTIz" | base64 -d
# Output: secret123
```

> [!WARNING]
> Kubernetes Secrets are stored as **Base64 encoded strings**.
> They are **NOT** encrypted by default (unless your administrator has configured Encryption at Rest for etcd).
> Do not commit raw Secrets to Git! Use tools like SealedSecrets, SOPS, or Vault for real production secrets.

---

## Key Takeaway

You changed the behavior of the application (feature flag) and secured it (secret) **without changing the application code**.
This is exactly what we want.
