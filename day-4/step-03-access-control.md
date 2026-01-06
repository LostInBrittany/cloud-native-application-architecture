# Step 3 – Access Control & Least Privilege (RBAC)

## Overview

In the previous steps, we hardened our containers and scaled them. Now we need to secure **how they talk to the Kubernetes API**.

By default, Kubernetes follows a "deny-all" philosophy for applications: a standard pod cannot read Secrets, delete Services, or list Nodes. However, real-world applications (monitoring agents, CI/CD runners, operators) often *need* these permissions.

**The Danger:** If you give an application too much power (like `cluster-admin`), a security breach in that app becomes a breach of your entire cluster.

**The Solution:** Role-Based Access Control (RBAC) allows us to grant the **minimum necessary permissions**.

---

## 1. The Core Concepts

RBAC consists of three main components:

1. **ServiceAccount (Who):** The identity your application runs as.
2. **Role / ClusterRole (What):** A set of permissions (e.g., "can list pods").
3. **RoleBinding / ClusterRoleBinding (Connection):** Connecting the "Who" to the "What".

```
        Identity               Binding                 Permissions
    +---------------+    +------------------+    +------------------+
    | ServiceAccount| -> | RoleBinding      | -> | Role             |
    | (Who)         |    | (Connection)     |    | (What)           |
    +---------------+    +------------------+    +------------------+
    | monitor-sa    |    | monitor-binding  |    | pod-viewer       |
    +---------------+    +------------------+    +------------------+
                                                        |
                                                        v
                                                 +------------------+
                                                 | Rules:           |
                                                 | - resources: pods|
                                                 | - verbs: get     |
                                                 +------------------+
```
-> *Concept: User/SA + RoleBinding + Role = Access*

---

## 2. Practical Exercise: "The Unauthorized Spy"

Let's see what happens by default. We'll deploy a pod containing `kubectl` and try to query the API.

### 2.1 Deploy a Test Pod

Create `k8s/day-4/rbac-test.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: api-spy
  namespace: default
spec:
  serviceAccountName: default  # Using the default account
  containers:
  - name: spy
    image: bitnami/kubectl:latest
    command: ["sleep", "3600"]
```

Apply it:

```bash
kubectl apply -f k8s/day-4/rbac-test.yaml
```

### 2.2 Try to Spy

Exec into the pod and try to list pods:

```bash
kubectl exec -it api-spy -- kubectl get pods
```

**Expected Output:**
```
Error from server (Forbidden): pods is forbidden: User "system:serviceaccount:default:default" cannot list resource "pods" in API group "" in the namespace "default"
```

**Analysis:**
- **User:** `system:serviceaccount:default:default` (The default identity)
- **Action:** List pods
- **Result:** Forbidden (403)

This is good! By default, pods are secure. But what if we *need* this pod to monitor other pods?

---

## 3. Granting Permissions the Right Way

We want `api-spy` to be able to **view** pods, but **not delete** them.

### 3.1 Create a Dedicated ServiceAccount

Never attach permissions to the `default` ServiceAccount. Always create a dedicated identity.

Create `k8s/day-4/monitor-sa.yaml`:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: monitor-sa
  namespace: default
```

apkply it:

```bash
kubectl apply -f k8s/day-4/monitor-sa.yaml
```

### 3.2 Create a Role (The Permissions)

A `Role` is namespaced. It defines *what* can be done.

Append to `k8s/day-4/monitor-sa.yaml`:

```yaml
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: default
  name: pod-viewer
rules:
- apiGroups: [""] # "" indicates the core API group
  resources: ["pods", "services"]
  verbs: ["get", "watch", "list"]
```

Apply it:

```bash
kubectl apply -f k8s/day-4/monitor-sa.yaml
```

### 3.3 Create a RoleBinding (The Connection)

Now we connect `monitor-sa` to `pod-viewer`.

Append to `k8s/day-4/monitor-sa.yaml`:

```yaml
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: monitor-view-binding
  namespace: default
subjects:
- kind: ServiceAccount
  name: monitor-sa
  namespace: default
roleRef:
  kind: Role
  name: pod-viewer
  apiGroup: rbac.authorization.k8s.io
```

Apply the full configuration:

```bash
kubectl apply -f k8s/day-4/monitor-sa.yaml
```

---

## 4. Verify Access

Now we need to update our pod to use the new `monitor-sa` identity.

### 4.1 Update the Pod

Update `k8s/day-4/rbac-test.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: api-spy
  namespace: default
spec:
  serviceAccountName: monitor-sa  # UPDATED: Use our custom identity
  containers:
  - name: spy
    image: bitnami/kubectl:latest
    command: ["sleep", "3600"]
```

Recreate the pod (ServiceAccount cannot be changed on running pod):

```bash
kubectl delete pod api-spy --force
kubectl apply -f k8s/day-4/rbac-test.yaml
```

### 4.2 Validate Permissions

**Test 1: List Pods (Should Work)**
```bash
kubectl exec -it api-spy -- kubectl get pods
```
> ✅ **Success!** You should see the list of pods.

**Test 2: Delete Pods (Should Fail)**
```bash
kubectl exec -it api-spy -- kubectl delete pod api-spy
```
> ❌ **Forbidden!** Why? Because our role only allows `["get", "watch", "list"]`. We did not include `"delete"`.

**Test 3: List Secrets (Should Fail)**
```bash
kubectl exec -it api-spy -- kubectl get secrets
```
> ❌ **Forbidden!** Why? Because our role only allows resources `["pods", "services"]`. Secrets are excluded.

---

## 5. Role vs ClusterRole

- **Role:** Namespaced. "Can I read pods in `default` namespace?"
- **ClusterRole:** Global. "Can I read Nodes?" or "Can I read pods in ALL namespaces?"

**Rule of Thumb:** Always use `Role` unless you absolutely need cluster-wide access (like for a Node monitoring agent).

### 5.1 The Danger of ClusterRoles

If you give a pod a `ClusterRoleBinding` to `cluster-admin`, that pod can delete namespaces, read all secrets, and essentially take over the cluster.

**Attack Vector:**
1. Attacker finds a vulnerability in your web app.
2. Attacker gets shell access (RCE).
3. Attacker uses the mounted ServiceAccount token to talk to API.
4. If SA has `cluster-admin`, Attacker deletes your production namespace.

**Mitigation:**
Always use RBAC to scope permissions to:
1. The specific **Namespace** (using RoleBinding)
2. The specific **Resources** (pods, not secrets)
3. The specific **Verbs** (read, not delete)

---

## 6. Summary

| Component | Purpose | Analogy |
|-----------|---------|---------|
| **ServiceAccount** | Identity for processes | Your Employee ID badge |
| **Role** | Permissions list | "Can access 3rd floor & cafeteria" |
| **RoleBinding** | Grants permissions to Identity | Activating the badge |

### Checklist for Production:
1. [ ] Does every app have its own `ServiceAccount`? (Don't use `default`)
2. [ ] Are permissions scoped to the namespace (`Role`, not `ClusterRole`)?
3. [ ] Are verbs minimized (e.g., `get` but not `list` or `delete`)?
4. [ ] Are sensitive resources (Secrets, ConfigMaps) excluded unless needed?

---

[Next: Multi-Environment Strategy](./step-04-multi-environment.md)
