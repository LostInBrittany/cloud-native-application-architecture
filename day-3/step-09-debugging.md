# Step 9 – Debugging Distributed Applications

## "It works on my machine"

One of the most frustrating phrases in software engineering. But in Kubernetes, it's even more complex because "your machine" is actually:
- A container image (immutable)
- Running in a Pod (ephemeral)
- On a Node (you don't control)
- Talking to other services (over a network you don't see)
- Using config from ConfigMaps/Secrets (external to the container)

When something breaks in Kubernetes, the failure could be at any of these layers:

1.  **Code**: Does the application logic work?
2.  **Container**: Does the image have the right files? Dependencies installed?
3.  **Pod**: Is it running? Scheduled? Restarting?
4.  **Network**: Can it reach other services? DNS working? Ports correct?
5.  **Configuration**: Are environment variables set correctly? Secrets mounted?
6.  **Resources**: Does it have enough CPU/memory? Is it being throttled or killed?

This is why systematic debugging is critical.

---

## The Debugging Workflow

When (not if) a service fails, follow this systematic approach:

### 1. Check Pod Status (The Overview)

Start with the big picture:

```bash
kubectl get pods
```

Look for pod states:
- **Pending**: Can't be scheduled (resource constraints? node selector issues?)
- **ContainerCreating**: Pulling image or mounting volumes
- **CrashLoopBackOff**: Container starts then crashes repeatedly
- **Running**: Seems OK, but might still have issues
- **Error** or **Unknown**: Something went very wrong

**Check the RESTARTS column**: If it's increasing, the pod is crashing repeatedly.

---

### 2. Check Logs (What Happened?)

Logs are your first line of investigation:

```bash
# Current logs
kubectl logs my-pod

# Logs from previous crash (if pod restarted)
kubectl logs my-pod -p

# Follow logs in real-time
kubectl logs my-pod -f

# Logs from a specific container (if pod has multiple)
kubectl logs my-pod -c container-name
```

**What to look for:**
- Stack traces
- Error messages
- "Connection refused" (network issue)
- "Cannot find module" (missing dependency)
- "EADDRINUSE" (port already in use)
- Environment variable errors

---

### 3. Check Details (The Events)

`describe` gives you Kubernetes' perspective on what happened:

```bash
kubectl describe pod my-pod
```

**Scroll to the bottom** and look at "Events":
- `BackOff`: Container crashed, Kubernetes is backing off restarts
- `OOMKilled`: Out of memory - container used more memory than its limit
- `Failed to pull image`: Wrong image name/tag, or authentication issue
- `Liveness probe failed`: Health check failed
- `Readiness probe failed`: Service not ready for traffic
- `FailedMount`: ConfigMap/Secret doesn't exist

---

### 4. Check Service Connectivity (Network Layer)

If the pod is running but you can't reach it:

```bash
# Check if the Service has endpoints
kubectl get endpoints my-service

# Should show IPs. If empty, selector mismatch!
```

**Bypass the Service** and test the pod directly:

```bash
kubectl port-forward my-pod 8080:8080
# Now test: curl localhost:8080
```

If this works but the Service doesn't, the issue is in the Service configuration (selector, ports, etc.).

---

### 5. Go Inside the Container (Interactive Debugging)

Execute commands inside the running container:

```bash
kubectl exec -it my-pod -- /bin/sh

# Now you're inside! Try:
# - Check environment variables:
env

# - Test network connectivity:
curl other-service:8080

# - DNS resolution:
nslookup other-service

# - Check files:
ls -la /app

# - Check process:
ps aux
```

---

### 6. Ephemeral Debug Containers (Advanced)

If your container has no shell (distroless, scratch-based images):

```bash
kubectl debug -it my-pod --image=curlimages/curl --target=my-container
```

This starts a debug container with tools (curl, sh, etc.) in the same namespace and network as your container.

---

### 7. Use Observability Tools (From Previous Steps)

Don't forget the observability stack you built!

**Check Metrics in Prometheus:**
```bash
# Is CPU/memory usage high?
# Are requests failing?
# Is response time increasing?
```

**Check Logs in Loki/Grafana:**
```bash
# Search for error messages across all pods
# Filter by pod name, namespace, or time range
```

**Check Traces in Tempo:**
```bash
# Which service is slow?
# Where are requests failing?
# Is a dependency down?
```

These tools often reveal issues faster than kubectl alone!

---

## The "Break and Fix" Challenge

I have prepared a broken application manifest. Your job is to **deploy it, debug it, and fix it** using the debugging workflow above.

This exercise will test your understanding of:
- Pod lifecycle and states
- Health probes (from Day 2)
- Service selectors and endpoints
- Resource constraints
- Configuration management

---

### Task 1: Deploy the Broken App

```bash
kubectl apply -f k8s/day-3/broken-app.yaml
```

Wait 30 seconds, then observe the system.

---

### Task 2: Investigate (The Challenge)

Use the debugging workflow to identify and document **all issues**. There are multiple problems!

**Questions to answer:**

1.  **What is the pod status?**
    ```bash
    kubectl get pods -l app=echo-broken
    ```
    Is it Running? Pending? CrashLoopBackOff?

2.  **Why is the Pod restarting?**
    - Hint: Check `kubectl describe pod ...` and look at "Events"
    - Is the Liveness Probe failing? **Why is it failing?**

3.  **Can you reach the Service?**
    ```bash
    kubectl run debug-pod --image=curlimages/curl -it --restart=Never -- curl http://echo-broken
    ```
    If this fails or times out, investigate:
    - Check `kubectl get endpoints echo-broken` - are there any IPs?
    - If no endpoints, why? (Hint: selectors and labels)

4.  **Are there any configuration issues?**
    - Check the pod's environment variables
    - Are all required configs present?

---

### Task 3: Fix All Issues

1.  **Document each issue** you found (write them down!)
2.  **Edit** `k8s/day-3/broken-app.yaml` to fix all errors
3.  **Apply** the fixes:
    ```bash
    kubectl apply -f k8s/day-3/broken-app.yaml
    ```
4.  **Wait** for the pod to stabilize (no restarts for 30 seconds)
5.  **Verify** it works:
    ```bash
    # Test the service
    kubectl run debug-pod --image=curlimages/curl -it --restart=Never -- curl http://echo-broken

    # Should return JSON response, not an error!
    ```

---

### Task 4: Bonus - Use Observability Tools

After fixing the app, practice using your observability stack:

1.  **Check Metrics**:
    ```bash
    kubectl port-forward svc/echo-broken 8080:80
    # Visit http://localhost:8080/metrics in your browser
    ```
    Are Prometheus metrics being exposed?

2.  **Generate Load and Check Traces**:
    ```bash
    # Generate some requests
    for i in {1..10}; do curl http://localhost:8080; sleep 1; done
    ```
    - Go to Grafana → Tempo
    - Search for traces from `echo-broken` service
    - Do they appear? Why or why not?

3.  **Check Logs**:
    ```bash
    kubectl logs -l app=echo-broken --tail=50
    ```
    Are the logs structured (JSON)? Do they contain useful context?

---

### Expected Issues (Don't Read Until You've Tried!)

<details>
<summary>Click to reveal the issues after you've attempted debugging</summary>

The broken-app.yaml contains the following issues:

1. **Liveness Probe Port Mismatch**: The probe checks port 80, but the app listens on 8080
2. **Service Selector Typo**: The Service selector is `app: echo-app` but the Pod label is `app: echo-broken`

**Why these matter:**
- Wrong liveness probe port → Probe fails → Pod restarts continuously
- Wrong selector → Service has no endpoints → Requests timeout

</details>

---

### Reflection

After completing this challenge, consider:

- Which debugging technique was most useful?
- How did you identify the root cause vs. symptoms?
- If this were production, what would you do differently?
- How could observability tools have helped you debug faster?

---

**Note**: This is a warmup. Day 4 will have a more comprehensive debugging challenge that integrates everything you've learned!

---

[Next: Day 3 Summary](./step-10-summary.md)
