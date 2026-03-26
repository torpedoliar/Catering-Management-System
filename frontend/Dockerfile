# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
# Setting VITE_API_URL to empty ensures Axios uses relative paths (/api) which is cleanly 
# proxied by the external Docker Nginx Reverse Proxy.
ENV VITE_API_URL=""
RUN npm run build

# Stage 2: Serve the built static files with NGINX
FROM nginx:alpine

# Copy custom NGINX configuration tailored for React and Cache-Control
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built assets from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 3011 for internal Docker Network bridging
EXPOSE 3011

CMD ["nginx", "-g", "daemon off;"]
