docker build -t echo-service-with-delay:latest ./echo-service-with-delay
docker build -t log-service-with-timeout:latest ./log-service-with-timeout
docker build -t log-service-with-service-dependencies:latest ./log-service-with-service-dependencies

k3d image import echo-service-with-delay:latest -c day3
k3d image import log-service-with-timeout:latest -c day3
k3d image import log-service-with-service-dependencies:latest -c day3
