# Step 1 – Containers as Immutable Artifacts

## Objectives

In this step, you will:

* Build and run a **containerized application**
* Understand the difference between an **image** and a **container**
* Discover why **immutability** is a core cloud native principle
* Observe how configuration is injected **at runtime**, not baked into the image

This step deliberately avoids business complexity.
The goal is to understand **how applications are packaged and executed** in cloud native environments.

---

## Context

In cloud native architectures:

* Applications are **built once**
* Deployed **many times**
* Run in **multiple environments**
* Replaced rather than modified

This is only possible if application artifacts are **immutable**.

Containers are not interesting because they are “lightweight VMs”.
They are interesting because they allow us to treat applications as **immutable artifacts**.

---

## The Application: `echo-service`

For this module, we use a very small HTTP service called **`echo-service`**. You can find it in the `services/echo-service` directory.

It exposes a few endpoints:

* `GET /healthz`
  Basic health endpoint (used later for Kubernetes probes)

* `GET /info`
  Returns runtime information (hostname, PID, uptime, Node.js version)

* `GET /config`
  Returns a *safe* subset of configuration values

* `POST /echo`
  Returns the request body with metadata

This service is intentionally simple, but it already demonstrates:

* ephemeral instances
* runtime configuration
* reproducibility

---

## Step 1.1 – Inspect the Service

Go to the service directory:

```bash
cd services/day-1/echo-service
```

You should see:

* `server.js` – the application code
* `package.json` – Node.js dependencies
* `Dockerfile` – instructions to build the container image

👉 Take a few minutes to **read the Dockerfile**.

Questions to ask yourself:

* What base image is used?
* When are dependencies installed?
* What files are copied into the image?
* What command starts the application?

Do not rush this step.

---

## Step 1.2 – Build the Container Image

Build the image locally:

```bash
docker build -t echo-service:dev .
```

What happens here:

* Docker reads the `Dockerfile`
* It produces a **container image**
* This image is a **static artifact**

Important:

> Once built, this image will **never change**.
> Any change requires building a **new image**.

---

## Step 1.3 – Run the Container Locally

Run the container:

```bash
docker run --rm -p 8080:8080 \
  -e APP_NAME=echo-service \
  -e APP_VERSION=dev \
  -e FEATURE_FLAG_X=off \
  echo-service:dev
```

What this does:

* Starts a container **from the image**
* Injects configuration via **environment variables**
* Exposes port `8080` to your local machine

---

## Step 1.4 – Test the Service

In another terminal, test the endpoints:

```bash
curl http://localhost:8080/healthz
```

```bash
curl http://localhost:8080/info
```

```bash
curl http://localhost:8080/config
```

```bash
curl -X POST http://localhost:8080/echo \
  -H "Content-Type: application/json" \
  -d '{"hello":"world"}'
```

Observe carefully:

* `/info` returns runtime-specific data (hostname, PID)
* `/config` reflects values passed at startup
* The container has **no memory** of previous runs

---

## Step 1.5 – Stop and Restart the Container

Stop the container (`Ctrl+C`) and run it again.

Then call `/info` again.

Ask yourself:

* Did the hostname change?
* Did the PID change?
* Did the application “remember” anything?

This is **expected behavior**.

---

## Key Concepts Illustrated

This step demonstrates several fundamental cloud native ideas:

### Image vs Container

* **Image**: immutable, built once
* **Container**: a running instance of an image

You can run:

* one image
* as many containers
* as many times as needed

### Immutability

You never:

* “patch” a running container
* log into it to fix things
* modify files inside it

You:

* rebuild the image
* redeploy

---

### Configuration Outside the Image

Configuration is provided at runtime via:

* environment variables
* (later) ConfigMaps and Secrets

The image itself remains unchanged.

---

### Things to Pay Attention To

* Logs are written to **standard output**
* Stopping the container destroys it completely
* Restarting creates a **new instance**
* The filesystem inside the container is ephemeral

If this feels uncomfortable, that’s normal.
Cloud native systems trade comfort for predictability.

---

## End of Step Checkpoint

Before moving on, make sure you can explain:

* The difference between an image and a container
* Why immutability matters
* Why configuration should not be baked into the image
* Why restarting a container is not a problem

If you cannot explain it, ask questions **now**.

---

## Reflection (2–3 minutes)

Answer briefly:

* What would break if we ran **five containers** of this image?
* What would happen if we tried to store data in the container filesystem?
* Why is this model better suited for automation?

We will reuse this same service in the next steps — **without changing the code**.
