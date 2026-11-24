# syntax=docker/dockerfile:1
FROM node:20-alpine

# Runtime tools:
# - postgresql-client: pg_dump/psql for backup & restore (server.service.ts)
# - openssl: Prisma engine needs libssl
# - openntpd: provides ntpd for NTP daemon mode (not used directly; HTTP fallback is preferred)
# - busybox-extras: provides sntp client for time.service.ts NTP query fallback
#
# The Alpine CDN has returned "TLS: unspecified error" on the deploy host,
# failing the build before anything else compiled. Retry, then fall back to
# alternate mirrors, before giving up.
RUN set -eu; \
    missing="postgresql-client openssl openntpd busybox-extras"; \
    for mirror in "" mirror.leaseweb.com ftp.halifax.rwth-aachen.de; do \
        if [ -z "$mirror" ]; then \
            repo=/etc/apk/repositories; \
        else \
            sed "s|dl-cdn.alpinelinux.org|$mirror|" /etc/apk/repositories > /tmp/repositories; \
            repo=/tmp/repositories; \
        fi; \
        if apk add --no-cache --repositories-file "$repo" $missing; then \
            [ -z "$mirror" ] || cp /tmp/repositories /etc/apk/repositories; \
            exit 0; \
        fi; \
        echo "apk failed via ${mirror:-default CDN}, trying next mirror"; \
        sleep 5; \
    done; \
    exit 1

# Copy package files
COPY package*.json ./

# Configure npm for faster retries (30s timeout, 3 retries)
RUN npm config set fetch-retry-maxtimeout 30000 \
    && npm config set fetch-retries 3

# Install dependencies with cache mount (speeds up rebuilds)
RUN --mount=type=cache,target=/root/.npm \
    npm install

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
