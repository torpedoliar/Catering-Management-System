# Database Table Structure

Dokumentasi struktur tabel database Catering Management System.

**Database**: PostgreSQL  
**ORM**: Prisma  
**Last Updated**: 2025-12-18

---

## Enums

### Role
| Value | Description |
|-------|-------------|
| USER | Karyawan biasa |
| ADMIN | Administrator |
| CANTEEN | Operator kantin |

### OrderStatus
| Value | Description |
|-------|-------------|
| ORDERED | Pesanan aktif |
| PICKED_UP | Sudah diambil |
| NO_SHOW | Tidak diambil |
| CANCELLED | Dibatalkan |

### MessageType
| Value | Description |
|-------|-------------|
| COMPLAINT | Keluhan makanan |
| CANCELLATION | Alasan pembatalan |

### AnnouncementType
| Value | Description |
|-------|-------------|
| ANNOUNCEMENT | Pengumuman biasa |
| AGREEMENT | Persetujuan (TOS) |

---

## Tables

### User
Tabel data karyawan.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | auto | Primary key |
| externalId | String | NO | - | ID HRIS (untuk login) - UNIQUE |
| nik | String | YES | - | NIK Perusahaan (angka, untuk check-in) - UNIQUE |
| name | String | NO | - | Nama karyawan |
| email | String | YES | - | Email |
| password | String | NO | - | Password hash |
| company | String | NO | - | Nama perusahaan |
| division | String | NO | - | Nama divisi |
| department | String | NO | - | Nama departemen |
| departmentId | UUID | YES | - | FK ke Department |
| photo | String | YES | - | URL foto user |
| role | Role | NO | USER | Role user |
| noShowCount | Int | NO | 0 | Jumlah no-show |
| mustChangePassword | Boolean | NO | true | Wajib ganti password |
| isActive | Boolean | NO | true | Status aktif |
| createdAt | DateTime | NO | now() | Waktu dibuat |
| updatedAt | DateTime | NO | auto | Waktu update |

**Indexes**: externalId, nik, name, company, departmentId, [isActive, role]

---

### Order
Tabel pesanan makanan.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | auto | Primary key |
| userId | UUID | NO | - | FK ke User |
| shiftId | UUID | NO | - | FK ke Shift |
| orderDate | DateTime | NO | - | Tanggal pesanan |
| orderTime | DateTime | NO | now() | Waktu pesan |
| status | OrderStatus | NO | ORDERED | Status pesanan |
| qrCode | String | NO | - | Kode QR - UNIQUE |
| mealPrice | Decimal | YES | - | Harga saat order |
| checkInTime | DateTime | YES | - | Waktu check-in |
| checkedInById | String | YES | - | ID yang check-in |
| checkedInBy | String | YES | - | Nama yang check-in |
| cancelledById | String | YES | - | ID yang cancel |
| cancelledBy | String | YES | - | Nama yang cancel |
| cancelReason | String | YES | - | Alasan cancel |
| checkinPhoto | String | YES | - | Foto check-in |
| createdAt | DateTime | NO | now() | Waktu dibuat |
| updatedAt | DateTime | NO | auto | Waktu update |

**Indexes**: userId, shiftId, orderDate, status, qrCode, checkedInById, [orderDate, status], [userId, orderDate], [shiftId, orderDate, status]

---

### Shift
Tabel shift kerja.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | auto | Primary key |
| name | String | NO | - | Nama shift - UNIQUE |
| startTime | String | NO | - | Jam mulai (HH:mm) |
| endTime | String | NO | - | Jam selesai (HH:mm) |
| mealPrice | Decimal | NO | 25000 | Harga makanan |
| description | String | YES | - | Deskripsi menu |
| isActive | Boolean | NO | true | Status aktif |
| createdAt | DateTime | NO | now() | Waktu dibuat |
| updatedAt | DateTime | NO | auto | Waktu update |

---

### Holiday
Tabel hari libur.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | auto | Primary key |
| date | Date | NO | - | Tanggal libur |
| name | String | NO | - | Nama hari libur |
| description | String | YES | - | Deskripsi |
| shiftId | UUID | YES | - | FK ke Shift (null = fullday) |
| isActive | Boolean | NO | true | Status aktif |
| createdAt | DateTime | NO | now() | Waktu dibuat |
| updatedAt | DateTime | NO | auto | Waktu update |

**Unique**: [date, shiftId]  
**Indexes**: date, isActive, shiftId

---

### Blacklist
Tabel blacklist user.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | auto | Primary key |
| userId | UUID | NO | - | FK ke User |
| reason | String | NO | - | Alasan blacklist |
| startDate | DateTime | NO | now() | Tanggal mulai |
| endDate | DateTime | YES | - | Tanggal selesai |
| isActive | Boolean | NO | true | Status aktif |
| createdAt | DateTime | NO | now() | Waktu dibuat |
| updatedAt | DateTime | NO | auto | Waktu update |

**Indexes**: userId, isActive, [userId, isActive, endDate]

---

### Settings
Tabel konfigurasi sistem.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | String | NO | "default" | Primary key |
| cutoffMode | String | NO | "per-shift" | Mode cutoff |
| cutoffDays | Int | NO | 0 | Hari sebelum shift |
| cutoffHours | Int | NO | 6 | Jam sebelum shift |
| maxOrderDaysAhead | Int | NO | 7 | Maks hari ke depan |
| weeklyCutoffDay | Int | NO | 5 | Hari cutoff mingguan (0-6) |
| weeklyCutoffHour | Int | NO | 17 | Jam cutoff |
| weeklyCutoffMinute | Int | NO | 0 | Menit cutoff |
| orderableDays | String | NO | "1,2,3,4,5,6" | Hari yang bisa order |
| maxWeeksAhead | Int | NO | 1 | Maks minggu ke depan |
| blacklistStrikes | Int | NO | 3 | Strike sebelum blacklist |
| blacklistDuration | Int | NO | 7 | Durasi blacklist (hari) |
| ntpEnabled | Boolean | NO | true | NTP aktif |
| ntpServer | String | NO | "pool.ntp.org" | Server NTP |
| ntpTimezone | String | NO | "Asia/Jakarta" | Timezone |
| emailEnabled | Boolean | NO | false | Email aktif |
| smtpHost | String | YES | - | Host SMTP |
| smtpPort | Int | NO | 587 | Port SMTP |
| checkinPhotoEnabled | Boolean | NO | false | Foto check-in |
| autoBackupEnabled | Boolean | NO | false | Auto backup |
| sundayAutoHoliday | Boolean | NO | false | Libur Minggu otomatis |

---

### Company
Master data perusahaan.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | auto | Primary key |
| name | String | NO | - | Nama perusahaan - UNIQUE |
| isActive | Boolean | NO | true | Status aktif |
| createdAt | DateTime | NO | now() | Waktu dibuat |
| updatedAt | DateTime | NO | auto | Waktu update |

---

### Division
Master data divisi.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | auto | Primary key |
| name | String | NO | - | Nama divisi |
| companyId | UUID | NO | - | FK ke Company |
| isActive | Boolean | NO | true | Status aktif |
| createdAt | DateTime | NO | now() | Waktu dibuat |
| updatedAt | DateTime | NO | auto | Waktu update |

**Unique**: [companyId, name]

---

### Department
Master data departemen.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | auto | Primary key |
| name | String | NO | - | Nama departemen |
| divisionId | UUID | NO | - | FK ke Division |
| defaultShiftId | UUID | YES | - | Shift default |
| workDays | String | NO | "1,2,3,4,5" | Hari kerja |
| isActive | Boolean | NO | true | Status aktif |
| createdAt | DateTime | NO | now() | Waktu dibuat |
| updatedAt | DateTime | NO | auto | Waktu update |

**Unique**: [divisionId, name]

---

### Message
Pesan/keluhan dari user.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | auto | Primary key |
| orderId | UUID | YES | - | FK ke Order |
| shiftId | UUID | NO | - | FK ke Shift |
| userId | UUID | NO | - | FK ke User |
| type | MessageType | NO | - | Tipe pesan |
| content | String | NO | - | Isi pesan |
| orderDate | DateTime | NO | - | Tanggal order |
| createdAt | DateTime | NO | now() | Waktu dibuat |

---

### Announcement
Pengumuman sistem.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | auto | Primary key |
| title | String | NO | - | Judul |
| type | AnnouncementType | NO | ANNOUNCEMENT | Tipe |
| content | String | NO | - | Isi pengumuman |
| priority | String | NO | "normal" | Prioritas |
| isActive | Boolean | NO | true | Status aktif |
| expiresAt | DateTime | YES | - | Waktu expired |
| createdById | UUID | NO | - | FK ke User |
| createdAt | DateTime | NO | now() | Waktu dibuat |
| updatedAt | DateTime | NO | auto | Waktu update |

---

### AuditLog
Log aktivitas sistem.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | auto | Primary key |
| timestamp | DateTime | NO | now() | Waktu kejadian |
| userId | UUID | YES | - | User yang melakukan |
| userName | String | YES | - | Nama user |
| userRole | String | YES | - | Role user |
| action | AuditAction | NO | - | Jenis aksi |
| entity | String | NO | - | Entitas terdampak |
| entityId | UUID | YES | - | ID entitas |
| entityName | String | YES | - | Nama entitas |
| oldValue | JSON | YES | - | Nilai lama |
| newValue | JSON | YES | - | Nilai baru |
| changes | JSON | YES | - | Perubahan |
| ipAddress | String | YES | - | IP address |
| userAgent | String | YES | - | User agent |
| description | String | YES | - | Deskripsi |
| success | Boolean | NO | true | Status sukses |

---

### Backup
Data backup database.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | String | NO | cuid | Primary key |
| filename | String | NO | - | Nama file |
| size | Int | NO | - | Ukuran (bytes) |
| createdAt | DateTime | NO | now() | Waktu dibuat |
| createdById | UUID | YES | - | FK ke User |
| notes | String | YES | - | Catatan |
| status | BackupStatus | NO | COMPLETED | Status backup |
