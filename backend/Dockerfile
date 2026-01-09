FROM node:20-alpine

# Install postgresql-client for backup/restore
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Install dependencies for Prisma, development, and NTP
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

# Create logs directory for PM2
RUN mkdir -p logs

# Expose port
EXPOSE 3012

# Use PM2 runtime for cluster mode (utilizes all CPU cores)
# This provides: auto-restart, load balancing, and graceful reload
CMD ["npm", "run", "pm2:dev"]
