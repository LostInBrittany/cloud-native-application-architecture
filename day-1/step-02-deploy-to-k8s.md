# Step 2 – Deploying `echo-service` to Kubernetes

## Objectives

In this step, you will:

* Run the **exact same container image** as a Kubernetes workload
* Understand the role of:

  * **Pods** (where containers run)
  * **Deployments** (desired state + self-healing)
  * **Services** (stable networking)
* Learn the basic workflow to **inspect and debug** a Kubernetes deployment

We still keep the system simple: one service, one replica, no database.

---

## What We Are Doing

So far, you ran `echo-service` with `docker run`.

Now we run it **inside Kubernetes**. The application does not change — only the execution environment changes.

Important mental model:

* You do **not** manage containers directly anymore
* You declare what you want
* Kubernetes continuously tries to make reality match your **desired state**

---

## Step 2.1 – Ensure the Image Is Available to `kind`

When using `kind`, Kubernetes runs inside Docker.
Your cluster will **not automatically see images** you built locally unless you:

* push them to a registry, or
* load them into the cluster

For Day 1, we use the simplest option: **load the image into kind**.

From the `services/echo-service` directory (or from repo root), make sure you have built the image:

```bash
docker images | head
```

You should see `echo-service:dev`.

Load the image into `kind`:

```bash
kind load docker-image echo-service:dev
```

If you rebuilt the image after creating the cluster, re-run `kind load docker-image ...` (kind does not auto-sync local builds).

✅ Checkpoint: this command completes without errors.

---

## Step 2.2 – Apply the Kubernetes Manifest

We provide a Kubernetes manifest for Day 1.

From the repository root:

```bash
kubectl apply -f k8s/day-1/echo-service.yaml
```

What this typically creates:

* A **Deployment** for `echo-service`
* A **Service** to expose it inside the cluster

---

## Step 2.3 – Verify That It’s Running

Check Pods:

```bash
kubectl get pods
```

You should see something like:

* `echo-service-...` in `Running`

If it’s not running, check what is happening:

```bash
kubectl describe pod <pod-name>
```

Check Deployments:

```bash
kubectl get deployments
```

Check Services:

```bash
kubectl get services
```

✅ Checkpoint: you have:

* 1 Deployment
* 1 Pod running
* 1 Service created

```bash
kubectl get all -l app=echo-service
```

---

## Step 2.4 – Access the Service

Inside Kubernetes, services are reachable **inside the cluster network**.
To access it from your laptop, we use **port-forwarding** (simple and reliable for local learning).

Run:

```bash
kubectl port-forward service/echo-service 8080:8080
```

Keep that terminal open.

Now test from another terminal:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/info
curl http://localhost:8080/config
curl -X POST http://localhost:8080/echo \
  -H "Content-Type: application/json" \
  -d '{"hello":"kubernetes"}'
```

### What to observe

Run `/info` multiple times.

You should see:

* a hostname that looks like a Pod name
* runtime values that come from inside the cluster

This is your first “distributed system feeling”:

> You are no longer interacting with “your machine”, but with a managed runtime.

✅ Checkpoint: you can call `/info` and `/echo` through port-forward.

---

## Step 2.5 – Debug Like an Engineer

### View logs

```bash
kubectl logs deployment/echo-service
```

or, to follow logs:

```bash
kubectl logs -f deployment/echo-service
```

Logs should include the startup message from the service.

### Exec into the running container (optional)

Find the pod name:

```bash
kubectl get pods
```

Then:

```bash
kubectl exec -it <pod-name> -- sh
```

Inside the container, you can explore (this is mostly for learning/debugging):

```sh
env | sort
ls -la
exit
```

Important warning:

> You can inspect containers, but you should **not rely** on manual changes inside them.
> Any change here is ephemeral and will be lost.

---

## Step 2.6 – Prove Self-Healing (The “Aha” Moment)

Kubernetes keeps the Deployment running.
Let’s test that.

Delete the running Pod:

```bash
kubectl delete pod -l app=echo-service
```

Immediately check Pods:

```bash
kubectl get pods -w
```

What you should see:

* the old Pod disappears
* a new Pod is created automatically

Now re-run `/info` (your port-forward may need to be restarted if the Pod changed).

This demonstrates the most important Kubernetes idea:

> You manage **desired state**.
> Kubernetes manages **actual state**.

If port-forward stops responding after the Pod was recreated, stop it and run the command again.

✅ Checkpoint: you successfully deleted a Pod and Kubernetes recreated it.

---

## Things to Pay Attention To

* **Pods are disposable**: Kubernetes will replace them without asking
* **You should not depend on Pod identity**

  * hostnames change
  * IP addresses change
* **The container filesystem is ephemeral**
* **Logs go to stdout/stderr**

  * you retrieve them with `kubectl logs`
* **Images are immutable**

  * if you change code, you must rebuild the image and reload it into kind

If this feels uncomfortable, that’s expected.
Cloud native systems are opinionated — and they force better habits.

---

## End of Step Checkpoint

Before moving on, make sure you can explain:

* Why Kubernetes needs a **Deployment** (not just “run a container”)
* Why a **Service** exists (stable networking)
* What happens when a Pod is deleted
* Why `kind load docker-image` is needed in a local cluster workflow

---




### Optional Explorations (Time Permitting)

These steps are **optional** and meant for exploration and discussion.
If you are short on time, skip them without regret.

---

### Optional Step A – Scaling the Application (Replicas)

#### Goal

Observe what happens when the **same application** runs multiple times at once.

This reinforces:

* statelessness
* horizontal scalability
* ephemerality of instances

---

#### Step A.1 – Increase the Number of Replicas

Scale the Deployment to 3 replicas:

```bash
kubectl scale deployment echo-service --replicas=3
```

Watch what happens:

```bash
kubectl get pods -w
```

You should see:

* new Pods being created
* all Pods eventually reaching `Running`

---

#### Step A.2 – Call the Service Repeatedly

If your port-forward is still running, reuse it.
Otherwise:

```bash
kubectl port-forward service/echo-service 8080:8080
```

Now call `/info` several times:

```bash
curl http://localhost:8080/info
```

Repeat the command multiple times.

#### What to Observe

Look at:

* `hostname`
* `pid`

You should notice:

* different hostnames across requests
* the service responding from **different Pods**

This is your first concrete experience of **horizontal scaling**.

---

#### Discussion Prompt

Ask yourself:

* Why does this work without changing the code?
* What would break if the application stored state in memory?
* Why is this different from running 3 processes on the same machine?

---

### Optional Step B – Load Balancing Inside Kubernetes

#### Goal

Understand **where load balancing actually happens**.

Many people assume Kubernetes uses a “big load balancer”.
That’s not exactly true.

---

#### Step B.1 – Inspect the Service

Describe the Service:

```bash
kubectl describe service echo-service
```

Look at:

* the selector
* the list of endpoints

Then list endpoints directly:

```bash
kubectl get endpoints echo-service
```

You should see:

* multiple IP addresses
* one per Pod

---

#### Step B.2 – How Requests Are Distributed

When you access the service:

* requests go to the **Service IP**
* Kubernetes forwards them to **any matching Pod**

Important idea:

> Kubernetes load balancing is **simple and stateless** by default.

There is:

* no session affinity (unless configured)
* no application-level awareness

---

#### Optional Experiment (Advanced Curiosity)

In one terminal, follow logs:

```bash
kubectl logs -f deployment/echo-service
```

In another terminal, repeatedly call:

```bash
curl http://localhost:8080/info
```

Watch how:

* requests appear in logs from different Pods

---

### Optional Step C – Killing Pods While Serving Traffic

#### Goal

Demonstrate resilience **without special tooling**.

---

#### Step C.1 – Delete a Pod While Making Requests

In one terminal:

```bash
kubectl get pods
```

Pick one Pod and delete it:

```bash
kubectl delete pod <pod-name>
```

At the same time, continue calling:

```bash
curl http://localhost:8080/info
```

#### What to Observe

* Requests continue to succeed
* A new Pod is created automatically
* The Service keeps routing traffic

This demonstrates:

* self-healing
* decoupling between clients and instances

---

### Key Takeaways from Optional Steps

These experiments demonstrate that:

* Applications must be **stateless**
* Instances are **replaceable**
* Scaling does not require code changes
* Load balancing is **infrastructure-driven**
* Kubernetes enforces cloud native assumptions

If any of these points feel surprising, that’s a good sign.
