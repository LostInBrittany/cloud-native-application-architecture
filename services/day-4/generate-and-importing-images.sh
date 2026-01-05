#!/bin/bash

# Day 4 - Production Readiness & Security Hardening
# Build and import Docker images for Day 4 exercises

echo "Building Day 4 images..."

# Security Hardening (Step 1)
docker build -t echo-service-hardened:latest ./echo-service-hardened
docker build -t log-service-hardened:latest ./log-service-hardened
docker build -t compute-service:latest ./compute-service
docker build -t echo-service-slow-start:latest ./echo-service-slow-start
 
echo "Importing images to k3d cluster 'day4'..."

k3d image import echo-service-hardened:latest -c day4
k3d image import log-service-hardened:latest -c day4
k3d image import compute-service:latest -c day4
k3d image import echo-service-slow-start:latest -c day4

echo "✅ Day 4 images built and imported successfully!"
echo ""
echo "Available images:"
echo "  - echo-service-hardened:latest"
echo "  - log-service-hardened:latest"
echo "  - compute-service:latest"
echo "  - echo-service-slow-start:latest"
