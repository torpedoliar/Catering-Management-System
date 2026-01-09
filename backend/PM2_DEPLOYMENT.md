# PM2 Deployment Guide

## Apa itu PM2?

**PM2 (Process Manager 2)** adalah production process manager untuk Node.js/Bun yang menyediakan:

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

## Versi PM2

| Versi | Status |
|-------|--------|
| **6.0.14** | ✅ Latest (digunakan saat ini) |

Referensi: [PM2 GitHub](https://github.com/unitech/pm2)

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

## Instalasi & Update

```bash
# Global installation
npm install pm2@latest -g

# Update PM2
pm2 update

# Atau sebagai project dependency (sudah di package.json)
npm install pm2@^6.0.14
```

---

## Penggunaan Production

> [!IMPORTANT]
> PM2 cluster mode memerlukan compiled JavaScript!
> TypeScript + PM2 cluster tidak kompatibel.

```bash
# 1. Build TypeScript ke JavaScript
npm run build

# 2. Start dengan PM2 cluster mode
npm run pm2:start

# Atau one-liner:
npm run pm2:build-start
```

---

## Perintah PM2

```bash
# Lihat status semua processes
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

# Hapus dari PM2
npx pm2 delete catering-backend
```

---

## Konfigurasi (ecosystem.config.js)

```javascript
module.exports = {
    apps: [{
        name: 'catering-backend',
        script: 'dist/index.js',
        instances: 'max',           // Gunakan semua CPU
        exec_mode: 'cluster',       // Mode cluster
        max_memory_restart: '500M', // Restart jika memory > 500MB
        env: {
            NODE_ENV: 'production',
            PORT: 3012
        }
    }]
};
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PM2_INSTANCES` | max | Jumlah worker instances |
| `NODE_ENV` | production | Environment mode |
| `PORT` | 3012 | Port aplikasi |

---

## Mode Development vs Production

| Aspek | Development | Production |
|-------|-------------|------------|
| **Command** | `npm run dev` | `npm run pm2:build-start` |
| **Process Manager** | nodemon | PM2 |
| **Hot Reload** | ✅ | ❌ (use pm2 reload) |
| **Multi-core** | ❌ | ✅ cluster mode |
| **TypeScript** | Direct (ts-node) | Compiled (dist/) |
