# PM2 Deployment Guide

## Apa itu PM2?

**PM2 (Process Manager 2)** adalah production process manager untuk Node.js yang menyediakan fitur-fitur penting untuk menjalankan aplikasi di production:

```
┌─────────────────────────────────────────────────────────────┐
│                         PM2 CLUSTER                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Worker  │  │ Worker  │  │ Worker  │  │ Worker  │        │
│  │   #0    │  │   #1    │  │   #2    │  │   #3    │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
│       └────────────┴─────┬──────┴────────────┘              │
│                          │                                   │
│                   ┌──────▼──────┐                           │
│                   │ PM2 Master  │ ← Load Balancer           │
│                   └──────┬──────┘                           │
│                          │                                   │
│                   ┌──────▼──────┐                           │
│                   │   Port 3012  │                          │
│                   └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Fitur Utama PM2

| Fitur | Deskripsi |
|-------|-----------|
| **Cluster Mode** | Menjalankan N instance = N CPU cores |
| **Auto-restart** | Restart otomatis jika crash |
| **Load Balancing** | Round-robin ke semua instances |
| **Zero-downtime** | Reload tanpa interruption |
| **Log Management** | Centralized logging |
| **Monitoring** | CPU/Memory usage per instance |

---

## Perbandingan Node.js vs PM2 Cluster

```
Single Node.js Process:
CPU: [████░░░░░░░░] 25% (1 core dari 4)
Throughput: 100 req/s

PM2 Cluster (4 instances):
CPU: [████████████] 100% (semua 4 cores)
Throughput: 400 req/s
```

---

## File Konfigurasi

### ecosystem.config.js

```javascript
module.exports = {
    apps: [{
        name: 'catering-backend',
        script: 'node_modules/.bin/ts-node',
        args: 'src/index.ts',
        instances: 2,              // Jumlah workers
        exec_mode: 'cluster',      // Mode cluster
        max_memory_restart: '500M' // Restart jika memory > 500MB
    }]
};
```

---

## Perintah PM2

```bash
# Start aplikasi
npm run pm2:start

# Lihat status
npx pm2 status

# Lihat logs real-time
npx pm2 logs

# Restart aplikasi
npx pm2 restart catering-backend

# Stop aplikasi
npx pm2 stop catering-backend

# Reload tanpa downtime
npx pm2 reload catering-backend

# Monitor CPU/Memory
npx pm2 monit
```

---

## Docker Integration

Dockerfile menggunakan `pm2-runtime` untuk container:

```dockerfile
CMD ["npm", "run", "pm2:dev"]
```

`pm2-runtime` adalah versi PM2 yang dioptimalkan untuk Docker:
- Tidak daemon (foreground process)
- Proper signal handling
- Graceful shutdown

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PM2_INSTANCES` | 2 | Jumlah worker instances |
| `NODE_ENV` | development | Environment mode |
| `PORT` | 3012 | Port aplikasi |

Untuk production (gunakan semua cores):
```bash
PM2_INSTANCES=max npm run pm2:start
```
