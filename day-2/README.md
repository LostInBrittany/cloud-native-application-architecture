# Day 2 – Kubernetes as an Application Platform

## Objectives

At the end of this day, you should be able to:

* Understand the **core Kubernetes objects** involved in running applications
* Reason about **namespaces** and isolation
* Inspect and interact with running workloads using `kubectl`
* Manage **configuration** and **secrets** outside container images
* Understand and apply **resource requests and limits**
* Use **health probes** to help Kubernetes manage application lifecycle
* Understand how Kubernetes helps deal with **complexity**, and where tools like Helm fit
* Reason about **scheduling constraints** (taints, tolerations, affinity)

Day 2 is about treating Kubernetes not as a “container runner”, but as an **application platform**.

---

## Context

On Day 1, you learned that:

* containers are immutable artifacts
* Pods are disposable
* Kubernetes enforces **desired state**
* Services decouple clients from instances

Today, we go deeper into **how Kubernetes actually manages applications**, and what levers you have as an application architect.

The focus is not memorization of YAML fields, but understanding:

* *why* these mechanisms exist
* *when* to use them
* *what trade-offs they imply*

---

## Preparing a Multi-Node Local Kubernetes Cluster (Important)

Before exploring scheduling, resource management, and affinities, we need a **multi-node Kubernetes cluster**.

We will use **K3d** for this.

👉 [Go to Step 0: Multi-Node Setup (Kind vs K3d)](./step-00-multi-node-local-setup.md)



## 1. Build & Deploy Your Own Service
👉 [Go to Step 1: Build Your Own Log Service](./step-01-build-log-service.md)

## 2. Pods, Deployments, and Services (Revisited)
👉 [Go to Step 2: Pods, Deployments, and Services](./step-02-core-concepts.md)

---

## 3. Namespaces – Logical Isolation
👉 [Go to Step 3: Namespaces](./step-03-namespaces.md)

---

## 4. Executing Commands in Running Containers
👉 [Go to Step 4: Executing Commands](./step-04-executing-commands.md)

---


## 5. Resource Management – Requests and Limits
👉 [Go to Step 5: Resource Management](./step-05-resource-management.md)

---

## 6. ConfigMaps & Secrets – Configuration Outside the Image
👉 [Go to Step 6: ConfigMaps & Secrets](./step-06-configmaps-secrets.md)

---

## 7. Health Probes – Let Kubernetes Help You
👉 [Go to Step 7: Health Probes](./step-07-health-probes.md)

---


## 8. Scheduling Constraints – Taints, Tolerations, Affinity
👉 [Go to Step 8: Scheduling](./step-08-scheduling.md)

---

## 9. Dealing With Complexity – Why Tools Like Helm Exist
👉 [Go to Step 9: Helm – The Package Manager](./step-09-helm.md)

---

## Day 2 Conclusion

By now, you should understand that Kubernetes:

* runs applications declaratively
* enforces architectural assumptions
* exposes powerful but sharp tools

You are not learning “how to use Kubernetes”.
You are learning **how Kubernetes expects applications to behave**.

---

## Reflection (5 minutes)

Answer briefly:

* Which Kubernetes feature surprised you the most?
* Which one feels the most dangerous if misused?
* Which one do you expect to use most often?

