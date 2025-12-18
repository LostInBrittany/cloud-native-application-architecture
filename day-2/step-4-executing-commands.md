# Step 4 – Executing Commands in Running Containers

![Executing commands](/img/day-2/04-executing-commands-01.jpg)
---
![Executing commands](/img/day-2/04-executing-commands-02.jpg)
---
![Executing commands](/img/day-2/04-executing-commands-03.jpg)
---

## Concept

Sometimes you need to:

* inspect a running container's environment
* debug unexpected behavior (e.g., "why can't I connect to the database?")
* verify that files exist where you expect them

Kubernetes allows this via `kubectl exec`, but remember: it is a **diagnostic tool**, not an operational workflow. If you are ssh-ing into containers to fix things, you are doing it wrong.

---

## Hands-on: Debugging `log-service`

We will use `kubectl exec` to inspect the `log-service` you just deployed.

First, get the Pod name:

```bash
kubectl get pods
```

Let's assume your pod is named `log-service-xxxxx`.

### 1. Verify Environment Variables

We set `LOG_LEVEL=info` in our Deployment. Let's verify it actually exists inside the running process.

```bash
kubectl exec <pod-name> -- env | grep LOG_LEVEL
```

You should see:
```text
LOG_LEVEL=info
```

If you don't see it, your application might be reading defaults instead of configuring itself correctly.

### 2. Verify Local Connectivity

Is the application actually listening on port 8080?
From *inside* the container, we can try to call it.

```bash
kubectl exec <pod-name> -- wget -qO- localhost:8080
```

*   `wget`: A simple command-line downloader (included in Alpine images).
*   `-qO-`: "Quiet" mode, print output to stdout.

You should see the JSON response from your service.
This proves that the **process is up and binding to the correct port**, ruling out network firewall issues.

### 3. Explore the Filesystem

Did our code actually get copied correctly?

```bash
kubectl exec <pod-name> -- ls -l /app
```

You should see `server.js` and `package.json`.

---

## Interactive Shell

Sometimes running single commands isn't enough. You can open an interactive shell:

```bash
kubectl exec -it <pod-name> -- sh
```

*   `-i`: Interactive (pass stdin)
*   `-t`: Allocate a TTY (terminal)

Inside the container, you are root (usually). Be careful!

```sh
# inside the container
ps aux
top
exit
```

---

## Key Takeaway

> `kubectl exec` allows you to verify **runtime reality** vs **deployment theory**.
