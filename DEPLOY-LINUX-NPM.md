# Deploy Catering Management System ke Linux dengan Nginx Proxy Manager

## Persyaratan

- Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- RAM minimal 2GB
- Docker & Docker Compose
- Nginx Proxy Manager sudah terinstall

---

## STEP 1: Install Docker (Skip jika sudah ada)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Add user ke docker group
sudo usermod -aG docker $USER

# Logout dan login ulang
exit
```

---

## STEP 2: Clone Project

```bash
# Masuk ke folder Documents
cd ~/Documents

# Clone repository
git clone https://github.com/torpedoliar/Catering-Management-System.git

# Masuk ke folder project
cd Catering-Management-System
```

---

## STEP 3: Setup Environment

```bash
# Buat file .env dengan password aman
cat > .env << 'EOF'
DB_PASSWORD=GantiDenganPasswordAman123
JWT_SECRET=GantiDenganSecretPanjangMinimal64KarakterAcakDisini1234567890
CORS_ORIGIN=https://catering.yourdomain.com
VITE_API_URL=https://catering.yourdomain.com
EOF

# Set permission
chmod 600 .env
```

> ⚠️ **PENTING:** Ganti `catering.yourdomain.com` dengan domain Anda!

---

## STEP 4: Setup Docker Compose untuk NPM

```bash
# Copy docker-compose NPM version
cp docker-compose.npm.yml docker-compose.yml

# Verify file
cat docker-compose.yml | head -20
```

---

## STEP 5: Build dan Start Containers

```bash
# Build images (5-10 menit pertama kali)
docker compose build

# Start semua containers
docker compose up -d

# Tunggu sampai selesai
sleep 15

# Cek status
docker compose ps
```

---

## STEP 6: Setup Database

```bash
# Sync database schema
docker compose exec backend npx prisma db push --accept-data-loss

# Generate Prisma client
docker compose exec backend npx prisma generate

# Seed admin user
docker compose exec backend node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seed() {
    const hash = await bcrypt.hash('admin123', 10);
    await prisma.user.upsert({
        where: { username: 'ADMIN001' },
        update: {},
        create: {
            username: 'ADMIN001',
            name: 'Administrator',
            password: hash,
            role: 'ADMIN',
            isActive: true
        }
    });
    console.log('Admin created: ADMIN001');
    await prisma.\$disconnect();
}
seed();
"
```

---

## STEP 7: Konfigurasi Nginx Proxy Manager

### 7.1 Login ke NPM
Buka: `http://YOUR_SERVER_IP:81`

### 7.2 Buat Proxy Host Baru

| Field | Value |
|-------|-------|
| Domain Names | `catering.yourdomain.com` |
| Scheme | `http` |
| Forward Hostname/IP | `YOUR_SERVER_IP` |
| Forward Port | `3011` |
| Block Common Exploits | ✓ |
| Websockets Support | ✓ |

### 7.3 Tambah Custom Locations (Advanced Tab)

Salin dan paste ini ke **Custom Nginx Configuration**:

```nginx
# SSE Support - WAJIB untuk realtime
location /api/sse {
    proxy_pass http://YOUR_SERVER_IP:3012;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400;
    chunked_transfer_encoding off;
}

# API dengan upload support
location /api/ {
    proxy_pass http://YOUR_SERVER_IP:3012;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300;
    client_max_body_size 50M;
}

# Static uploads
location /uploads/ {
    proxy_pass http://YOUR_SERVER_IP:3012/uploads/;
    expires 1d;
}
```

> ⚠️ Ganti `YOUR_SERVER_IP` dengan IP server Anda!

### 7.4 Enable SSL
- Tab **SSL**
- Request new SSL Certificate
- Force SSL: ✓
- HTTP/2 Support: ✓

---

## STEP 8: Verifikasi

```bash
# Test dari server
curl -s http://localhost:3012/api/health

# Test dari luar (ganti domain)
curl -s https://catering.yourdomain.com/api/health
```

---

## STEP 9: Akses Aplikasi

Buka browser:
```
https://catering.yourdomain.com
```

**Login:**
- Username: `ADMIN001`
- Password: `admin123`

---

## Commands Berguna

```bash
# Lihat logs
docker compose logs -f

# Restart container
docker compose restart backend

# Stop semua
docker compose down

# Update aplikasi
git pull origin main
docker compose build
docker compose up -d
```

---

## Troubleshooting

### Container tidak start
```bash
docker compose logs backend
docker compose logs frontend
```

### SSE tidak connect
- Pastikan config `/api/sse` sudah benar di NPM
- Cek `proxy_buffering off` sudah diset

### Upload gagal (Error 413)
- Set `client_max_body_size 50M` di NPM

### Database connection error
```bash
docker compose restart backend
```
