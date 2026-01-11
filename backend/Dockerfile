FROM node:20-alpine

# Install postgresql-client for backup/restore
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Install dependencies for Prisma and NTP
RUN apk add --no-cache openssl openntpd

# Copy package files
COPY package*.json ./

# Install dependencies (includes PM2)
RUN npm install

# Copy prisma schema
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript to JavaScript (required for PM2 cluster mode)
RUN npm run build

# Create logs directory for PM2
RUN mkdir -p logs dist

# Expose port
EXPOSE 3012

# Production: Use PM2 cluster mode for multi-core scaling
# PM2 provides: auto-restart, load balancing, graceful reload, logging
CMD ["npm", "run", "pm2:start"]
