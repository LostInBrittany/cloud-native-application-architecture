# Step 2 – Pods, Deployments, and Services (Revisited)

## Concept

You already used these objects. Now we make their roles explicit:

* **Pod**

  * the smallest execution unit
  * one or more containers
  * ephemeral by design

* **Deployment**

  * describes the desired state
  * manages Pods over time
  * enables self-healing and rolling updates

* **Service**

  * stable network abstraction
  * decouples clients from Pods

Key idea:

> You almost never manage Pods directly.

---

## Hands-on: Inspecting Resources

Inspect existing resources:

```bash
kubectl get pods
kubectl get deployments
kubectl get services
```

Describe the Deployment to see its configuration:

Describe the Deployment to see its configuration:

```bash
kubectl describe deployment log-service
```

Ask yourself:

* Which field controls the number of Pods?
* Which labels link Pods to the Service?
* What is the current image version?

---

## Hands-on: Observing Workloads

To check if your application is actually working, `kubectl get` is not enough.

**1. Logs**

See what the application is printing to stdout:

```bash
kubectl logs -l app=log-service
```
*(Note: `-l` selects pods by label, which is easier than typing random pod names)*

**2. Resource Usage**

See how much CPU and RAM your pods are using:

```bash
kubectl top pods
```
*(Note: precise values require `metrics-server`. K3d usually has it enabled, but if the command fails, it might take a minute to start).*

---

## Hands-on: Live Configuration Changes

Kubernetes allows you to change things without deleting them.

**1. Scaling**

Imperatively scale the deployment:

```bash
kubectl scale deployment log-service --replicas=5
```

Watch it happen:

```bash
kubectl get pods -w
```

**2. Editing Live**

You can edit the API object directly in your editor:

```bash
kubectl edit deployment log-service
```

Try changing the `replicas` field back to 3, or adding an environment variable.
Upon save, Kubernetes will apply the change immediately.

> **Warning**: `kubectl edit` is great for debugging but **terrible for stability**.
> Changes made here are not tracked in git. Always prefer updating your YAML files and running `kubectl apply`.
