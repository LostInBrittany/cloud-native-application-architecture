FROM node:24-alpine

WORKDIR /app

# Install deps
COPY package.json ./
RUN npm install

# Copy source
COPY server.js ./

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
