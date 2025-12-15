# Nginx Reverse Proxy - Quick Start

## 🚀 Cara Deploy

### 1. Copy docker-compose config
```bash
cp docker-compose.example.yml docker-compose.yml
```

### 2. Stop containers lama
```bash
docker-compose down
```

### 3. Start dengan Nginx
```bash
docker-compose up -d
```

### 4. Akses aplikasi
```
http://localhost:8443
```

## ✅ Selesai!

Semua akses sekarang melalui **port 8443**:
- Frontend: http://localhost:8443
- API: http://localhost:8443/api
- Uploads: http://localhost:8443/uploads

## Troubleshooting

### Check logs jika ada masalah:
```bash
docker logs catering-nginx
docker logs catering-frontend  
docker logs catering-backend
```

### Restart specific service:
```bash
docker-compose restart nginx
docker-compose restart frontend
docker-compose restart backend
```
