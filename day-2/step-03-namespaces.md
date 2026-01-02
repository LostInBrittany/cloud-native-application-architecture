# Step 3 – Namespaces: Logical Isolation

## Concept

Namespaces allow you to:

* group related resources
* isolate environments (e.g., `dev`, `staging`, `prod`)
* avoid **naming collisions**

They are **not** security boundaries by default (workloads in one namespace can usually talk to another unless NetworkPolicies are used), but they are excellent **management boundaries**.

---

## 1. Creating Isolated Environments

Imagine we want to deploy our `log-service` in two environments: **Development** and **Production**.
We want to use the **exact same name** (`log-service`) for both, so our tooling doesn't get confused.

Create the namespaces:

```bash
kubectl create namespace dev
kubectl create namespace prod
```

List them:

```bash
kubectl get namespaces
```

---

## 2. Deploying to Multiple Namespaces

We can use the **exact same manifest** `k8s/day-2/log-service.yaml` for both environments.
We just tell `kubectl` which "bucket" to put it in.

Deploy to `dev`:

```bash
kubectl apply -n dev -f k8s/day-2/log-service.yaml
```

Deploy to `prod`:

```bash
kubectl apply -n prod -f k8s/day-2/log-service.yaml
```

---

## 3. Verifying Isolation

Let's check `dev`:

```bash
kubectl get all -n dev
```

And `prod`:

```bash
kubectl get all -n prod
```

Observe that:
1. Both namespaces have a Service named `log-service`.
2. Both have a Deployment named `log-service`.
3. They are completely independent objects.

### What happens if you forget `-n`?

```bash
kubectl get pods
```

This lists resources in the `default` namespace. You won't see your new pods here!
Context matters.

---

## 4. Cleanup

We can delete a namespace, and **everything inside it** will be deleted.

```bash
kubectl delete namespace dev
kubectl delete namespace prod
```

(This might take a few seconds as Kubernetes terminates the resources).
