# Deployment Guide - Catering Management System

## Persyaratan Server

- **OS**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- **RAM**: Minimal 2GB (Rekomendasi 4GB)
- **Storage**: Minimal 10GB
- **Docker**: v20.10+
- **Docker Compose**: v2.0+

---

## Langkah 1: Install Docker (Jika belum ada)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user ke docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Logout dan login ulang untuk apply group
exit
```

---

## Langkah 2: Clone Project

```bash
cd ~/Documents
git clone https://github.com/torpedoliar/Catering-Management-System.git
cd Catering-Management-System
```

---

## Langkah 3: Konfigurasi Environment

```bash
# Buat file .env
cat > .env << 'EOF'
DB_PASSWORD=your_secure_db_password_here
JWT_SECRET=your_jwt_secret_minimum_32_chars_here
EOF

# Set permission
chmod 600 .env
```

> ⚠️ **PENTING**: Ganti password dan secret dengan nilai yang aman!

---

## Langkah 4: Jalankan Aplikasi

```bash
# Build dan jalankan
docker compose up -d

# Cek status
docker compose ps

# Lihat logs
docker compose logs -f
```

---

## Langkah 5: Akses Aplikasi

Buka browser dan akses:
```
http://YOUR_SERVER_IP:8443
```

### Default Login:
- **Username**: `ADMIN001`
- **Password**: `admin123`

> ⚠️ Segera ganti password setelah login pertama!

---

## Update Aplikasi

Jalankan script update:
```bash
cd ~/Documents/Catering-Management-System
chmod +x update.sh   # Pertama kali saja
./update.sh
```

---

## Perintah Berguna

```bash
# Stop semua container
docker compose down

# Restart container tertentu
docker compose restart backend

# Lihat logs backend
docker compose logs -f backend

# Masuk ke container backend
docker compose exec backend sh

# Backup database manual
docker compose exec db pg_dump -U postgres catering_db > backup.sql

# Restore database
cat backup.sql | docker compose exec -T db psql -U postgres catering_db
```

---

## Troubleshooting

### Port 8443 tidak bisa diakses
```bash
# Cek firewall
sudo ufw allow 8443/tcp
sudo ufw reload
```

### Container tidak mau start
```bash
# Cek logs
docker compose logs

# Rebuild tanpa cache
docker compose build --no-cache
docker compose up -d
```

### Database connection refused
```bash
# Tunggu database ready
docker compose logs db

# Restart
docker compose restart backend
```

---

## Production Checklist

- [ ] Ganti `DB_PASSWORD` dengan password aman
- [ ] Ganti `JWT_SECRET` dengan string random 64+ karakter
- [ ] Setup SSL/HTTPS dengan reverse proxy (Nginx/Traefik)
- [ ] Backup database secara berkala
- [ ] Monitor disk space dan memory
- [ ] Setup firewall (hanya buka port yang diperlukan)
