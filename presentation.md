# 🍽️ Sistem Manajemen Catering
## Penjelasan Menu Aplikasi

---

# � LOGIN

**Cara Masuk:**
- Masukkan NIK dan Password
- Sistem otomatis arahkan ke menu sesuai role

---

# 👤 MENU KARYAWAN

## 1. Pesan Makanan
- Pilih tanggal makan
- Pilih shift (Shift 1/2/3)
- Bisa pesan untuk beberapa hari sekaligus
- Dapat QR code untuk ambil makanan
- Bisa batalkan pesanan sebelum batas waktu

## 2. Riwayat Pesanan
- Lihat semua pesanan yang pernah dibuat
- Cek status: Sudah diambil / Belum / Dibatalkan / Tidak diambil

## 3. Pengaturan
- Lihat profil
- Ganti password

## 4. Tentang
- Info aplikasi

---

# 🔧 MENU ADMIN

## 5. Dashboard
- Lihat statistik pesanan hari ini
- Grafik tren pesanan
- Total pesanan per shift

## 6. Daftar Pesanan
- Lihat semua pesanan dari semua karyawan
- Cari dan filter pesanan
- Batalkan pesanan jika perlu

## 7. Kelola User
- Lihat daftar karyawan
- Tambah user baru (manual atau import Excel)
- Edit/hapus user
- Reset password
- Aktifkan/nonaktifkan user

## 8. Blacklist
- Lihat user yang kena blacklist
- Lihat jumlah strike tiap user
- Buka blokir user
- Reset strike ke 0

**Aturan Strike:**
- Strike 1 & 2 = Peringatan
- Strike 3 = Kena blacklist, tidak bisa pesan

## 9. Kalender Libur
- Tandai tanggal sebagai hari libur
- Bisa libur penuh atau per shift saja
- User tidak bisa pesan di hari libur

## 10. Pengaturan Shift
- Atur jam shift (mulai & selesai)
- Atur harga makanan per shift
- Aktifkan/nonaktifkan shift

**Shift Default:**
| Shift | Waktu |
|-------|-------|
| Shift 1 | 08:00 - 15:00 |
| Shift 2 | 15:00 - 23:00 |
| Shift 3 | 23:00 - 07:00 |

## 11. Pengaturan Sistem
- Batas waktu pesan (default: 6 jam sebelum shift)
- Jumlah strike sebelum blacklist (default: 3x)
- Lama blacklist (default: 7 hari)
- Maksimal hari pesan ke depan (default: 7 hari)

## 12. Kelola Perusahaan
- Atur struktur: Company → Division → Department
- Atur shift yang boleh dipakai tiap department

## 13. Pesan & Keluhan
- Lihat keluhan dari karyawan tentang makanan
- Lihat alasan pembatalan pesanan

## 14. Pengumuman
- Buat pengumuman untuk semua karyawan
- Atur prioritas (biasa/penting/urgent)
- Bisa buat perjanjian yang wajib disetujui user

## 15. Analisis Biaya
- Lihat total biaya catering per periode
- Breakdown per shift dan perusahaan
- Export laporan ke Excel

## 16. Laporan Performa
- Statistik: total order, diambil, tidak diambil
- Lihat user dengan no-show terbanyak

## 17. Export Data
- Download data pesanan ke Excel
- Pilih periode dan filter yang diinginkan

## 18. Audit Log
- Log semua aktivitas di sistem
- Siapa melakukan apa dan kapan

## 19. Backup & Restore
- Buat backup database
- Kembalikan data dari backup
- Atur backup otomatis

## 20. Pengaturan Waktu
- Sinkronisasi waktu dengan server NTP
- Atur timezone

## 21. Pengaturan Email
- Setting SMTP untuk kirim email
- Kirim email test

---

# 🍴 MENU KANTIN

## 22. Check-In
- Scan QR code dari HP karyawan
- Atau input NIK manual
- Konfirmasi pengambilan makanan
- Bisa foto saat check-in

---

# 🔄 ALUR KERJA

## Alur Pesan Makanan:
```
Login → Pilih Tanggal & Shift → Dapat QR → 
Datang ke Kantin → Scan QR → Ambil Makanan ✅
```

## Alur No-Show:
```
Tidak ambil makanan → Sistem tandai NO_SHOW →
Strike +1 → Jika strike 3 → BLACKLIST!
```

---

# 🛡️ HAK AKSES

| Fitur | Karyawan | Kantin | Admin |
|-------|:--------:|:------:|:-----:|
| Pesan makanan | ✅ | ❌ | ✅ |
| Check-in | ❌ | ✅ | ✅ |
| Kelola user | ❌ | ❌ | ✅ |
| Dashboard | ❌ | ❌ | ✅ |
| Semua pengaturan | ❌ | ❌ | ✅ |

---

# ✨ FITUR UNGGULAN

1. **QR Code** - Check-in cepat dengan scan
2. **Shift Malam** - Support shift yang lewat tengah malam
3. **Pesan Massal** - Pesan beberapa hari sekaligus
4. **Auto No-Show** - Deteksi otomatis yang tidak ambil makanan
5. **Sistem Strike** - Kurangi pemborosan makanan
6. **Sinkronisasi Waktu** - Waktu akurat dengan NTP
7. **Audit Trail** - Semua aktivitas tercatat
8. **Backup Otomatis** - Data aman
9. **Analisis Biaya** - Laporan lengkap
10. **Multi Perusahaan** - 1 sistem untuk banyak company

---

**© 2024 Catering Management System**
