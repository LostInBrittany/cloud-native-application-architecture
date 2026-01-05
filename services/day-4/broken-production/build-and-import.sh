#!/bin/bash
set -e

# Accept cluster name as first argument, default to "day4"
CLUSTER_NAME="${1:-day4}"

echo "🔨 Building broken production services for cluster '$CLUSTER_NAME'..."

# List of services to build
SERVICES=("gateway" "api-service" "auth-service" "order-service" "database-service" "notification-service")

for SERVICE in "${SERVICES[@]}"; do
  echo "📦 Building $SERVICE..."
  docker build -t $SERVICE:latest services/day-4/broken-production/$SERVICE
done

echo "🏷️  Tagging notification-service with wrong tag (for the bug)..."
# The manifest expects v2.0, but we only have latest building successfully
# Wait, the bug is that the manifest ASKS for v2.0 but it DOES NOT EXIST.
# So we should NOT tag v2.0. We just import :latest. 
# Students must fix the manifest to use :latest.

echo "🚀 Importing images into k3d cluster '$CLUSTER_NAME'..."
for SERVICE in "${SERVICES[@]}"; do
  echo "   Importing $SERVICE..."
  k3d image import $SERVICE:latest -c $CLUSTER_NAME
done

echo "✅ All broken services built and imported!"
echo "   Now deployed the broken manifests: kubectl apply -f k8s/day-4/broken-production/"
