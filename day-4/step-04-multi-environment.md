# Step 4 – Multi-Environment Strategy

## Overview

In production, you rarely have just one environment. You typically have:

- **Development** (dev) – Rapid iteration, frequent deployments
- **Staging** (staging) – Pre-production testing, mirrors production
- **Production** (prod) – Customer-facing, high availability

**The Problem:**
- Same application, different configurations
- Different resource limits (dev: small, prod: large)
- Different replicas (dev: 1, prod: 5)
- Different secrets, endpoints, feature flags

**The Question:** How do you manage this without copy-pasting YAML files everywhere?

---

## 1. The Anti-Pattern: Copy-Paste YAML

### 1.1 What NOT to Do

```
k8s/
├── dev/
│   ├── echo-service.yaml      # 500 lines
│   ├── log-service.yaml       # 400 lines
│   └── compute-service.yaml   # 300 lines
├── staging/
│   ├── echo-service.yaml      # 500 lines (99% identical to dev)
│   ├── log-service.yaml       # 400 lines (99% identical to dev)
│   └── compute-service.yaml   # 300 lines (99% identical to dev)
└── prod/
    ├── echo-service.yaml      # 500 lines (99% identical to dev)
    ├── log-service.yaml       # 400 lines (99% identical to dev)
    └── compute-service.yaml   # 300 lines (99% identical to dev)
```

**Problems:**
- ❌ Duplication: 1200 lines × 3 = 3600 lines
- ❌ Maintenance nightmare: Bug fix requires editing 3 files
- ❌ Drift: Dev and prod diverge over time
- ❌ No single source of truth

---

## 2. The Solution: Kustomize

### 2.1 What is Kustomize?

Kustomize is a **template-free** way to customize Kubernetes manifests.

**Key Concepts:**
- **Base**: Common configuration shared across environments
- **Overlays**: Environment-specific patches (dev, staging, prod)
- **Patches**: Modifications applied on top of base

**Philosophy:** "Don't template, patch."

### 2.2 Directory Structure

```
k8s/
├── base/                      # Common configuration
│   ├── kustomization.yaml
│   ├── echo-service.yaml
│   ├── log-service.yaml
│   └── compute-service.yaml
└── overlays/
    ├── dev/                   # Dev-specific patches
    │   ├── kustomization.yaml
    │   └── patches/
    ├── staging/               # Staging-specific patches
    │   ├── kustomization.yaml
    │   └── patches/
    └── prod/                  # Prod-specific patches
        ├── kustomization.yaml
        └── patches/
```

**Result:** Base is ~1200 lines, each overlay is ~50 lines. Total: ~1350 lines (vs 3600).

---

## 3. Hands-On: Multi-Environment Setup

### 3.1 Create the Base

First, create the base directory with common manifests:

```bash
mkdir -p k8s/day-4/multi-env/base
```

Create `k8s/day-4/multi-env/base/compute-service.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: compute-service
  labels:
    app: compute-service
spec:
  replicas: 1  # Will be overridden per environment
  selector:
    matchLabels:
      app: compute-service
  template:
    metadata:
      labels:
        app: compute-service
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 2000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: compute-service
          image: compute-service:latest
          imagePullPolicy: IfNotPresent  # Required for k3d imported images
          ports:
            - containerPort: 8080
          env:
            - name: APP_NAME
              value: "compute-service"
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
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "200m"
      volumes:
        - name: tmp
          emptyDir: {}
      automountServiceAccountToken: false
---
apiVersion: v1
kind: Service
metadata:
  name: compute-service
  labels:
    app: compute-service
spec:
  type: ClusterIP
  selector:
    app: compute-service
  ports:
    - port: 8080
      targetPort: 8080
```

**Note:** This base manifest includes all security hardening from Day 4 Step 1 (non-root user, read-only filesystem, dropped capabilities, seccomp profile).

Create `k8s/day-4/multi-env/base/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - compute-service.yaml
```

### 3.2 Create Dev Overlay

```bash
mkdir -p k8s/day-4/multi-env/overlays/dev
```

Create `k8s/day-4/multi-env/overlays/dev/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: dev

resources:
  - ../../base

# Patch: Scale down for dev (save resources)
patches:
  - target:
      kind: Deployment
      name: compute-service
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 1

# Patch: Lower resource requests for dev
  - target:
      kind: Deployment
      name: compute-service
    patch: |-
      - op: replace
        path: /spec/template/spec/containers/0/resources/requests/memory
        value: "64Mi"
      - op: replace
        path: /spec/template/spec/containers/0/resources/requests/cpu
        value: "50m"
```

### 3.3 Create Staging Overlay

```bash
mkdir -p k8s/day-4/multi-env/overlays/staging
```

Create `k8s/day-4/multi-env/overlays/staging/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: staging

resources:
  - ../../base

# Staging mirrors prod but with fewer replicas
patches:
  - target:
      kind: Deployment
      name: compute-service
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 2
```

### 3.4 Create Production Overlay

```bash
mkdir -p k8s/day-4/multi-env/overlays/prod
```

Create `k8s/day-4/multi-env/overlays/prod/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: production

resources:
  - ../../base

# Production: High availability
patches:
  - target:
      kind: Deployment
      name: compute-service
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 5

# Production: Higher resource limits
  - target:
      kind: Deployment
      name: compute-service
    patch: |-
      - op: replace
        path: /spec/template/spec/containers/0/resources/requests/memory
        value: "256Mi"
      - op: replace
        path: /spec/template/spec/containers/0/resources/requests/cpu
        value: "250m"
      - op: replace
        path: /spec/template/spec/containers/0/resources/limits/memory
        value: "512Mi"
      - op: replace
        path: /spec/template/spec/containers/0/resources/limits/cpu
        value: "500m"
```

---

## 4. Deploy to Multiple Environments

### 4.1 Preview the Generated Manifests

Before deploying, see what Kustomize will generate:

```bash
# Dev
kubectl kustomize k8s/day-4/multi-env/overlays/dev

# Staging
kubectl kustomize k8s/day-4/multi-env/overlays/staging

# Production
kubectl kustomize k8s/day-4/multi-env/overlays/prod
```

**Notice:**
- Different namespaces
- Different replica counts
- Different resource limits
- All from the same base!

### 4.2 Create Namespaces

```bash
kubectl create namespace dev
kubectl create namespace staging
# production namespace already exists from earlier steps
```

### 4.3 Important: Delete Existing Deployments

**If you have existing deployments**, you must delete them first due to Kubernetes selector immutability:

```bash
# Delete existing deployments (if any)
kubectl delete deployment compute-service -n dev --ignore-not-found=true
kubectl delete deployment compute-service -n staging --ignore-not-found=true
kubectl delete deployment compute-service -n production --ignore-not-found=true
```

**Why?** Kubernetes deployment selectors are immutable. If a deployment already exists with a different selector configuration, you'll get an error like:

```
The Deployment "compute-service" is invalid: spec.selector: Invalid value: ... field is immutable
```

### 4.4 Deploy to Each Environment

```bash
# Deploy to dev
kubectl apply -k k8s/day-4/multi-env/overlays/dev

# Deploy to staging
kubectl apply -k k8s/day-4/multi-env/overlays/staging

# Deploy to production
kubectl apply -k k8s/day-4/multi-env/overlays/prod
```

**Note:** The `-k` flag tells kubectl to use Kustomize.

### 4.5 Verify Deployments

```bash
# Check dev (1 replica, small resources)
kubectl get deployment compute-service -n dev
kubectl get pods -n dev

# Check staging (2 replicas)
kubectl get deployment compute-service -n staging
kubectl get pods -n staging

# Check production (5 replicas, large resources)
kubectl get deployment compute-service -n production
kubectl get pods -n production
```

You should see:
- **Dev**: 1 pod
- **Staging**: 2 pods
- **Production**: 5 pods

All from the same base configuration!

---

## 5. Advanced Kustomize Patterns

### 5.1 ConfigMaps per Environment

Create environment-specific ConfigMaps:

**Base ConfigMap** (`k8s/day-4/multi-env/base/app-config.yaml`):

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: "info"
  FEATURE_FLAG_X: "off"
```

**Dev Overlay** (`k8s/day-4/multi-env/overlays/dev/config-patch.yaml`):

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: "debug"  # More verbose in dev
  FEATURE_FLAG_X: "on"  # Test new features in dev
```

The dev overlay patch is already configured in `overlays/dev/kustomization.yaml` (we added it earlier).

**Deploy and verify:**

```bash
# Deploy to dev with ConfigMap
kubectl apply -k k8s/day-4/multi-env/overlays/dev

# Check the ConfigMap in dev namespace
kubectl get configmap app-config -n dev -o yaml
```

You should see:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: dev
data:
  LOG_LEVEL: "debug"      # ← Overridden for dev
  FEATURE_FLAG_X: "on"    # ← Overridden for dev
```

**Compare with production:**

```bash
# Deploy to production (uses base ConfigMap)
kubectl apply -k k8s/day-4/multi-env/overlays/prod

# Check the ConfigMap in production namespace
kubectl get configmap app-config -n production -o yaml
```

You should see:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: production
data:
  LOG_LEVEL: "info"       # ← Base value
  FEATURE_FLAG_X: "off"   # ← Base value
```

**Key Takeaway:** Same base, different values per environment. Dev gets debug logging and experimental features, production stays stable.


### 5.2 Image Tags per Environment

Use different image tags for each environment to control which version gets deployed.

**Step 1: Build and tag the image**

```bash
# Build the image once
docker build -t compute-service:latest services/day-4/compute-service

# Create environment-specific tags (same image, different names)
docker tag compute-service:latest compute-service:dev-latest
docker tag compute-service:latest compute-service:v1.2.3-rc1  # Release candidate for staging
docker tag compute-service:latest compute-service:v1.2.2      # Stable version for production

# Import all tags to k3d
k3d image import compute-service:dev-latest -c day4
k3d image import compute-service:v1.2.3-rc1 -c day4
k3d image import compute-service:v1.2.2 -c day4
```

**Step 2: Configure Kustomize to use different tags per environment**

Update each overlay's `kustomization.yaml`:

```yaml
# In overlays/dev/kustomization.yaml
images:
  - name: compute-service
    newName: compute-service
    newTag: dev-latest

# In overlays/staging/kustomization.yaml
images:
  - name: compute-service
    newName: compute-service
    newTag: v1.2.3-rc1

# In overlays/prod/kustomization.yaml
images:
  - name: compute-service
    newName: compute-service
    newTag: v1.2.2  # Pinned stable version
```

**What this achieves:**
- **Dev**: Uses `dev-latest` (rapid iteration, always newest code)
- **Staging**: Uses `v1.2.3-rc1` (release candidate for testing)
- **Production**: Uses `v1.2.2` (stable, pinned version)

**Verify the tags:**

```bash
# Check what image each environment will use
kubectl kustomize k8s/day-4/multi-env/overlays/dev | grep "image:"
kubectl kustomize k8s/day-4/multi-env/overlays/staging | grep "image:"
kubectl kustomize k8s/day-4/multi-env/overlays/prod | grep "image:"
```

**Best Practice:** Never use `:latest` in production. Always pin to a specific version (e.g., `v1.2.2`).

### 5.3 Ingress per Environment

To access services via HTTP, create a base Ingress and patch the hostname per environment.

**Base Ingress** (`k8s/day-4/multi-env-final/base/ingress.yaml`):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: compute-service-ingress
  annotations:
    ingress.kubernetes.io/ssl-redirect: "false"
spec:
  rules:
    - host: localhost  # Will be patched per environment
      http:
        paths:
          - path: /compute
            pathType: Prefix
            backend:
              service:
                name: compute-service
                port:
                  number: 8080
```

**Add to base kustomization.yaml:**

```yaml
resources:
  - compute-service.yaml
  - app-config.yaml
  - ingress.yaml  # Add this line
```

**Patch the hostname in each overlay's kustomization.yaml:**

We use **JSON Patch** (not strategic merge) to modify only the hostname without losing the `http` section.

**Dev overlay** (`k8s/day-4/multi-env-final/overlays/dev/kustomization.yaml`):

```yaml
patches:
  # ... other patches ...
  
  # Patch: Ingress hostname for dev
  - target:
      kind: Ingress
      name: compute-service-ingress
    patch: |-
      - op: replace
        path: /spec/rules/0/host
        value: dev.localhost
```

**Staging overlay** (`k8s/day-4/multi-env-final/overlays/staging/kustomization.yaml`):

```yaml
patches:
  # ... other patches ...
  
  # Patch: Ingress hostname for staging
  - target:
      kind: Ingress
      name: compute-service-ingress
    patch: |-
      - op: replace
        path: /spec/rules/0/host
        value: staging.localhost
```

**Production overlay** (`k8s/day-4/multi-env-final/overlays/prod/kustomization.yaml`):

```yaml
patches:
  # ... other patches ...
  
  # Patch: Ingress hostname for production
  - target:
      kind: Ingress
      name: compute-service-ingress
    patch: |-
      - op: replace
        path: /spec/rules/0/host
        value: production.localhost
```

**Why JSON Patch instead of Strategic Merge?**

- **Strategic Merge Patch** (file-based): Merges entire objects, can accidentally remove nested fields
- **JSON Patch** (inline): Surgical precision, modifies only the exact field specified

In this case, a strategic merge patch would remove the `http` section when we only want to change the `host`. JSON Patch gives us the precision we need.

**Test the Ingress:**

```bash
# Test dev environment
curl "http://dev.localhost:8080/compute?work=1000000"

# Test staging environment
curl "http://staging.localhost:8080/compute?work=1000000"

# Test production environment
curl "http://production.localhost:8080/compute?work=1000000"
```

**Why this is better:**
- ✅ DRY: Ingress rules defined once in base
- ✅ Only hostname differs per environment
- ✅ Less duplication, easier to maintain
- ✅ JSON Patch ensures we don't lose nested fields

Each environment is now accessible via its own hostname!

### 5.4 Name Prefixes/Suffixes

Add environment-specific prefixes:

```yaml
# In overlays/dev/kustomization.yaml
namePrefix: dev-

# Result: dev-compute-service, dev-log-service
```

---

## 6. ConfigMap/Secret Promotion Strategy

### 6.1 The Promotion Flow

```
Dev → Staging → Production
```

**Best Practice:**
1. **Test in dev** with debug settings
2. **Promote to staging** with production-like settings
3. **Promote to prod** only after validation

### 6.2 Example: Database Connection

**Dev:**
```yaml
DB_HOST: "dev-postgres.dev.svc.cluster.local"
DB_NAME: "app_dev"
```

**Staging:**
```yaml
DB_HOST: "staging-postgres.staging.svc.cluster.local"
DB_NAME: "app_staging"
```

**Production:**
```yaml
DB_HOST: "prod-postgres.production.svc.cluster.local"
DB_NAME: "app_prod"
```

**Secret Management:**
- Dev: Secrets in Git (acceptable for dev)
- Staging/Prod: Use **Sealed Secrets** or **External Secrets Operator**

---

## 7. Cost Optimization Considerations

### 7.1 Resource Right-Sizing per Environment

| Environment | Replicas | CPU Request | Memory Request | Cost Impact |
|-------------|----------|-------------|----------------|-------------|
| Dev         | 1        | 50m         | 64Mi           | Low         |
| Staging     | 2        | 100m        | 128Mi          | Medium      |
| Production  | 5        | 250m        | 256Mi          | High        |

**Savings:** Dev uses ~10% of production resources.

### 7.2 Autoscaling per Environment

```yaml
# Dev: No HPA (fixed 1 replica)
# Staging: HPA 2-5 replicas
# Production: HPA 5-20 replicas
```

### 7.3 Node Affinity for Cost Optimization

```yaml
# Dev: Use spot instances (cheap, can be interrupted)
nodeSelector:
  node-type: spot

# Production: Use on-demand instances (reliable)
nodeSelector:
  node-type: on-demand
```

---

## 8. Putting It All Together

### 8.1 Final Directory Structure

```
k8s/day-4/multi-env-final/
├── base/
│   ├── kustomization.yaml
│   ├── compute-service.yaml
│   ├── app-config.yaml
│   └── ingress.yaml
└── overlays/
    ├── dev/
    │   ├── kustomization.yaml (includes JSON patches for resources, ConfigMap, and Ingress hostname)
    │   └── config-patch.yaml
    ├── staging/
    │   └── kustomization.yaml (includes JSON patches for replicas and Ingress hostname)
    └── prod/
        └── kustomization.yaml (includes JSON patches for replicas, resources, and Ingress hostname)
```

**Note:** Ingress hostname patches are inline JSON patches in each `kustomization.yaml`, not separate files.

### 8.2 Deployment Workflow

```bash
# 1. Make changes to base
vim k8s/day-4/multi-env-final/base/compute-service.yaml

# 2. Deploy to dev first
kubectl apply -k k8s/day-4/multi-env-final/overlays/dev

# 3. Test in dev
curl "http://dev.localhost:8080/compute?work=1000000"

# 4. If good, promote to staging
kubectl apply -k k8s/day-4/multi-env-final/overlays/staging

# 5. Test in staging
curl "http://staging.localhost:8080/compute?work=1000000"

# 6. If good, promote to production
kubectl apply -k k8s/day-4/multi-env-final/overlays/prod

# 7. Test in production
curl "http://production.localhost:8080/compute?work=1000000"
```

### 8.3 Verify Everything Works

Let's verify that all the multi-environment features are working correctly.

**Step 1: Deploy all environments**

```bash
# Deploy to all three environments
kubectl apply -k k8s/day-4/multi-env-final/overlays/dev
kubectl apply -k k8s/day-4/multi-env-final/overlays/staging
kubectl apply -k k8s/day-4/multi-env-final/overlays/prod
```

**Step 2: Verify different replica counts**

```bash
# Check replicas in each environment
kubectl get deployment dev-compute-service -n dev -o jsonpath='{.spec.replicas}' && echo " replicas in dev"
kubectl get deployment staging-compute-service -n staging -o jsonpath='{.spec.replicas}' && echo " replicas in staging"
kubectl get deployment prod-compute-service -n production -o jsonpath='{.spec.replicas}' && echo " replicas in production"
```

Expected output:
```
1 replicas in dev
2 replicas in staging
5 replicas in production
```

**Step 3: Verify different resource limits**

```bash
# Check CPU requests in each environment
echo "Dev CPU request:"
kubectl get deployment dev-compute-service -n dev -o jsonpath='{.spec.template.spec.containers[0].resources.requests.cpu}'
echo ""

echo "Staging CPU request:"
kubectl get deployment staging-compute-service -n staging -o jsonpath='{.spec.template.spec.containers[0].resources.requests.cpu}'
echo ""

echo "Production CPU request:"
kubectl get deployment prod-compute-service -n production -o jsonpath='{.spec.template.spec.containers[0].resources.requests.cpu}'
echo ""
```

Expected output:
```
Dev CPU request:
50m
Staging CPU request:
100m
Production CPU request:
250m
```

**Step 4: Verify different ConfigMaps**

```bash
# Check LOG_LEVEL in each environment
echo "Dev LOG_LEVEL:"
kubectl get configmap app-config -n dev -o jsonpath='{.data.LOG_LEVEL}'
echo ""

echo "Production LOG_LEVEL:"
kubectl get configmap app-config -n production -o jsonpath='{.data.LOG_LEVEL}'
echo ""
```

Expected output:
```
Dev LOG_LEVEL:
debug
Production LOG_LEVEL:
info
```

**Step 5: Verify different Ingress hostnames**

```bash
# Check Ingress hosts
echo "Dev Ingress:"
kubectl get ingress dev-compute-service-ingress -n dev -o jsonpath='{.spec.rules[0].host}'
echo ""

echo "Staging Ingress:"
kubectl get ingress staging-compute-service-ingress -n staging -o jsonpath='{.spec.rules[0].host}'
echo ""

echo "Production Ingress:"
kubectl get ingress prod-compute-service-ingress -n production -o jsonpath='{.spec.rules[0].host}'
echo ""
```

Expected output:
```
Dev Ingress:
dev.localhost
Staging Ingress:
staging.localhost
Production Ingress:
production.localhost
```

**Step 6: Test HTTP access to all environments**

```bash
# Test dev (should respond quickly with small work)
curl "http://dev.localhost:8080/compute?work=100000"

# Test staging
curl "http://staging.localhost:8080/compute?work=100000"

# Test production
curl "http://production.localhost:8080/compute?work=100000"
```

All three should return JSON with computation results.

**Step 7: Verify all pods are running**

```bash
# Check pod status across all environments
kubectl get pods -n dev -l app=compute-service
kubectl get pods -n staging -l app=compute-service
kubectl get pods -n production -l app=compute-service
```

You should see:
- **Dev**: 1 pod running
- **Staging**: 2 pods running
- **Production**: 5 pods running

**Summary of what we verified:**

| Feature | Dev | Staging | Production |
|---------|-----|---------|------------|
| Replicas | 1 | 2 | 5 |
| CPU Request | 50m | 100m | 250m |
| Memory Request | 64Mi | 128Mi | 256Mi |
| LOG_LEVEL | debug | info | info |
| FEATURE_FLAG_X | on | off | off |
| Ingress Host | dev.localhost | staging.localhost | production.localhost |
| Image Tag | dev-latest | v1.2.3-rc1 | v1.2.2 |

✅ **All features working correctly!** Same base configuration, different values per environment.


---

## 9. Summary & Best Practices

### Key Concepts

1. **Kustomize** enables DRY (Don't Repeat Yourself) for Kubernetes manifests
2. **Base** contains common configuration
3. **Overlays** contain environment-specific patches
4. **Promotion** flows from dev → staging → prod

### Production Checklist

- [ ] Base manifests are production-ready (security, resources)
- [ ] Each environment has appropriate resource limits
- [ ] Secrets are managed securely (not in Git for prod)
- [ ] ConfigMaps are environment-specific
- [ ] Image tags are pinned in production (no `:latest`)
- [ ] Namespaces isolate environments
- [ ] Cost optimization: dev uses minimal resources

### Common Pitfalls

**Kustomize:**
- Overly complex patches → hard to understand
- Not testing generated manifests before applying
- Forgetting to update base when fixing bugs
- **Selector immutability** → delete existing deployments before switching to Kustomize

**Multi-Environment:**
- Dev and prod drift too far apart → staging doesn't catch bugs
- Secrets in Git for production → security risk
- No promotion process → changes go straight to prod

---

## Next Steps

You've now mastered multi-environment configuration management. Next:

**Step 5: The Final Challenge** - Put all your skills to the test in a comprehensive production incident simulation.

[Continue to Step 5: The Final Challenge](./step-05-final-challenge.md)
