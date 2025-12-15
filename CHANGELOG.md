# Changelog

All notable changes to Vibe Catering Management System will be documented in this file.

## [1.4.0] - 2025-12-15

### 📸 Check-in Photo Verification

Update v1.4.0 memperkenalkan fitur pengambilan foto saat check-in untuk memastikan pengguna yang mengambil makanan sesuai dengan yang memesan.

### ✨ New Features

#### 📸 Photo Capture During Check-in
- **Webcam Integration**: Kamera otomatis terbuka saat QR code di-scan
- **User Photo Verification**: Tampilan foto profil user untuk perbandingan visual
- **Photo Capture**: Staff kantin dapat mengambil foto saat check-in
- **Image Compression**: Foto otomatis di-resize (400x400) dan compress (WebP 80%)
- **Database Storage**: Foto check-in tersimpan di database untuk audit
- **Toggle Setting**: Admin dapat on/off fitur foto check-in
- **Settings UI**: Tombol toggle "Foto ON/OFF" di halaman check-in

#### 💾 Backend Enhancements
- **New Field**: Order model memiliki field `checkinPhoto`
- **Settings**: Field `checkinPhotoEnabled` untuk kontrol feature
- **Photo Upload API**: Check-in endpoint menerima multipart/form-data
- **Sharp Integration**: Image processing dengan sharp library
- **Storage**: Foto disimpan di `/uploads/checkins`

### 🛠️ Improvements
- **User Photo Feature**: User management sekarang mendukung upload foto profil
- **Webcam Component**: Integrasi react-webcam untuk capture foto real-time
- **FormData Submission**: Check-in API menggunakan FormData untuk support file upload

### 🎨 UI/UX Updates
- **Camera Modal**: Modal fullscreen untuk preview kamera dan user photo
- **Settings Button**: Toggle button dengan visual feedback (green = ON, gray = OFF)
- **User Photo Display**: Menampilkan foto profil user sebelum capture
- **Responsive Camera**: Camera view dengan aspect ratio 4:3 dan overlay border

---

## [1.3.0] - 2025-12-11

### 💰 Cost Management & Timezone Audit

Update v1.3.0 menghadirkan fitur Cost Management dengan historical price tracking dan perbaikan menyeluruh untuk masalah timezone.

### ✨ New Features

#### 💰 Cost Management System
- **Per-Shift Meal Pricing**: Admin dapat mengatur harga makanan per shift di Shift Config
- **Historical Price Tracking**: Order menyimpan harga makanan saat pemesanan dibuat
- **Cost Analysis Dashboard**: Halaman baru `/admin/costs` untuk analisis biaya
  - Total Cost, Actual Cost, Waste Cost metrics
  - Breakdown per Shift dan per Company
  - Waste rate calculation
- **Enhanced Excel Export**: 4-sheet report dengan kolom biaya (Harga Makanan, Biaya Aktual, Kerugian)

#### 📊 Bulk Order Enhancement
- **Multi-Date Selection**: User dapat memesan makanan untuk beberapa hari sekaligus
- **Validation per Date**: Setiap tanggal divalidasi secara terpisah (cutoff, holiday, existing order)
- **Result Summary**: Menampilkan hasil sukses dan gagal per tanggal

### 🛠️ Bug Fixes

#### 🕐 Timezone Audit (Critical)
- **Problem**: `toISOString()` mengembalikan UTC date yang bisa berbeda dari local date di sekitar tengah malam
- **Fixed Files**:
  - `OrderPage.tsx` - 6 lokasi diperbaiki dengan `getLocalDateString()` helper
  - `DashboardPage.tsx` - 6 lokasi diperbaiki dengan `getLocalDateString()` helper
  - `AuditLogPage.tsx` - Timestamp display diperbaiki untuk WIB

#### 📊 Dashboard Rekap per Perusahaan Fix
- **Problem**: Company recap menampilkan data dari `todayOrders` yang hanya 10 item
- **Solution**: Menggunakan `allFilteredOrders` dengan semua order dalam date range
- **Additional Fix**: Filter cancelled orders dari company recap

#### 📝 Audit Log Timestamp Fix
- **Problem**: Timestamp ditampilkan dalam UTC, bukan WIB
- **Solution**: Helper functions `formatWIBDate()` dan `formatWIBTime()` yang menghapus 'Z' suffix

### 🎨 UI Improvements
- **Dashboard**: "Performa per Shift" → "Pengambilan Makan per Shift"
- **Cost Analysis Menu**: Menu baru "Analisis Biaya" di sidebar admin

---

## [1.2.0] - 2025-12-08

### 🎨 UI/UX Overhaul: Modern Gradient Theme

Update v1.2.0 menghadirkan desain UI yang lebih modern, menarik, dan eye-catching dengan tema gradient purple-violet.

### ✨ New Features

#### 🎨 Complete UI Redesign
- **Gradient Theme**: Tema baru dengan gradient purple-violet (#667eea → #764ba2)
- **Glass Morphism Effects**: Efek kaca modern pada cards dan panels
- **Animated Background**: Orbs animasi gradient di halaman login
- **Icon System**: Sistem icon dengan gradient, ukuran, dan animasi (pulse, float, glow)
- **Donut Charts**: Visualisasi statistik pickup rate per shift dengan SVG donut charts

#### 📊 Enhanced Dashboard
- **Rekap per Departemen**: Statistik breakdown per departemen dengan expandable details
- **Rekap per Perusahaan**: Tabel statistik per company
- **No-Show Today/Yesterday**: Daftar user yang tidak mengambil pesanan
- **Order Besok**: Preview pesanan untuk besok
- **Shift Performance**: Donut chart showing pickup percentage per shift

#### 📝 Audit Logging
- **User Management Logs**: Logging CREATE, UPDATE, DELETE operations untuk users
- **Shift Management Logs**: Logging CREATE, UPDATE, DELETE operations untuk shifts
- **Settings Logs**: Logging UPDATE operations untuk system settings
- **Complete Audit Trail**: Mencatat user actor, IP address, dan timestamp

#### 📤 Enhanced Excel Export
- **Professional Formatting**: Header dengan warna gradient, alternate row colors
- **Indonesian Labels**: Status dalam Bahasa Indonesia (Menunggu, Sudah Diambil, dll)
- **Summary Statistics**: Ringkasan total transaksi, pickup rate di bawah tabel
- **Period Information**: Info periode export dan timestamp di header

#### 📜 Order History Enhancement
- **Order Creation Time**: Menampilkan waktu pembuatan pesanan ("Dipesan: dd MMM yyyy, HH:mm")
- **Complete Timestamps**: Modal detail dengan waktu pesan dan waktu ambil

### 🛠️ Bug Fixes

#### 🌙 Overnight Shift No-Show Fix (Critical)
- **Problem**: User dengan shift overnight (23:00-07:00) kena strike no-show sebelum shift berakhir
- **Solution**: Logika process-noshows sekarang menghitung waktu akhir shift yang sebenarnya
- **Overnight Detection**: Jika end time < start time, tambahkan 1 hari ke shift end time
- **Proper Validation**: Order hanya di-mark NO_SHOW setelah shift benar-benar berakhir

#### 🔧 Other Fixes
- **Input Icon Overlap**: Fixed padding-left untuk input fields dengan icon (3.5rem)
- **TypeScript Errors**: Fixed `req.user` undefined handling dengan `|| null`
- **Select Dropdown Colors**: Background dan text color yang proper untuk dropdown options

### 🎨 CSS/Styling Updates

#### Icon Classes
```css
/* Sizes: icon-sm, icon-md, icon-lg, icon-xl, icon-2xl */
/* Colors: icon-primary, icon-success, icon-danger, icon-warning, icon-info, icon-purple, icon-teal, icon-orange */
/* Soft variants: icon-soft-primary, icon-soft-success, etc. */
/* Animations: icon-pulse, icon-float, icon-glow, icon-ring */
```

#### Input Field Improvements
- `.input-icon-wrapper` untuk container input dengan icon
- Automatic padding-left untuk fields dengan class `pl-12`
- Icon color transition on focus

---

## [1.1.0] - 2025-12-07

### 🎉 Major Update: Experience & Reliability

Update v1.1.0 berfokus pada perbaikan Critical UI/UX, stabilitas sistem realtime, dan lokalisasi menyeluruh.

### ✨ New Features

#### 📱 Check-in Flow Redesign
- **Unified Search**: Input tunggal untuk ID, Nama, atau QR Code
- **Rapid Check-in**: Mode "Scan Terus-menerus" tanpa perlu menutup popup manual
- **Smart Feedback**: Popup sukses dengan countdown 5 detik + progress bar
- **Duplicate Prevention**: Warning visual (Amber alert) jika user sudah check-in sebelumnya
- **Details Display**: Menampilkan informasi shift, admin checker, dan timestamp check-in saat ini

#### 🔄 Comprehensive Real-time System
- **Admin-to-User Sync**: Perubahan setting admin langsung update di layar user tanpa refresh
- **Instant Cutoff Updates**: User screen otomatis update jika jam shift/cutoff diubah admin
- **Live Stats**: Counter "Total Picked Up" di halaman Check-in update realtime
- **Full Coverage**: Listeners ditambahkan untuk events `settings:updated` dan `shift:updated`

#### 📅 Enhanced Ordering Experience
- **Future Order Access**: Tombol pemilihan tanggal selalu terlihat bahkan jika hari ini sudah ada pesanan
- **Persistent Date Picker**: Navigasi antar tanggal lebih mudah dan intuitif
- **Confirmation UI**: UI status pesanan yang lebih jelas

### 🛠️ Improvements & Fixes

#### Localization (Bahasa Indonesia)
- **Full Translation**: Seluruh UI frontend (User, Admin, Canteen) kini 100% Bahasa Indonesia
- **Error Messages**: Pesan error backend (API) diterjemahkan ke Bahasa Indonesia yang user-friendly
- **Toast Notifications**: Notifikasi sistem dalam Bahasa Indonesia

#### Infrastructure
- **Redis Persistence**: Docker container Redis dikonfigurasi dengan storage persistence (AOF) untuk mencegah data loss saat restart container
- **Backend Stability**: Fix crash pada route manual check-in akibat korupsi file sebelumnya

---

### 🎉 Initial Release

Vibe Catering Management System v1.0 adalah sistem manajemen pemesanan katering yang lengkap dengan fitur-fitur modern untuk operasional yang efisien.

---

## Core Features

### 📅 Multi-Day Ordering System
- **Pemesanan Multi-Hari**: User dapat memesan makanan untuk beberapa hari ke depan
- **Date Picker UI**: Interface pemilihan tanggal yang intuitif
- **Configurable Limits**: Admin dapat mengatur maksimal berapa hari ke depan user bisa memesan (1-30 hari)
- **Date-aware Validation**: Validasi cutoff time berdasarkan tanggal yang dipilih, bukan hari ini
- **Unique QR per Order**: Setiap pesanan mendapat QR code unik berbasis UUID

### ⏰ Shift Management
- **Multi-Shift Support**: Mendukung beberapa shift makan dalam satu hari
- **Flexible Configuration**: Admin dapat menambah, edit, dan menonaktifkan shift
- **Time-based Validation**: Validasi waktu check-in harus dalam rentang shift (dengan buffer 30 menit sebelum start)
- **Cutoff Time System**: Sistem pembatasan waktu pemesanan sebelum shift dimulai (configurable)
- **Department-based Shifts**: Departemen tertentu hanya bisa memesan shift yang ditentukan

### 🏢 Organizational Structure
- **3-Level Hierarchy**: Company → Division → Department
- **Department Shift Assignment**: Setiap department dapat memiliki allowed shifts yang berbeda
- **Auto-Migration Tool**: Import struktur organisasi otomatis dari data user yang sudah ada
- **Case-Insensitive Matching**: String matching tidak case-sensitive untuk department lookup
- **Fallback Mechanism**: Jika user tidak ter-link ke department ID, sistem akan mencari berdasarkan nama

### 🔐 Authentication & Security
- **JWT-based Authentication**: Token authentication dengan refresh mechanism
- **Role-based Access**: 3 level role (USER, CANTEEN, ADMIN)
- **Force Password Change**: User baru wajib ganti password saat login pertama
- **Admin Password Reset**: Admin dapat reset password user dengan konfirmasi
- **Secure Password Hashing**: bcrypt untuk hashing password

### 📱 QR Code System
- **Unique QR Generation**: Setiap order mendapat QR code unik
- **QR Scanner**: Admin/Canteen dapat scan QR code untuk check-in
- **Manual Check-in**: Alternative check-in manual dengan input external ID
- **QR Download**: User dapat download QR code dalam format PNG
- **Shift Validation**: QR hanya valid untuk shift dan tanggal yang sesuai

### 👥 User Management
- **Excel Import/Export**: Bulk import user dari Excel template
- **User CRUD**: Create, Read, Update, Deactivate users
- **Search & Filter**: Pencarian user berdasarkan nama, ID, company, department
- **Pagination**: Daftar user dengan pagination
- **Password Management**: Admin dapat reset password user
- **Strike System Integration**: Monitor jumlah strike per user

### 🚫 Blacklist & Strike System
- **Auto-Blacklist**: User otomatis di-blacklist setelah mencapai threshold strike
- **Configurable Strikes**: Admin set berapa kali no-show sebelum blacklist (default: 3)
- **Configurable Duration**: Durasi blacklist dapat diatur (default: 7 hari)
- **Manual Blacklist**: Admin dapat blacklist user secara manual dengan alasan
- **Strike Reduction**: Admin dapat mengurangi strike dengan konfirmasi password + alasan
- **Active Blacklist View**: Daftar user yang sedang di-blacklist
- **Audit Trail**: Semua aksi blacklist tercatat dengan alasan

### 📊 Dashboard & Statistics
- **Real-time Stats**: Statistik pesanan hari ini (total, picked up, pending, cancelled, no-show)
- **Company Breakdown**: Top 5 company berdasarkan jumlah order
- **Department Breakdown**: Top 5 department berdasarkan jumlah order
- **Shift Distribution**: Distribusi order per shift
- **Pickup Rate**: Persentase order yang sudah diambil
- **Risk Users**: Daftar user yang hampir kena blacklist
- **Holiday Indicator**: Menampilkan hari libur yang aktif hari ini

### 🔔 Real-time Notifications (SSE)
- **Live Updates**: Server-Sent Events untuk update real-time
- **Order Events**: Notifikasi saat order dibuat, di-cancel, di-pickup
- **User Events**: Notifikasi saat user di-blacklist atau unblacklist
- **Shift Events**: Notifikasi saat shift diubah
- **Settings Events**: Notifikasi saat pengaturan sistem diubah
- **Connection Status**: Indicator status koneksi SSE

### 📜 Order History
- **Complete History**: Riwayat semua pesanan user
- **Status Filter**: Filter berdasarkan status (Ordered, Picked Up, No Show, Cancelled)
- **Pagination**: Navigasi halaman untuk riwayat panjang
- **QR Display**: Tampilan QR code untuk order yang masih pending
- **Order Cancellation**: User dapat cancel order dari history (sebelum cutoff)

### 📆 Holiday Management
- **Full-day Holidays**: Libur untuk semua shift
- **Shift-specific Holidays**: Libur untuk shift tertentu saja
- **Active Status**: Enable/disable holiday tanpa hapus data
- **Validation**: Tidak bisa order pada tanggal libur
- **Calendar View**: Tampilan kalender untuk manajemen libur

### ⚙️ System Settings
- **Cutoff Hours**: Pengaturan berapa jam sebelum shift harus order (0-24 jam)
- **Blacklist Strikes**: Jumlah strike sebelum blacklist (1-10)
- **Blacklist Duration**: Lama durasi blacklist dalam hari (1-365)
- **Max Order Days Ahead**: Maksimal hari ke depan untuk order (1-30)
- **NTP Configuration**: Sinkronisasi waktu dengan NTP server
- **Timezone Support**: Support berbagai timezone Asia/Pasifik

### 🕐 NTP Time Synchronization
- **Multiple NTP Servers**: Support berbagai NTP server (Google, Cloudflare, pool.ntp.org, dll)
- **HTTP Fallback**: Fallback ke HTTP time API jika NTP gagal
- **Auto Sync**: Sinkronisasi otomatis dengan interval yang dapat diatur
- **Manual Sync**: Tombol sync manual untuk admin
- **Offset Display**: Menampilkan offset waktu dalam milliseconds
- **Timezone Configuration**: Pengaturan timezone server

### 📄 Export & Reports
- **Excel Export**: Export transaksi order ke Excel
- **Date Range**: Export berdasarkan range tanggal
- **Complete Data**: Include user, shift, status, timestamps
- **User Template**: Template Excel untuk import user baru
- **Formatted Columns**: Excel dengan format dan styling

### 📝 Audit Log
- **Comprehensive Logging**: Log semua aktivitas penting
- **User Actions**: Login, logout, password change, order created/cancelled
- **Admin Actions**: User management, blacklist actions, settings changes
- **Timestamp**: Semua log dengan timestamp akurat
- **Filter by Action**: Filter log berdasarkan jenis aksi
- **Search**: Pencarian dalam audit log

---

## User Interface

### 🎨 Design System
- **Modern Dark Theme**: UI dengan tema dark yang modern dan eye-friendly
- **Glass Morphism**: Efek glass pada card dan panel
- **Gradient Accents**: Gradient cyan-blue untuk highlights
- **Smooth Animations**: Transisi dan animasi yang halus
- **Responsive Layout**: Support desktop dan mobile
- **Icon System**: Lucide React icons yang konsisten

### 📱 User Experience
- **Intuitive Navigation**: Sidebar navigation yang mudah dipahami
- **Toast Notifications**: Feedback visual untuk setiap aksi
- **Loading States**: Indicator loading untuk async operations
- **Error Handling**: Pesan error yang jelas dan helpful
- **Confirmation Dialogs**: Konfirmasi untuk aksi penting
- **Empty States**: Pesan yang jelas saat tidak ada data

### 🌐 Localization
- **Bahasa Indonesia**: UI dalam Bahasa Indonesia
- **Date Formatting**: Format tanggal DD/MM/YYYY
- **Time Formatting**: Format waktu 24-jam
- **Number Formatting**: Format angka Indonesia

---

## Technical Architecture

### Backend
- **Runtime**: Node.js v18+
- **Framework**: Express.js
- **Database**: PostgreSQL 14+
- **ORM**: Prisma 5.x
- **Authentication**: JWT with bcrypt
- **Real-time**: Server-Sent Events (SSE)
- **File Handling**: ExcelJS for Excel operations
- **QR Generation**: qrcode library
- **Time Sync**: NTP client with HTTP fallback

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **State Management**: Context API
- **QR Display**: qrcode.react
- **Icons**: Lucide React
- **Notifications**: react-hot-toast
- **Date Handling**: date-fns

### Deployment
- **Containerization**: Docker & Docker Compose
- **Development**: Hot reload for both frontend and backend
- **Production**: Optimized builds dengan environment variables
- **Database**: PostgreSQL in Docker container
- **Reverse Proxy Ready**: Nginx configuration included

---

## Security Features

✅ **Password Security**
- Bcrypt hashing dengan salt rounds
- Force password change untuk user baru
- Admin password confirmation untuk aksi sensitif

✅ **Access Control**
- Role-based authorization
- JWT token expiration
- API endpoint protection dengan middleware

✅ **Data Validation**
- Input validation di backend
- SQL injection prevention (Prisma ORM)
- XSS protection

✅ **Audit Trail**
- Comprehensive logging semua aksi admin
- Audit log untuk blacklist dengan alasan
- Timestamp akurat dengan NTP sync

---

## Known Issues & Limitations

⚠️ **Version 1.0 Limitations**:
- QR scanner requires camera permissions
- Excel import requires specific column format
- No email notifications (planned for v1.1)
- No bulk order operations
- No calendar view for orders (planned for future)

---

## Migration & Setup

### Database Migration
```bash
cd backend
npx prisma migrate deploy
npx prisma db seed
```

### Initial Admin User
Default credentials created by seed:
- Username: `admin`
- Password: `admin123`
⚠️ **Change this immediately after first login!**

### Environment Variables
Required variables documented in `.env.example`:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret for JWT signing
- `PORT`: Backend port (default: 3012)
- `VITE_API_URL`: Frontend API URL

---

## Upcoming Features (Roadmap)

🔮 **Planned for v1.1**:
- Email notifications untuk order confirmation
- SMS notifications (optional)
- Export reports to PDF
- Advanced analytics dashboard
- Bulk order operations
- Calendar view for multi-day orders

🔮 **Future Considerations**:
- Mobile app (React Native)
- WhatsApp integration
- Menu customization per shift
- Dietary preferences
- Cost tracking & budgeting

---

## Contributors

Developed by Vibe Team with ❤️

---

## License

Proprietary - All rights reserved © 2024 Vibe Catering Management System

---

**For support or questions, please contact your system administrator.**
