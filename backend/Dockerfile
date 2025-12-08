FROM node:20-alpine

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

# Expose port
EXPOSE 3012

# Start with nodemon for hot-reload
CMD ["npm", "run", "dev"]
