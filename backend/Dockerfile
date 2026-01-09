FROM node:20-alpine

# Install postgresql-client for backup/restore
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Install dependencies for Prisma, development, and NTP
RUN apk add --no-cache openssl openntpd

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy prisma schema
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3012

# Development: Use nodemon for hot-reload (proven stable)
# For production with PM2 cluster, build first then use: npm run pm2:start
CMD ["npm", "run", "dev"]
