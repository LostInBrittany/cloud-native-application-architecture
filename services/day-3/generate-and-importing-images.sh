#!/bin/bash

# Day 3 - Observability & Tracing
# Build and import Docker images for Day 3 exercises

echo "Building Day 3 images..."

# Service Dependencies & Timeouts (Steps 1-3)
docker build -t echo-service-with-delay:latest ./echo-service-with-delay
docker build -t log-service-with-service-dependencies:latest ./log-service-with-service-dependencies
docker build -t log-service-with-timeout:latest ./log-service-with-timeout

# Distributed Tracing (Steps 4-5)
docker build -t echo-service-with-tracing:latest ./echo-service-with-tracing
docker build -t log-service-with-tracing:latest ./log-service-with-tracing

# Retries & Circuit Breaking (Step 6)
docker build -t echo-service-flaky:latest ./echo-service-flaky
docker build -t log-service-with-retries:latest ./log-service-with-retries

# Prometheus Metrics (Step 7)
docker build -t log-service-with-metrics:latest ./log-service-with-metrics
docker build -t echo-service-with-metrics:latest ./echo-service-with-metrics

# OpenTelemetry (Step 8)
docker build -t log-service-with-otel:latest ./log-service-with-otel
docker build -t echo-service-with-otel:latest ./echo-service-with-otel

echo "Importing images to k3d cluster 'day3'..."

k3d image import echo-service-with-delay:latest -c day3
k3d image import log-service-with-service-dependencies:latest -c day3
k3d image import log-service-with-timeout:latest -c day3
k3d image import echo-service-with-tracing:latest -c day3
k3d image import log-service-with-tracing:latest -c day3
k3d image import echo-service-flaky:latest -c day3
k3d image import log-service-with-retries:latest -c day3
k3d image import log-service-with-metrics:latest -c day3
k3d image import echo-service-with-metrics:latest -c day3
k3d image import log-service-with-otel:latest -c day3
k3d image import echo-service-with-otel:latest -c day3

echo "✅ Day 3 images built and imported successfully!"
echo ""
echo "Available images:"
echo "  - echo-service-with-delay:latest"
echo "  - log-service-with-service-dependencies:latest"
echo "  - log-service-with-timeout:latest"
echo "  - echo-service-with-tracing:latest"
echo "  - log-service-with-tracing:latest"
echo "  - echo-service-flaky:latest"
echo "  - log-service-with-retries:latest"
echo "  - log-service-with-metrics:latest"
echo "  - echo-service-with-metrics:latest"
echo "  - log-service-with-otel:latest"
echo "  - echo-service-with-otel:latest"
