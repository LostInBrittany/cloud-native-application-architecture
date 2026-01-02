FROM node:24-alpine

WORKDIR /app

# Install deps first for better caching
COPY package.json ./
RUN npm install --omit=dev

# Copy sources
COPY server.js ./

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
