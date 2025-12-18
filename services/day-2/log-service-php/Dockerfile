FROM php:8.3-cli-alpine

WORKDIR /app

COPY index.php .

ENV PORT=8080
EXPOSE 8080

CMD ["php", "-S", "0.0.0.0:8080", "index.php"]
