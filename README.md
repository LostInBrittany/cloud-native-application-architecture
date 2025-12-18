
# Cloud Native Application Architecture (2025-2026 version)

Pedagogical material for the 2025-2026 version of the **Cloud Native Application Architecture** module.

## Module Overview

This module aims to help you **design, understand, and experiment with modern cloud native architectures**, as they are built and operated today in real-world engineering teams.

The approach is intentionally **pragmatic and progressive**.
Instead of presenting a large number of tools or isolated demos, you will **build a distributed application step by step**, discovering along the way the constraints, architectural decisions, and trade-offs that are inherent to cloud native systems.

At the end of these 4 days, you are not expected to be “Kubernetes experts”.
However, you should be able to:

* understand **why** certain cloud native architectures work (or fail),
* communicate effectively with DevOps, Platform, and SRE teams,
* design a **reasonable, maintainable, and evolvable** cloud native architecture.

---

## Learning Objectives

By the end of this module, you will be able to:

* Understand the principles and constraints of **cloud native application development*** Choose appropriate **technologies and architectural patterns** for distributed systems
* Design, develop, and deploy a **microservices-based application**
* Understand the role of Kubernetes as an **application platform**
* Manage configuration and behavior in **highly distributed environments**
* Identify when advanced concepts (service mesh, serverless, etc.) are relevant — and when they are not

---

## Pedagogical Approach

This module follows a **hands-on, architecture-first approach**:

* ~30% theory, ~70% practice
* One **continuous case study** over the 4 days
* Progressive complexity, aligned with real-world usage
* Tooling kept **deliberately minimal** to focus on concepts

You will work with:

* Containers and container images
* A local Kubernetes cluster
* A small set of cooperating services
* Real deployment, configuration, and failure scenarios

The goal is not to memorize commands or YAML files, but to **reason about architecture**.

---

## Use of LLMs (ChatGPT, Copilot, etc.)

Using LLM-based assistants is **explicitly allowed** in this module.

However:

* LLMs are tools, not substitutes for understanding
* You are expected to:

  * understand what you apply,
  * explain architectural decisions,
  * reason about failures and trade-offs

Copy/paste without comprehension will not help you during discussions or evaluations.

In professional environments, engineers use AI assistants — **but remain responsible for their systems**.
This module follows the same philosophy.

---

## Technical Environment

All exercises are designed to run **locally**, without relying on public cloud providers.

You will use:

* Containers (Docker or compatible runtime)
* A local Kubernetes cluster (based on **kind**)
* Kubernetes-native mechanisms for deployment, configuration, and observation

Time is explicitly allocated at the beginning of the module to:

* install required tools,
* verify environments,
* create a working Kubernetes cluster.

Expect some friction — this is part of working with distributed systems.

---

## Repository Structure

This repository is your **workspace for the entire module**.

It is structured by **learning progression**, not by tools:

```text
.
├── day-1/        # Foundations and environment setup
├── day-2/        # Kubernetes as an application platform
├── day-3/        # Cloud native patterns and observability
├── day-4/        # Service mesh concepts and serverless
├── services/     # Application services (intentionally minimal)
├── k8s/          # Kubernetes manifests, evolving over time
├── scripts/      # Setup and helper scripts
└── docs/         # Architecture notes and diagrams
```

You are expected to:

* modify this repository throughout the module,
* add configuration, manifests, and documentation,
* use it as a **living architectural notebook**.

---

## 4-Day Course Structure

### [Day 1 – Cloud Native Foundations](./day-1/README.md)

* What “cloud native” really means
* Core constraints of distributed systems
* Containers and immutability
* Local Kubernetes installation and setup
* First containerized service
* Service-to-service communication

---

### [Day 2 – Kubernetes as a Platform](./day-2/README.md)

* Kubernetes core concepts (developer perspective)
* Deploying and exposing services
* Configuration and rollout strategies
* Designing a small microservices system
* Inter-service communication

---

### Day 3 – Cloud Native Patterns & Observability

* Resilience and failure handling
* Health checks and probes
* Configuration management
* Logs, metrics, and basic observability
* Debugging distributed applications

---

### Day 4 – Beyond the Basics

* Service mesh: concepts and use cases (simplified)
* Traffic management and security (conceptual + demo)
* Serverless architectures: when and why
* Final architecture review and discussion

---

## Evaluation & Expectations

Evaluation focuses on **understanding and reasoning**, not on feature completeness.

You may be asked to:

* explain architectural choices,
* justify trade-offs,
* analyze failures or limitations,
* present a clear architecture diagram.

Clear thinking matters more than perfect YAML.

---

## Final Note

Cloud native architecture is not about using *all* the tools.
It is about **choosing the right level of complexity for a given problem**.

Throughout this module, you will learn not only *how* to build distributed systems, but also **when not to**.
