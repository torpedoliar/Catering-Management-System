# Deployment dengan Nginx Proxy Manager

## Langkah 1: Siapkan Environment

```bash
# Clone project
git clone https://github.com/torpedoliar/Catering-Management-System.git
cd Catering-Management-System

# Buat file .env
cat > .env << EOF
DB_PASSWORD=your_secure_db_password
JWT_SECRET=your_jwt_secret_64_chars_minimum
CORS_ORIGIN=https://catering.yourdomain.com
VITE_API_URL=https://catering.yourdomain.com
EOF
```

## Langkah 2: Jalankan dengan Docker Compose NPM

```bash
# Gunakan docker-compose.npm.yml (tanpa nginx bawaan)
docker compose -f docker-compose.npm.yml up -d

# Verify containers running
docker compose -f docker-compose.npm.yml ps
```

## Langkah 3: Konfigurasi NPM

### 3.1 Buat Proxy Host

| Setting | Value |
|---------|-------|
| Domain Names | `catering.yourdomain.com` |
| Scheme | `http` |
| Forward Hostname/IP | `YOUR_SERVER_IP` |
| Forward Port | `3011` |
| Block Common Exploits | ✓ |
| Websockets Support | ✓ |

### 3.2 Custom Locations (Advanced Tab)

Salin isi file `nginx-proxy-manager.conf` ke Advanced Tab:

```
# API dengan SSE support
location /api/sse {
    proxy_pass http://YOUR_SERVER_IP:3012;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400;
}

location /api/ {
    proxy_pass http://YOUR_SERVER_IP:3012;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_read_timeout 300;
    client_max_body_size 50M;
}

location /uploads/ {
    proxy_pass http://YOUR_SERVER_IP:3012/uploads/;
    expires 1d;
}
```

### 3.3 Enable SSL

1. Tab SSL > Request new SSL Certificate
2. Force SSL: ✓
3. HTTP/2 Support: ✓

## Langkah 4: Verifikasi

```bash
# Test health endpoint
curl https://catering.yourdomain.com/api/health

# Test login
curl -X POST https://catering.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ADMIN001","password":"admin123"}'
```

## Troubleshooting

### SSE tidak connect
- Pastikan `proxy_buffering off` sudah diset
- Pastikan `proxy_read_timeout 86400` sudah diset

### Upload gagal (413 error)
- Set `client_max_body_size 50M` di Advanced config

### CORS error
- Pastikan `CORS_ORIGIN` di .env sesuai dengan domain NPM
- Jangan pakai trailing slash

## Rollback ke Nginx Bawaan

```bash
# Stop NPM version
docker compose -f docker-compose.npm.yml down

# Start dengan nginx bawaan
docker compose up -d
```
