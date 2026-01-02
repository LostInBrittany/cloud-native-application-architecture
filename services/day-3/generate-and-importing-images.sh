docker build -t echo-service-with-delay:latest ./echo-service-with-delay
docker build -t log-service-with-timeout:latest ./log-service-with-timeout
docker build -t log-service-with-service-dependencies:latest ./log-service-with-service-dependencies
docker build -t echo-service-with-tracing:latest ./echo-service-with-tracing
docker build -t log-service-with-tracing:latest ./log-service-with-tracing

k3d image import echo-service-with-delay:latest -c day3
k3d image import log-service-with-timeout:latest -c day3
k3d image import log-service-with-service-dependencies:latest -c day3
k3d image import echo-service-with-tracing:latest -c day3
k3d image import log-service-with-tracing:latest -c day3
