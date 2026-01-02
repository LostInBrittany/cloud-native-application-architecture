# Step 9 – Helm: The Package Manager for Kubernetes

## Concept

Imagine if to install `nginx` on Linux, you had to manually download the binary, create the systemd unit file, create the user, set up the log directory, and configure the firewall.
That's what using raw Kubernetes manifests feels like for complex applications.

**Helm** is the "apt" or "brew" of Kubernetes.

*   **Chart**: The package (like a `.deb` or `.rpm`). Contains all the YAML templates.
*   **Release**: An installed instance of a chart.
*   **Repository**: Where charts are stored.

---

## 0. Prerequisites

Ensure Helm is installed:

```bash
helm version
```

If not, please refer to the [official installation guide](https://helm.sh/docs/intro/install/).

For macOS users (using Homebrew):
```bash
brew install helm
```

---

## 1. Hands-on: Installing Redis

We want a production-ready Redis cluster. Writing the YAML for StatefulSets, PVCs, ConfigMaps, and Secrets would take hours.

Let's use the **Bitnami** chart.

> **What is Bitnami?**
> Bitnami is one of the most trusted sources for packaged applications. They maintain hundreds of ready-to-run containers and Helm charts.
>
> You can browse their available charts here: [https://github.com/bitnami/charts](https://github.com/bitnami/charts)
>
> We strongly encourage you to look at the **source code** of the chart we are about to use.
> Go to the [Redis chart folder](https://github.com/bitnami/charts/tree/main/bitnami/redis) and look at the `templates/` directory. You will see the familiar YAML files (StatefulSet, Service, ConfigMap) that we have been writing manually, but powered by the Go templating language.

1.  Add the repository:
    ```bash
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm repo update
    ```

2.  Search for Redis:
    ```bash
    helm search repo bitnami/redis
    ```

3.  Install it (create a Release named `my-db`):
    ```bash
    helm install my-db bitnami/redis
    ```

---

## 2. Hands-on: Connecting to Redis

Helm charts often include "NOTES" that tell you how to connect.
If you missed them, you can always run `helm get notes my-db`.

Let's follow the standard Bitnami instructions to connect.

### 2.1 Get the Password

The password was auto-generated and stored in a Secret. Let's retrieve it:

```bash
export REDIS_PASSWORD=$(kubectl get secret --namespace default my-db-redis -o jsonpath="{.data.redis-password}" | base64 -d)
```

(You can `echo $REDIS_PASSWORD` to see it if you are curious).

### 2.2 Launch a Client

We will run a temporary pod to act as a client, using the same image:

```bash
kubectl run --namespace default redis-client --restart='Never'  --env REDIS_PASSWORD=$REDIS_PASSWORD  --image registry-1.docker.io/bitnami/redis:latest --command -- sleep infinity
```

Wait for it to be ready:
```bash
kubectl wait --for=condition=ready pod/redis-client
```

### 2.3 Connect and Verify

Log into the client pod:

```bash
kubectl exec --tty -i redis-client -- bash
```

Now, inside the pod, connect using the CLI:

```bash
REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -h my-db-redis-master
```

You should see a prompt `my-db-redis-master:6379>`.
Try some commands:

```bash
SET mykey "Hello k3d"
GET mykey
quit
```

Exit the pod shell:
```bash
exit
```

---

## 3. Inspecting the Magic

Helm didn't just run a container. It deployed an **architecture**.

Look at what was created:

```bash
kubectl get all -l app.kubernetes.io/instance=my-db
```

You should see:
*   **StatefulSets** (not Deployments, because DBs need stable identity).
*   **Services** (Headless and ClusterIP).
*   **Secrets** (Auto-generated passwords).

---

## 4. Customizing the Release

We don't want to use defaults forever.
Helm allows customization via **values**.

1.  See default values:
    ```bash
    helm show values bitnami/redis > default-values.yaml
    ```
    (Open this file. It's huge. These are all the knobs you can turn).

2.  Upgrade the release to disable persistence (for example, to save disk space on our local cluster):

    ```bash
    helm upgrade my-db bitnami/redis \
      --set master.persistence.enabled=false \
      --set replica.persistence.enabled=false
    ```

    Helm calculates the diff and patches the Kubernetes objects.

---

## 5. Templating (Under the Hood)

Is Helm magic? No. It's a text rendering engine.
Run this to see exactly what Helm submits to the cluster:

```bash
helm template my-db bitnami/redis --set master.persistence.enabled=false
```

You will see pure YAML. **This is what you learned all morning.**
Helm just automates the copy-paste-replace for you.

---

## 6. Cleanup

Uninstall the release:

```bash
helm uninstall my-db
```

Everything disappears.

