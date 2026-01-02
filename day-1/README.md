# Day 1 – Foundations & Cloud Native Mindset

## Objectives of the Day

At the end of this day, you should be able to:

* Explain what **cloud native architecture** means beyond buzzwords
* Identify the **core architectural constraints** of cloud native systems
* Distinguish cloud native applications from “containerized legacy” systems
* Understand the role of containers and **immutability**
* Set up and validate a **local Kubernetes cluster** using `kind`
* Deploy and run a **first containerized service**, locally and in Kubernetes

Day 1 is about **foundations**.
We deliberately move slowly to ensure everyone starts from a solid and shared base.

---

## Context

Cloud native architecture is not defined by tools, platforms, or vendors.
It is defined by a set of **constraints** imposed by modern environments:

* Infrastructure is ephemeral
* Failures are normal, frequent, and expected
* Scaling is horizontal
* Systems evolve continuously

Kubernetes does not magically solve these problems.
It **enforces** assumptions that architectures must respect.

Today, we focus on:

* building a shared mental model,
* challenging implicit assumptions,
* preparing a local environment that will be used for the rest of the module.

---

## Morning – What “Cloud Native Architecture” Really Means

### Objectives

The goals of the morning session are to:

* Align vocabulary and mental models
* Break common misconceptions around “cloud native”
* Frame the **architectural constraints** that drive design decisions

Before touching Kubernetes or YAML, it is essential to understand *why* these systems exist.

---

### What Cloud Native *Is* (and Is Not)

Topics discussed:

* Cloud native is **not**:

  * “running in containers”
  * “using Kubernetes”
  * “deploying on the cloud”
* Cloud native **is**:

  * an architectural style
  * a response to scale, change, and failure
  * a set of constraints that shape system design

We revisit the CNCF definition with a **2025 perspective**, focusing on intent rather than tooling.

---

### Core Architectural Constraints

We will come back to these constraints throughout the module:

* **Statelessness**
* **Immutability**
* **Horizontal scalability**
* **Failure as a normal condition**

Key idea:

> In cloud native systems, infrastructure is unreliable by design.
> Architecture must assume this from day one.

---

### Cloud Native vs “Containerized Legacy”

We compare:

* monolithic or stateful applications packaged in containers
* applications *designed* for elasticity, replication, and failure

The difference is architectural, not technological.

---

### DevOps, Platform Teams, and SRE (Updated View)

We clarify roles that are often confused:

* Developers
* Platform / DevOps teams
* Site Reliability Engineering (SRE)

And how cloud native architecture reshapes responsibilities between them.

---

### CNCF Ecosystem – An Updated View

Rather than listing tools, we focus on **layers**:

* Runtime
* Networking
* Observability
* Delivery

Important framing points:

* Kubernetes is the **control plane**, not “the solution”
* Tool sprawl is itself an architectural risk
* Simplicity is a feature

---

### Short Exercise (Discussion)

> Take an application you know.
> What breaks if you run **five instances** of it at the same time?

This question will guide many decisions later in the module.

---

## Afternoon – Containers & Local Kubernetes Setup

The afternoon is focused on **making cloud native constraints concrete**.

Expect friction. This is normal.

---

### Step 0 – Local Environment Setup (Important)

👉 [Go to Step 0: Local Environment Setup](./step-00-local-setup.md)


---

### Step 1 – Containers as Immutable Artifacts

👉 [Go to Step 1: Containers as Immutable Artifacts](./step-01-containers.md)

---

### Step 2 – Deploying echo-service to Kubernetes

👉 [Go to Step 2: Deploying echo-service to Kubernetes](./step-02-deploy-to-k8s.md)

---

### Step 3 – Service-to-Service Communication

👉 [Go to Step 3: Service-to-Service Communication](./step-03-communication.md)

---

### End-of-Day 1 Summary

Before ending Day 1, you should be comfortable explaining:

* Why containers are immutable artifacts
* Why Kubernetes manages **desired state**
* Why Pods are disposable
* Why Services exist
* Why scaling breaks bad architectures

Day 2 will build on this by:

* externalizing configuration properly
* managing updates and rollouts
* treating Kubernetes as a **platform**, not just a scheduler

---

### Reflection (5–10 minutes)

Answer briefly:

* What was new or surprising today?
* What assumptions were challenged?
* What would break if we ran **10 instances** of this service?

We will build on these answers tomorrow.
