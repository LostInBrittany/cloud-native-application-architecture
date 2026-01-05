FROM node:24-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application code
COPY server.js ./

# Change ownership to node user
RUN chown -R node:node /app

# Run as non-root user
USER node

# Expose port
EXPOSE 8080

# Start the application
CMD ["node", "server.js"]
