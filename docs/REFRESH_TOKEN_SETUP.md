# Panduan Konfigurasi Refresh Token (JWT_REFRESH_SECRET)

> Dokumen ini menjelaskan cara mengkonfigurasi **Refresh Token** pada sistem HalloFood Catering Management System, baik untuk lingkungan development maupun production.

---

## Apa Itu Refresh Token?

Sistem HalloFood menggunakan arsitektur **Two-Tier Token** untuk keamanan sesi pengguna:

| Token | Fungsi | Masa Berlaku | Disimpan Di |
|:------|:-------|:-------------|:------------|
| **Access Token** | Mengakses semua API (order, check-in, dll) | **1 Jam** | Memory + Capacitor Preferences |
| **Refresh Token** | Menukar Access Token yang sudah kedaluwarsa | **30 Hari** | Capacitor Preferences + Database (hashed) |

### Alur Kerja:

```
User Login → Server memberikan Access Token (1h) + Refresh Token (30d)
     ↓
User menggunakan aplikasi secara normal...
     ↓
Setelah 1 jam, Access Token kedaluwarsa
     ↓
Aplikasi otomatis mengirim Refresh Token ke POST /api/auth/refresh
     ↓
Server memvalidasi Refresh Token → menerbitkan Access Token baru
     ↓
User tidak merasakan apapun (seamless / tanpa gangguan)
```

---

## Environment Variables

Sistem ini membutuhkan **2 secret key** yang berbeda di file `.env` backend:

```env
# Secret untuk Access Token (sudah ada sebelumnya)
JWT_SECRET=<kunci-rahasia-1>

# Secret BARU untuk Refresh Token (WAJIB ditambahkan)
JWT_REFRESH_SECRET=<kunci-rahasia-2>
```

> ⚠️ **PERINGATAN KEAMANAN:** Kedua secret ini **WAJIB BERBEDA**. Jika sama, penyerang yang berhasil mencuri Access Token bisa memalsukan Refresh Token dan mendapatkan akses permanen.

---

## Langkah Setup: Server Production (Linux / Docker)

### Langkah 1: Generate Secret Key

Masuk ke terminal / SSH server Anda, lalu jalankan:

```bash
openssl rand -base64 48
```

Perintah ini akan menghasilkan string acak sepanjang ~64 karakter, contoh:

```
f8TqZ3x...u7s0==
```

**Salin hasilnya ke clipboard.**

### Langkah 2: Tambahkan ke File `.env`

Buka file `.env` di dalam folder `backend/` proyek Anda:

```bash
nano /path/to/catering-management/backend/.env
```

Cari bagian `SECURITY` dan tambahkan baris baru:

```env
# ===========================================
# SECURITY (REQUIRED)
# ===========================================
JWT_SECRET=<kunci-yang-sudah-ada>
JWT_REFRESH_SECRET=<paste-hasil-openssl-di-sini>
```

Simpan file (`Ctrl+O`, `Enter`, `Ctrl+X` pada nano).

### Langkah 3: Restart Server

**Jika menggunakan Docker Compose:**
```bash
cd /path/to/catering-management
docker compose down
docker compose up -d
```

**Jika menggunakan PM2:**
```bash
pm2 restart catering-backend
```

**Jika langsung via Node.js:**
```bash
# Stop proses lama
kill $(lsof -t -i:3012)

# Jalankan ulang
cd backend
NODE_ENV=production node dist/index.js &
```

### Langkah 4: Verifikasi

Pastikan server berjalan tanpa error:

```bash
# Docker
docker compose logs -f backend --tail 20

# PM2
pm2 logs catering-backend --lines 20
```

Cari output seperti:
```
🚀 Catering API running on http://localhost:3012
🧹 Cleaned up 0 expired/revoked refresh tokens
```

Jika muncul pesan `CRITICAL: JWT_REFRESH_SECRET environment variable is not set!`, berarti secret belum terbaca — periksa kembali file `.env`.

---

## Langkah Setup: Development Lokal (macOS)

Untuk pengembangan lokal, Anda cukup menambahkan baris berikut di `backend/.env`:

```env
JWT_REFRESH_SECRET=dev-local-refresh-secret-not-for-production
```

> **Catatan:** Nilai ini hanya untuk development. Jangan gunakan nilai ini di server production.

---

## Database: Tabel `RefreshToken`

Refresh token disimpan di database PostgreSQL dalam tabel baru `RefreshToken`. Tabel ini otomatis dibuat saat menjalankan migrasi Prisma:

```bash
cd backend
npx prisma migrate deploy
```

### Struktur Tabel:

| Kolom | Tipe | Keterangan |
|:------|:-----|:-----------|
| `id` | UUID | Primary key |
| `token` | String (unique) | Hash SHA-256 dari refresh token |
| `userId` | String | Foreign key ke tabel User |
| `deviceInfo` | String (nullable) | Platform: "Web", "Android", "iOS" |
| `expiresAt` | DateTime | Tanggal kedaluwarsa (30 hari dari pembuatan) |
| `isRevoked` | Boolean | `true` jika token sudah dicabut (logout/admin) |
| `createdAt` | DateTime | Waktu pembuatan |

### Pembersihan Otomatis

Token yang sudah kedaluwarsa atau di-revoke akan otomatis dihapus dari database setiap **24 jam** oleh `token-cleanup.service.ts`. Tidak ada aksi manual yang diperlukan.

---

## Skenario & Perilaku

### 1. User Login Normal
- Server memberikan `token` (Access, 1h) dan `refreshToken` (Refresh, 30d)
- Kedua token disimpan di perangkat via Capacitor Preferences

### 2. Access Token Kedaluwarsa (Setelah 1 Jam)
- API me-reply 401 Unauthorized
- Axios Interceptor otomatis memanggil `POST /api/auth/refresh`
- Server memvalidasi Refresh Token → memberikan Access Token baru
- Request yang gagal tadi otomatis di-retry
- **User tidak merasakan apapun**

### 3. Refresh Token Kedaluwarsa (Setelah 30 Hari)
- Endpoint `/api/auth/refresh` me-reply 401
- Interceptor mendeteksi kegagalan refresh → Force Logout
- User diarahkan ke halaman Login
- **Ini satu-satunya momen user perlu login ulang**

### 4. User Logout Secara Manual
- Semua refresh token milik user di database diberikan flag `isRevoked = true`
- Token di perangkat dihapus dari Preferences
- Token lama tidak bisa digunakan lagi di perangkat manapun

### 5. Admin Menonaktifkan User
- Ketika user mencoba refresh, server memeriksa `user.isActive`
- Jika `false`, refresh ditolak dan token di-revoke otomatis
- User yang sudah dinonaktifkan tidak bisa memperbarui sesinya

---

## FAQ

**Q: Apakah saya perlu mengubah password user setelah menambahkan refresh token?**
A: Tidak. Ini murni perubahan di sisi infrastruktur autentikasi. Password user tidak terpengaruh.

**Q: Apa yang terjadi jika saya lupa menambahkan `JWT_REFRESH_SECRET`?**
A: Server akan tetap berjalan, tetapi **semua proses login akan gagal** dengan error 500 "Server configuration error". User tidak akan bisa login sama sekali.

**Q: Berapa banyak refresh token yang disimpan per user?**
A: Satu per sesi login. Jika user login dari 3 perangkat berbeda (Web, Android, iOS), akan ada 3 record di database. Saat logout, **semua** token milik user tersebut dicabut.

**Q: Apakah aman jika refresh token dicuri?**
A: Refresh token yang disimpan di database sudah di-hash dengan SHA-256. Bahkan jika database terbobol, penyerang tidak bisa merekonstruksi token asli. Selain itu, server memvalidasi 3 lapisan: JWT signature, hash di database, dan status aktif user.

---

## File yang Terkait

| File | Peran |
|:-----|:------|
| `backend/.env` | Menyimpan `JWT_REFRESH_SECRET` |
| `backend/.env.example` | Template referensi |
| `backend/prisma/schema.prisma` | Definisi model `RefreshToken` |
| `backend/src/routes/auth.routes.ts` | Endpoint `/login`, `/refresh`, `/logout` |
| `backend/src/services/token-cleanup.service.ts` | Cron job pembersihan token expired |
| `backend/src/index.ts` | Menjalankan interval cleanup setiap 24 jam |
| `frontend/src/contexts/AuthContext.tsx` | Interceptor untuk silent refresh + penyimpanan token |
