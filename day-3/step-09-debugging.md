# Step 7 – Debugging Challenge

## "It works on my machine"

In Kubernetes, checking why something is broken involves checking many layers:
1.  **Code**: Does it run?
2.  **Container**: Does it have the right files?
3.  **Pod**: Is it running? Scheduled?
4.  **Network**: Can it reach others? DNS?
5.  **Config**: Are ENV vars correct?

## The Debugging Workflow

When (not if) a service fails:

### 1. Check Functionality
```bash
kubectl get pods
# Is it Pending? CrashLoopBackOff? Running?
```

### 2. Check Logs
```bash
kubectl logs my-pod
kubectl logs my-pod -p  # Check Previous crash logs
```

### 3. Check Details
```bash
kubectl describe pod my-pod
# Look at "Events" at the bottom.
# "BackOff", "OOMKilled", "MountFailed"?
```

### 4. Go Inside (Port Forward)
```bash
kubectl port-forward my-pod 8080:8080
# Now curl 127.0.0.1:8080 to test directly bypassing Ingress/Service.
```

### 5. Go Inside (Shell)
```bash
kubectl exec -it my-pod -- /bin/sh
# curl other-service:8080
# nslookup other-service
# env
```

### 6. Ephemeral Debug Containers (Advanced)
If your container has no shell (distroless):
```bash
kubectl debug -it my-pod --image=curlimages/curl --target=my-container
```

## The "Break and Fix" Challenge

I have deployed a broken application in the `break-me` namespace.
Find out why it fails.

**Hint**: It involves a missing environment variable, a wrong port, and a typo in the service name.

---

[Next: Conclusion](./step-8-summary.md)
