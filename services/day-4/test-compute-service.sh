#!/bin/bash
# Test script for compute-service

echo "=== Testing compute-service ==="

# 1. Build the image
echo "Building Docker image..."
docker build -t compute-service:latest services/day-4/compute-service

# 2. Import to k3d
echo "Importing to k3d cluster..."
k3d image import compute-service:latest -c day3

# 3. Create namespace if it doesn't exist
echo "Creating production namespace..."
kubectl create namespace production --dry-run=client -o yaml | kubectl apply -f -

# 4. Deploy
echo "Deploying compute-service..."
kubectl apply -f k8s/day-4/compute-service.yaml

# 5. Wait for pod to be ready
echo "Waiting for pod to be ready..."
kubectl wait --for=condition=ready pod -l app=compute-service -n production --timeout=60s

# 6. Test health endpoint (internal cluster DNS)
echo ""
echo "Testing /health endpoint (internal cluster DNS)..."
kubectl run test-pod --image=curlimages/curl -n production --rm -it --restart=Never -- \
  curl -s http://compute-service:8080/health

# 7. Test via Ingress (external access)
echo ""
echo "Testing /compute via Ingress (external access - light load)..."
curl -s "http://production.localhost/compute?work=10"

echo ""
echo "Testing /compute via Ingress (external access - heavy load)..."
curl -s "http://production.localhost/compute?work=100"

# 8. Test internal cluster DNS (from within a pod)
echo ""
echo "Testing /compute via internal DNS (from within cluster)..."
kubectl run test-pod --image=curlimages/curl -n production --rm -it --restart=Never -- \
  curl -s "http://compute-service:8080/compute?work=50"

# 9. Check resource usage
echo ""
echo "Checking resource usage..."
kubectl top pod -n production -l app=compute-service

echo ""
echo "=== Test complete ==="
echo "To generate load for HPA testing, run:"
echo "  kubectl run load-generator --image=busybox -n production --restart=Never -- /bin/sh -c 'while true; do wget -q -O- http://compute-service:8080/compute?work=200; done'"
