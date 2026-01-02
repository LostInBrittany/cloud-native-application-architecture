# Local Environment Setup (Important)

Before moving forward, we must ensure that **everyone has a working local environment**.
All the following steps are prerequisites for the rest of the module.

⚠️ **Do not skip this section.**
Small issues here will become major blockers later.

---

## 1. Container Runtime

You need a **working container runtime**.

Supported options:

* **Docker Desktop** (recommended on macOS / Windows)
* **Docker Engine** (Linux)
* **Podman** (advanced users only)

### Verify installation

Run:

```bash
docker version
```

You should see:

* a client version
* a server version

If Docker is installed but **not running**, start it now.

If this command fails:

* fix it **before continuing**
* ask for help if needed

---

## 2. `kubectl` (Kubernetes CLI)

`kubectl` is the command-line tool used to interact with Kubernetes clusters.

### Verify installation

```bash
kubectl version --client
```

Expected result:

* a client version is displayed
* no error message

If `kubectl` is missing, install it using the **official Kubernetes documentation**:

👉 [https://kubernetes.io/docs/tasks/tools/](https://kubernetes.io/docs/tasks/tools/)

> Do **not** install Kubernetes itself manually.
> We will use `kind` to create and manage the cluster.

---

## 3. `kind` (Kubernetes IN Docker)

We use **kind** to run Kubernetes locally inside containers.

Why `kind`:

* fast startup
* reproducible clusters
* close to real Kubernetes behavior
* well suited for local development and teaching

### Verify installation

```bash
kind version
```

If the command is not found, install `kind` following the **official documentation**:

👉 [https://kind.sigs.k8s.io/docs/user/quick-start/](https://kind.sigs.k8s.io/docs/user/quick-start/)

Choose the installation method appropriate for your operating system.

After installation, verify again:

```bash
kind version
```

---

## 4. Creating the Local Kubernetes Cluster

Each student will run **their own local Kubernetes cluster**.

We will use a **simple, default cluster configuration**.

Create the cluster:

```bash
kind create cluster
```

⏳ This may take a few minutes.

---

## 5. Verify the Cluster Is Working

Run:

```bash
kubectl get nodes
```

Expected result:

* one node
* status `Ready`

Example:

```text
NAME                 STATUS   ROLES           AGE   VERSION
kind-control-plane   Ready    control-plane   1m    v1.xx.x
```

If the node is **not Ready**:

* stop here
* do not proceed
* ask for help

---

## 6. Common Problems (Read This)

Some issues are **very common**:

* Docker is installed but not running
* Docker does not have enough memory allocated
* A VPN interferes with networking
* An old or broken Kubernetes configuration exists in `~/.kube/config`

If something behaves strangely:

* do **not** randomly reinstall everything
* read the error message carefully
* you may use an LLM to help *understand* the error, but remain in control of the fix

---

## 7. Final Checkpoint (Mandatory)

Before continuing, you must be able to run **all three commands successfully**:

```bash
docker version
kubectl get nodes
kind version
```

If any of these fail:

* stop
* fix the issue
* ask for help

Cloud native systems assume unstable environments.
Your local setup must not be one of them.

> This setup step is intentionally boring and sometimes frustrating. This is what real cloud-native work looks like before the fun begins.
