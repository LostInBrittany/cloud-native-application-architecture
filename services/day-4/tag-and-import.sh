#!/bin/bash
# Tag and import compute-service for multi-environment demo

IMAGE_NAME="compute-service"

echo "Building ${IMAGE_NAME}..."
docker build -t ${IMAGE_NAME}:latest ./compute-service

echo ""
echo "Creating environment-specific tags..."
docker tag ${IMAGE_NAME}:latest ${IMAGE_NAME}:dev-latest
docker tag ${IMAGE_NAME}:latest ${IMAGE_NAME}:v1.2.3-rc1  # staging
docker tag ${IMAGE_NAME}:latest ${IMAGE_NAME}:v1.2.2      # production

echo ""
echo "Importing to k3d cluster..."
k3d image import ${IMAGE_NAME}:dev-latest -c day4
k3d image import ${IMAGE_NAME}:v1.2.3-rc1 -c day4
k3d image import ${IMAGE_NAME}:v1.2.2 -c day4

echo ""
echo "✅ Images tagged and imported:"
echo "  - ${IMAGE_NAME}:dev-latest (for dev)"
echo "  - ${IMAGE_NAME}:v1.2.3-rc1 (for staging)"
echo "  - ${IMAGE_NAME}:v1.2.2 (for production)"
echo ""
echo "These tags demonstrate:"
echo "  • Dev uses 'latest' tags (rapid iteration)"
echo "  • Staging uses release candidates (v1.2.3-rc1)"
echo "  • Production uses stable versions (v1.2.2)"
