# Step 1 – Security Hardening for Production

## The Security Reality

In Days 1-3, we focused on **getting things working**. That's the right approach for learning.

But in production, "it works" is not enough. You must also ask:

* **What happens if this container is compromised?**
* **What can an attacker do from inside this pod?**
* **What secrets or credentials are exposed?**

Security in Kubernetes is about **minimizing blast radius**—limiting what an attacker can do if they get in.

Today we apply the **principle of least privilege** to our workloads.

---

## 1. The Attack Surface of a Default Pod

Let's examine what a default pod can do. Deploy a simple test pod:

```bash
kubectl run test-pod --image=busybox --rm -it --restart=Never -- sh
```

Once inside, try:

```bash
# Who am I?
whoami
# Result: root (!)

# Can I write to the filesystem?
touch /test-file
# Result: Yes

# What processes can I see?
ps aux
# Result: All processes in the container

# Can I access the Kubernetes API?
ls /var/run/secrets/kubernetes.io/serviceaccount/
# Result: token  ca.crt  namespace (3 files!)
```

**Wait, what are these files?**

Let's look at them more closely:

```bash
# What's in these files?
cat /var/run/secrets/kubernetes.io/serviceaccount/namespace
# Result: default (the namespace this pod runs in)

cat /var/run/secrets/kubernetes.io/serviceaccount/ca.crt | head -n 2
# Result: -----BEGIN CERTIFICATE----- (Kubernetes API certificate)

cat /var/run/secrets/kubernetes.io/serviceaccount/token
# Result: eyJhbGciOiJSUzI1NiIsImtpZCI6Ij... (a JWT token!)
```

**This token is a credential that authenticates this pod to the Kubernetes API.**

Let's see what we can do with it:

```bash
# Set up variables for API access
APISERVER=https://kubernetes.default.svc
TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
CACERT=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt

# Try to list pods in the cluster
wget --no-check-certificate --header="Authorization: Bearer $TOKEN" \
  -O - $APISERVER/api/v1/namespaces/default/pods 2>&1 | head -n 20
```

**What you'll likely see:**

```
Connecting to kubernetes.default.svc (10.43.0.1:443)
wget: server returned error: HTTP/1.1 403 Forbidden
```

**What does this mean?**

****Good news:** RBAC (Role-Based Access Control) is working - the default service account has no permissions by default

****Bad news:** The token exists and can authenticate to the API - more on why this is dangerous below

Exit the pod (type `exit`).

---

### Understanding the Service Account Token Risk

Let's break down what we just observed:

**What happened:**
1. **The token files exist in `/var/run/secrets/kubernetes.io/serviceaccount/`
2. **We can authenticate to the Kubernetes API (connection succeeded)
3. **RBAC blocked us with 403 Forbidden (good default security!)

**So what's the problem if RBAC blocks it?**

The issue is that **the token is a latent credential** waiting to be exploited:

### Scenario 1: Permissions Granted Later

Many tutorials and StackOverflow answers tell you to do this:

```bash
# DON'T DO THIS! (But many people do)
kubectl create clusterrolebinding default-admin \
  --clusterrole=cluster-admin \
  --serviceaccount=default:default
```

Now that same token you just saw would have **full cluster admin rights**. If your app is compromised, attackers can:

* List and read all secrets (including database passwords, API keys)
* Create pods to mine cryptocurrency or exfiltrate data
* Delete production workloads (ransomware-style attacks)
* Pivot to other namespaces and escalate privileges

### Scenario 2: The Token is Already Powerful

In some clusters:
* Shared development clusters often have permissive RBAC
* Legacy clusters may have old ClusterRoleBindings granting broad permissions
* Some operators or tools create service accounts with excessive permissions

**You don't control RBAC.** Someone else might grant permissions to your service account later.

### Scenario 3: Defense in Depth

**Principle of least privilege:** If your application doesn't need Kubernetes API access, why give attackers a credential at all?

Even if RBAC is perfect today:
* Configuration drift happens
* People make mistakes
* Attackers are patient and creative

**Better to remove the attack vector entirely.**

### Real-World Example: Tesla Kubernetes Breach (2018)

1. Attackers found an unsecured Kubernetes dashboard
2. Got access to a pod with a service account token
3. The token had permissions to create new pods
4. Deployed cryptocurrency miners across the entire cluster
5. Cost Tesla money and computing resources

**The lesson:** Service account tokens + broad permissions = cluster compromise

---

### Summary: Why This Matters

**What we observed:**
* By default, containers run as **root**
* Filesystems are **writable**
* Service account tokens are **automatically mounted**

**Current state:**
* **K3d's RBAC is secure by default (403 Forbidden)
* **But the credential still exists
* **And it could become powerful if permissions are granted

**Production mindset:**
* Don't rely on RBAC being configured correctly forever
* Remove unnecessary credentials (defense in depth)
* Apply the principle of least privilege

**This is why we'll use `automountServiceAccountToken: false` for production workloads.**

---

## 2. Security Context – Running as Non-Root

The first hardening step: **never run as root**.

### 2.1 Create a Secure Pod Definition

Create `k8s/day-4/secure-pod.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
spec:
  securityContext:
    runAsNonRoot: true      # Enforce non-root
    runAsUser: 1000         # Specific UID
    runAsGroup: 3000        # Specific GID
    fsGroup: 2000           # For volume permissions
  containers:
    - name: app
      image: busybox
      command: ["sleep", "3600"]
      securityContext:
        allowPrivilegeEscalation: false  # Cannot gain more privileges
        capabilities:
          drop:
            - ALL                         # Drop all Linux capabilities
        readOnlyRootFilesystem: true      # Filesystem is read-only
```

Apply it:

```bash
kubectl apply -f k8s/day-4/secure-pod.yaml
```

### 2.2 Test the Security Constraints

```bash
kubectl exec -it secure-pod -- sh
```

Inside the pod, try:

```bash
# Who am I now?
whoami
# Result: error (no /etc/passwd entry) or "I have no name!" - but NOT root

# What's my UID?
id
# Result: uid=1000 gid=3000

# Can I write to the filesystem?
touch /test-file
# Result: Read-only file system (**blocked)

# Can I write to /tmp (typically writable)?
touch /tmp/test
# Result: Read-only file system (**blocked - even /tmp!)

# Can I still access Kubernetes API credentials?
ls /var/run/secrets/kubernetes.io/serviceaccount/
# Result: token  ca.crt  namespace (still there!)
```

Exit the pod.

**Important observation:** We've blocked root access and filesystem writes, but the **Kubernetes API token is still mounted**. We'll fix that in the next section.

**This is much better.** But we've created a problem: many applications need to write temporary files.

### 2.3 Allow Writes to Specific Directories

Update the pod to add an `emptyDir` volume for temporary files:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod-v2
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
  containers:
    - name: app
      image: busybox
      command: ["sleep", "3600"]
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop:
            - ALL
        readOnlyRootFilesystem: true
      volumeMounts:
        - name: tmp
          mountPath: /tmp              # Only /tmp is writable
  volumes:
    - name: tmp
      emptyDir: {}                     # Temporary storage (pod lifetime)
```

Apply and test:

```bash
kubectl apply -f k8s/day-4/secure-pod-v2.yaml
kubectl exec -it secure-pod-v2 -- sh

# Inside the pod:
touch /test-file         # Still fails (read-only root)
touch /tmp/works         # Success! (mounted volume)
ls /tmp/
```

**Pattern:** Read-only root filesystem + writable volumes for specific paths.

---

## 3. Applying Security Contexts to Real Services

Let's harden one of our services from Day 3.

We'll use `echo-service-with-otel` from Day 3 as the base. This service already has:
* OpenTelemetry tracing configured
* Prometheus metrics annotations
* Proper environment configuration

Now we'll add **security hardening** on top of that production-ready configuration.

### 3.1 Prepare the Hardened Service

First, copy the service code from Day 3:

```bash
# Copy the service code
cp -r services/day-3/echo-service-with-otel services/day-4/echo-service-hardened
```

**Why copy instead of reuse?**
- Clear separation between Day 3 (learning OTel) and Day 4 (learning security)
- The service code itself is identical - security hardening happens in the **Kubernetes manifest**, not the application code

Build and import the image:

```bash
# Build the image
docker build -t echo-service-hardened:latest services/day-4/echo-service-hardened

# Load it into k3d
k3d image import echo-service-hardened:latest -c day4
```

### 3.2 Create Hardened echo-service Deployment

Now create the Kubernetes manifest with security features.

Create `k8s/day-4/echo-service-hardened.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: echo-service
  labels:
    app: echo-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: echo-service
  template:
    metadata:
      labels:
        app: echo-service
      annotations:
        # Prometheus annotations (from Day 3)
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
        prometheus.io/path: "/metrics"
    spec:
      # NEW: Pod-level security context
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 2000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: echo-service
          image: echo-service-hardened:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          env:
            # Application config (from Day 3)
            - name: APP_NAME
              value: "echo-service-otel"
            - name: APP_VERSION
              value: "v1"
            - name: PORT
              value: "8080"
            - name: SIMULATE_DELAY_MS
              value: "0"
            # OpenTelemetry config (from Day 3)
            - name: OTEL_SERVICE_NAME
              value: "echo-service"
            - name: OTEL_EXPORTER_OTLP_ENDPOINT
              value: "http://tempo.monitoring.svc.cluster.local:4317"
          # NEW: Container-level security context
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
            readOnlyRootFilesystem: true
          # NEW: Writable volume for temporary files
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
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 3
            periodSeconds: 5
      # NEW: Volumes for writable paths
      volumes:
        - name: tmp
          emptyDir: {}
      # NEW: Disable service account token mounting
      automountServiceAccountToken: false
---
apiVersion: v1
kind: Service
metadata:
  name: echo-service
  labels:
    app: echo-service
spec:
  type: ClusterIP
  selector:
    app: echo-service
  ports:
    - name: http
      port: 8080
      targetPort: 8080
```

**New Security Features:**
* `seccompProfile: RuntimeDefault` - Limits system calls (defense against kernel exploits)
* `automountServiceAccountToken: false` - **No Kubernetes API access** (disables the automatic token mounting we saw earlier!)
* `readOnlyRootFilesystem: true` - Prevents malware persistence
* `runAsNonRoot: true` - Enforced at pod and container level

Apply it:

```bash
kubectl apply -f k8s/day-4/echo-service-hardened.yaml
```

Test it works:

```bash
curl -X POST localhost:8080/echo -H "Content-Type: application/json" -d '{"test": "message"}'
```

**Verify the token is NOT mounted:**

```bash
kubectl exec -it deployment/echo-service -- sh

# Inside the pod:
ls /var/run/secrets/kubernetes.io/serviceaccount/
# Result: ls: /var/run/secrets/kubernetes.io/serviceaccount/: No such file or directory

# Try to access the API
wget --timeout=2 -O- https://kubernetes.default.svc/api
# Result: Connection timeout or "Unauthorized" (no token!)
```

****The pod can no longer authenticate to the Kubernetes API.**

Exit the pod.

---

## 4. Pod Security Standards (PSS)

Kubernetes has built-in security policies called **Pod Security Standards**.

There are three levels:

| Level        | Description                                      | Use Case                   |
|--------------|--------------------------------------------------|----------------------------|
| **Privileged** | Unrestricted (no restrictions)                   | System/infrastructure pods |
| **Baseline**   | Minimal restrictions (blocks known bad practices)| Development environments   |
| **Restricted** | Hardened (best practices enforced)               | **Production workloads**   |

### 4.1 Check Current Pod Security Standards

First, let's see what Pod Security Standards are currently enforced in the default namespace:

```bash
kubectl describe namespace default
```

**Expected output:**

```
Name:         default
Labels:       kubernetes.io/metadata.name=default
Annotations:  <none>
Status:       Active

No resource quota.

No LimitRange resource.
```

Notice there are **no `pod-security.kubernetes.io/*` labels**. This means **no Pod Security Standards are enforced** in the default namespace - pods can run with any security configuration, which is why we were able to deploy insecure pods (running as root, writable filesystems, etc.) earlier.

**This is the default behavior for Kubernetes namespaces** - no enforcement unless explicitly configured. Maximum flexibility for development, but not suitable for production.

### 4.2 Enable Pod Security Standards on a Namespace

Now let's create a production namespace with restricted policy:

```bash
kubectl create namespace production

kubectl label namespace production \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/audit=restricted \
  pod-security.kubernetes.io/warn=restricted
```

### 4.2 Test: Deploy an Insecure Pod

Try deploying a pod that runs as root:

```yaml
# k8s/day-4/insecure-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: insecure-pod
  namespace: production
spec:
  containers:
    - name: app
      image: busybox
      command: ["sleep", "3600"]
```

```bash
kubectl apply -f k8s/day-4/insecure-pod.yaml
```

**Expected result:**
```
Error from server (Forbidden): error when creating "k8s/day-4/insecure-pod.yaml": pods "insecure-pod" is forbidden: violates PodSecurity "restricted:latest": allowPrivilegeEscalation != false (container "app" must set securityContext.allowPrivilegeEscalation=false), unrestricted capabilities (container "app" must set securityContext.capabilities.drop=["ALL"]), runAsNonRoot != true (pod or container "app" must set securityContext.runAsNonRoot=true), seccompProfile (pod or container "app" must set securityContext.seccompProfile.type to "RuntimeDefault" or "Localhost")
```

****The namespace rejected the insecure pod automatically.**

**What this error tells us:**

The Pod Security Standard `restricted` policy is enforcing security requirements. Let's break down each violation:

1. **`allowPrivilegeEscalation != false`**
   - The pod doesn't explicitly prevent privilege escalation
   - Privilege escalation means a process can gain more privileges than its parent process
   - Example: A non-root process could use `setuid` binaries (like `sudo`, `passwd`) to gain root privileges
   - Even if you start as UID 1000, without this protection, malicious code could exploit setuid binaries to become root
   - Fix: Add `securityContext.allowPrivilegeEscalation=false`

2. **`unrestricted capabilities`**
   - The pod hasn't dropped Linux capabilities (could have dangerous permissions)
   - Linux capabilities are fine-grained privileges that break down root's power into discrete units
   - Examples of dangerous capabilities:
     - `CAP_SYS_ADMIN` - Mount filesystems, change namespaces (almost as powerful as root)
     - `CAP_NET_ADMIN` - Modify network settings, sniff traffic
     - `CAP_SYS_PTRACE` - Debug/inspect other processes (steal secrets from memory)
     - `CAP_DAC_OVERRIDE` - Bypass file read/write/execute permissions
   - Fix: Add `securityContext.capabilities.drop=["ALL"]`

3. **`runAsNonRoot != true`**
   - The pod doesn't enforce running as non-root (could run as UID 0)
   - Fix: Add `securityContext.runAsNonRoot=true`

4. **`seccompProfile`**
   - No seccomp profile specified (allows unrestricted system calls)
   - **Seccomp** (Secure Computing Mode) is a Linux kernel feature that filters system calls
   - System calls are how processes interact with the kernel (e.g., `open()`, `read()`, `execve()`, `ptrace()`)
   - Without seccomp, a compromised container can make dangerous system calls:
     - `reboot()` - Crash the entire node
     - `clone()` with specific flags - Create malicious processes
     - `mount()` - Mount filesystems and escape the container
   - `RuntimeDefault` profile blocks ~44 dangerous syscalls out of 300+ total
   - Fix: Add `securityContext.seccompProfile.type="RuntimeDefault"`

**This is exactly what we want in production** - the namespace acts as a **security gatekeeper**, preventing insecure workloads from being deployed, even if developers forget to add security contexts.

### 4.3 Deploy the Hardened Pod to Production

```bash
kubectl apply -f k8s/day-4/echo-service-hardened.yaml -n production
kubectl get pods -n production
```

It should work because it meets the restricted profile.

---

## 5. Network Policies – Microsegmentation (Conceptual)

By default in Kubernetes, **all pods can talk to all pods**. This is convenient for development but creates security risks in production.

### 5.1 The Problem: Lateral Movement

Imagine an attacker compromises one pod in your cluster (through a vulnerability, leaked credentials, etc.). Without network policies:

- The compromised pod can access **any other pod** in the cluster
- Can scan for databases, APIs, secrets
- Can pivot to other services
- Can exfiltrate data from any accessible service

This is called **lateral movement** - an attacker moving sideways through your infrastructure after initial compromise.

### 5.2 The Solution: Network Policies

Kubernetes Network Policies provide **microsegmentation** - fine-grained control over which pods can communicate.

**Key Concepts:**

1. **Default Deny**: Start by blocking all traffic
2. **Explicit Allow**: Only permit necessary communication paths
3. **Label-based Selection**: Use pod labels to define who can talk to whom

**Example Policy:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-frontend
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend-api  # Target: backend-api pods
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend  # Only allow traffic from frontend pods
      ports:
        - protocol: TCP
          port: 8080
```

**What this does:**
- Applies to pods with label `app=backend-api`
- Only allows ingress traffic from pods with label `app=frontend`
- Blocks all other traffic to backend-api (including from compromised pods)

### 5.3 Common Network Policy Patterns

**Pattern 1: Default Deny All**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}  # Applies to all pods
  policyTypes:
    - Ingress
    - Egress
```

This blocks all ingress and egress traffic. Then add specific allow policies.

**Pattern 2: Allow DNS Only**

```yaml
egress:
  - to:
      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: kube-system
    ports:
      - protocol: UDP
        port: 53
```

Allows pods to resolve DNS names (essential for service discovery).

**Pattern 3: Allow Specific Service Communication**

```yaml
ingress:
  - from:
      - podSelector:
          matchLabels:
            app: api-gateway
    ports:
      - protocol: TCP
        port: 8080
```

Only allows traffic from the API gateway to reach backend services.

### 5.4 Important Limitations

**Network Policies only work with compatible CNIs:**

- **Supported**: Calico, Cilium, Weave Net
- **NOT Supported**: Flannel (k3d default), basic Docker networking

This is why we're not doing hands-on exercises with network policies in this workshop - k3d uses Flannel by default, which doesn't enforce network policies. They would appear to apply but wouldn't actually block traffic.

**In production Kubernetes environments** (EKS, GKE, AKS), you typically have:
- Calico on EKS (Amazon)
- Cilium on GKE (Google)
- Azure CNI on AKS (Microsoft)

All of these support Network Policies properly.

### 5.5 How Policies Combine

When multiple network policies select the same pod:
- They combine with **OR logic**
- Traffic is allowed if it matches **any** policy
- You can't create explicit "deny" rules - only "allow" rules

**Example:**

```
Policy 1: Allow from frontend
Policy 2: Allow from monitoring

Result: Pod accepts traffic from frontend OR monitoring
```

### 5.6 Production Best Practices

1. **Start with default deny** - Block everything, then explicitly allow
2. **Use namespace isolation** - Separate environments (dev/staging/prod)
3. **Limit egress** - Control what external services pods can reach
4. **Document your policies** - Network policies are security boundaries
5. **Test before enforcement** - Use audit mode if your CNI supports it

### 5.7 Why This Matters

Network policies are a critical **defense-in-depth** layer:

- **Pod security contexts**: Prevent container escape
- **RBAC**: Prevent unauthorized API access
- **Network policies**: Prevent lateral movement after compromise

Even if an attacker gets into one pod, network policies contain the blast radius by preventing access to other services.

**Real-world scenario:** The 2019 Capital One breach involved an attacker who compromised a web application. Without proper network segmentation, they accessed databases and S3 buckets they shouldn't have been able to reach. Network policies could have significantly limited the damage.

### 5.8 Key Takeaways

- Network policies provide microsegmentation within Kubernetes clusters
- They're essential for production security but require compatible CNI
- Start with default-deny and explicitly allow necessary traffic
- Use labels to define communication boundaries
- Test in production-like environments with proper CNI support

For this workshop, focus on understanding the **concepts and patterns**. When you work with production Kubernetes clusters, you'll have the CNI support needed to implement these policies.

---

## 6. Secret Management Best Practices

Secrets in Kubernetes are **base64 encoded, NOT encrypted** by default.

### 6.1 What NOT to Do

****Don't hardcode secrets in YAML:**
```yaml
env:
  - name: DB_PASSWORD
    value: "supersecret123"  # VISIBLE IN GIT, VISIBLE IN kubectl describe
```

****Don't commit secrets to Git:**
```bash
kubectl create secret generic db-creds --from-literal=password=secret123
# Then committing the YAML output to Git
```

### 6.2 What TO Do (Basic)

****Use Secrets, reference them, never expose values:**

```yaml
# Create secret (NOT from YAML in Git)
kubectl create secret generic db-creds \
  --from-literal=username=admin \
  --from-literal=password=supersecret123 \
  -n production

# Reference in deployment
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-creds
        key: password
```

****Use volume mounts for file-based secrets:**

```yaml
volumeMounts:
  - name: db-creds
    mountPath: /etc/secrets
    readOnly: true
volumes:
  - name: db-creds
    secret:
      secretName: db-creds
```

### 6.3 Production-Grade Solutions (Awareness)

For real production systems, consider:

* **Sealed Secrets** (Bitnami) - Encrypt secrets in Git
* **External Secrets Operator** - Sync from AWS Secrets Manager, HashiCorp Vault, etc.
* **SOPS** (Mozilla) - Encrypt YAML files with age/PGP

We won't implement these today, but **know they exist**.

---

## 7. Summary – Production Security Checklist

When hardening a Kubernetes workload for production:

- [ ] **Run as non-root** (`runAsNonRoot: true`, explicit `runAsUser`)
- [ ] **Read-only root filesystem** with writable volumes for necessary paths
- [ ] **Drop all capabilities** (`capabilities.drop: [ALL]`)
- [ ] **Disable privilege escalation** (`allowPrivilegeEscalation: false`)
- [ ] **Use seccomp profile** (`seccompProfile.type: RuntimeDefault`)
- [ ] **Don't mount service account tokens** unless needed (`automountServiceAccountToken: false`)
- [ ] **Apply Pod Security Standards** (`restricted` for production namespaces)
- [ ] **Use Network Policies** (default deny + explicit allow)
- [ ] **Never hardcode secrets** (use Secret resources, consider external secret management)
- [ ] **Set resource limits** (prevents resource exhaustion attacks)

---

## 8. Exercise – Harden Your Own Service

**Task:** Take the `log-service` from Day 3 and apply all security hardening steps.

**Steps:**
1. Add security context (non-root, read-only filesystem)
2. Add necessary volume mounts (e.g., `/tmp` if needed)
3. Drop all capabilities
4. Disable service account token mounting
5. Deploy to the `production` namespace
6. Verify it still works
7. Create a network policy that only allows traffic from the ingress controller

**Success criteria:**
* Pod runs successfully
* `kubectl exec` shows non-root user
* Service responds to requests
* Writing to `/` fails (read-only filesystem)
* `/var/run/secrets/kubernetes.io/serviceaccount/` directory does NOT exist

---

## Key Takeaways

* **Security is not optional** in production Kubernetes
* **Default configurations are insecure** by design (for ease of development)
* **Service account tokens are credentials** - they give API access, and most apps don't need them
* **Defense in depth:** Multiple layers (security context, PSS, network policies, secrets)
* **Minimize blast radius:** Assume compromise, limit damage

Security is not a checkbox. It's a **continuous practice**.

---

[Next: Autoscaling & Availability](./step-02-autoscaling-availability.md)
