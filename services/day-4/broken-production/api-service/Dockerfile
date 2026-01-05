FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY server.js ./

# Run as non-root user
USER node

EXPOSE 3000

CMD ["node", "server.js"]
