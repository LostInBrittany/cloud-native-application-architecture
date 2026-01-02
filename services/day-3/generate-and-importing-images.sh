docker build -t echo-service-with-delay:latest ./echo-service-with-delay
docker build -t log-service-with-service-dependencies:latest ./log-service-with-service-dependencies
docker build -t log-service-with-timeout:latest ./log-service-with-timeout

k3d image import echo-service-with-delay:latest -c day3
k3d image import log-service-with-service-dependencies:latest -c day3
k3d image import log-service-with-timeout:latest -c day3


docker build -t echo-service-with-tracing:latest ./echo-service-with-tracing
docker build -t log-service-with-tracing:latest ./log-service-with-tracing

k3d image import echo-service-with-tracing:latest -c day3
k3d image import log-service-with-tracing:latest -c day3


docker build -t echo-service-flaky:latest ./echo-service-flaky
docker build -t log-service-with-retries:latest ./log-service-with-retries

k3d image import echo-service-flaky:latest -c day3
k3d image import log-service-with-retries:latest -c day3

docker build -t log-service-with-metrics:latest ./log-service-with-metrics
docker build -t echo-service-with-metrics:latest ./echo-service-with-metrics

k3d image import log-service-with-metrics:latest -c day3
k3d image import echo-service-with-metrics:latest -c day3
