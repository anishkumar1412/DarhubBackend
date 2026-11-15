FROM node:20-alpine

WORKDIR /usr/src/app

# Install dependencies needed for native builds or healthcheck
RUN apk add --no-cache bash

# Copy package descriptors
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Expose backend port
EXPOSE 5678

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5678/health || exit 1

# Run migrations and start server
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && npm start"]
