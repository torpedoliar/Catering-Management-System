# Progres Redesign UI — Catering Management System

Acuan utama: `docs/redesign/SPEC.md` dan `docs/redesign/mockups/*.dc.html`.

---

## Rencana per Fase

### Fase 1 — Fondasi (Token, Komponen UI, Motion, App Shell)
- **Target:** `frontend/tailwind.config.js`, `frontend/src/index.css` (CSS variables & utilitas baru tanpa menghapus override lama), `frontend/src/components/ui/` (Button, Field/Input/Select/Textarea, Badge, Card, PageHeader, StatTile, ProgressBar, Tabs, SegmentedControl, DataTable, Pagination, EmptyState, Skeleton, Modal, Drawer, BarChart, toast style), `frontend/src/components/Layout/` (App Shell baru: sidebar berkelompok + mode rail 72 px, header breadcrumb/Ctrl+K/status/notifikasi/profil/chip batas pesan USER, nav bawah HP untuk USER, drawer mobile untuk role lain), `frontend/src/App.tsx` (`MotionConfig reducedMotion="user"`, transisi halaman kecuali Check-in, Toast baru).
- **Dependensi:** Tambah `framer-motion`.

### Fase 2 — Halaman Karyawan
- **Target:** `OrderPage.tsx` (`/` — mengikuti `Pesan.dc.html` & `PesanMobile.dc.html`), `HistoryPage.tsx` (`/history` — mengikuti `Riwayat.dc.html` + server-side pagination & tab status), `FoodMenuPage.tsx` (`/menu`), `SettingsPage.tsx` (`/settings`), `AboutPage.tsx` (`/about`), `TermsPage.tsx` (`/terms`), `LoginPage.tsx` (`/login`), `KioskPage.tsx` (`/kiosk`).

### Fase 3 — Operator Kantin & Vendor
- **Target:** Halaman baru `CanteenDashboardPage.tsx` (`/canteen` — mengikuti `DashOperator.dc.html`), endpoint backend `GET /api/orders/stats/canteen-live` (Fake-UTC `getNow()`, cache 3 detik), selaraskan token & shell `CheckInPage.tsx` (`/canteen/checkin` — **tanpa mengubah logika antrean/scan/isolasi PC/popup/suara/fokus**), `VendorDashboardPage.tsx` (`/vendor` — mengikuti `Rekap.dc.html`), `VendorPickupStatsPage.tsx` (`/vendor/pickup-stats`).

### Fase 4 — Halaman Admin
- **Target:** `DashboardPage.tsx` (`/admin/dashboard` — `Main.dc.html`), `CostAnalysisPage.tsx` (`/admin/costs` — `DashAnalitik.dc.html`), `UserManagementPage.tsx` (`/admin/users` — `Pengguna.dc.html` + filter `role` kompatibel ke belakang di backend), `WeeklyMenuPage.tsx` (`/admin/weekly-menu` — `MenuMingguan.dc.html`), serta migrasi halaman tabel/ringkasan/form lainnya (`OrderListPage`, `CalendarPage`, `MessagesPage`, `AnnouncementPage`, `CompanyManagementPage`, `CanteenManagementPage`, `ShiftConfigPage`, `BlacklistPage`, `VendorManagementPage`, `ExportPage`, `AuditLogPage`, `TimeSettingsPage`, `SecurityPage`, `EmailSettingsPage`, `BrandingSettingsPage`, `UserAgreementPage`, `PerformancePage`, `UptimeHistoryPage`, `BackupRestorePage`, `UpdatePage`).

### Fase 5 — Pembersihan & Audit Akhir
- **Target:** Hapus seluruh override CSS tema gelap lama di `frontend/src/index.css` (`[class*="text-white"]`, `[class*="bg-white/"]`, `[class*="text-slate-…"]`, `.card .text-white`, override responsif paksa, dll.), hapus file/kelas lama yang tidak terpakai (`Sidebar.tsx` jika sudah digantikan), dan audit visual seluruh halaman di `1366×768`, `1280×720`, dan `390×844`.

---

## Status Saat Ini

- **Fase 1:** Selesai (`done`) — 27 November 2026
- **Fase 2:** Menunggu konfirmasi & mulai berikutnya
- **Fase 3:** Menunggu
- **Fase 4:** Menunggu
- **Fase 5:** Menunggu

### Ringkasan Hasil Fase 1
- **Token & CSS (`frontend/tailwind.config.js`, `frontend/src/index.css`):** Token warna v2 (`brand`, `brand-strong`, `brand-soft`, `brand-tint`, `sidebar`, `ink`, `muted`, `line`, `canvas`, `surface-2`, `semantic.*`) ditambahkan ke Tailwind & `:root`, plus animasi shimmer `.sk-shimmer`. Token dan override lama dipertahankan hingga Fase 5.
- **Komponen UI (`frontend/src/components/ui/`):** `Button`, `Field`/`Input`/`Select`/`Textarea`, `Badge` (`OrderStatusBadge`, `RoleBadge`), `Card`, `PageHeader`, `StatTile` (count-up 400 ms), `ProgressBar`, `Tabs` (underline `layoutId`), `SegmentedControl` (pill `layoutId`), `DataTable` (cari debounce 300 ms, filter, reset, sort, checkbox/bulk bar, aksi baris `⋯`, skeleton, empty state), `Pagination` (mode admin/user, ellipsis, "Ke hal."), `EmptyState`, `Skeleton`, `Modal` (focus trap + Esc), `Drawer`, `BarChart`, `AppToaster` (toast kartu putih + titik status).
- **Motion & App Shell (`frontend/src/App.tsx`, `frontend/src/components/Layout/`):** `MotionConfig reducedMotion="user"`, transisi halaman `fade + y:8` 180 ms (dilewati di `/canteen/checkin`), sidebar `#0f172a` 248 px berkelompok per role (`navConfig.ts`) + rail 72 px (default ciut di `/canteen/checkin`), header 64 px (breadcrumb, tombol Ctrl K `CommandPalette`, chip batas pesan besok untuk USER, status SSE `Live · N terhubung` / `Terputus`, `NotificationBell`, dropdown profil), dan `MobileBottomNav` untuk USER di `< 768 px`.
- **Verifikasi:**
  - `cd frontend && npm run build`: lolos (0 error).
  - `cd frontend && npm run lint`: 0 error, 147 warning lama di halaman lain; 0 warning pada seluruh file baru/diubah di Fase 1.
  - Uji Playwright headless Chrome (dengan stub `/api/*` karena server lokal tidak aktif) pada viewport `1366×768`, `1280×720`, dan `390×844` untuk role `ADMIN`, `USER`, dan `CANTEEN`: 0 console/page error, 0 horizontal overflow, Ctrl+K berfungsi, collapse rail 72 px & default Check-in 72 px berfungsi, bottom nav USER muncul di `390×844`.
  - Backend tidak disentuh pada Fase 1.

---

## Pertanyaan & Keputusan yang Perlu Konfirmasi (Fase 1)

1. **Rute `/canteen` (Dashboard Kantin) sebelum Fase 3:**
   - `SPEC.md` §3 mencantumkan item sidebar `Dashboard Kantin → /canteen`, tetapi halaman dan endpoint `canteen-live` baru dibuat pada Fase 3.
   - Keputusan sementara di Fase 1: menambahkan `<Route path="/canteen" element={<Navigate to="/canteen/checkin" replace />} />` agar klik menu tidak jatuh ke fallback `* -> /`, dan siap diganti `CanteenDashboardPage` di Fase 3. Mohon konfirmasi apakah ini sesuai atau lebih baik menu `/canteen` disembunyikan sampai Fase 3.
2. **Badge jumlah menunggu di menu `Pesan & Sanggahan` (`/admin/messages`):**
   - `SPEC.md` §3 menyebut badge jumlah menunggu di sidebar admin. Saat ini `GET /api/messages` belum memiliki filter `status` atau endpoint ringkas jumlah `PENDING` (mengembalikan `pagination.total` semua pesan).
   - Keputusan sementara di Fase 1: slot badge sudah disiapkan di komponen sidebar; angkanya akan dihubungkan setelah penambahan filter `status=PENDING` yang kompatibel ke belakang di backend (Fase 4 atau sesuai arahan).
3. **Chip "Batas pesan besok: ..." di header USER saat `cutoffMode === 'per-shift'`:**
   - Dalam mode `weekly`, `weeklyCutoffTime` memberikan satu waktu batas yang jelas. Dalam mode `per-shift`, tiap shift punya `cutoffTime` berbeda.
   - Keputusan sementara di Fase 1: menampilkan cutoff terdekat yang masih aktif (atau cutoff pertama besok) dari `/api/shifts/for-user?date=<besok>` menggunakan helper Fake-UTC `dateHelpers.ts`. Mohon konfirmasi apakah format `"Batas pesan besok: hari ini HH:MM"` cukup mengambil shift paling awal atau perlu teks khusus saat ada beberapa shift.
4. **Menu `Akun` di navigasi bawah HP (`< 768 px`) untuk USER:**
   - `PesanMobile.dc.html` menampilkan 4 tab: `Pesan`, `Menu`, `Riwayat`, `Akun`. Sementara `SPEC.md` §3 memindahkan `Pengaturan`, `Tentang`, `Syarat & Ketentuan`, dan `Keluar` ke menu profil.
   - Keputusan sementara di Fase 1: tab `Akun` di bottom nav membuka sheet/drawer ringkas Akun (berisi Pengaturan, Tentang, Syarat & Ketentuan, dan Keluar) agar pengguna HP bisa mengakses semuanya dengan mudah tanpa kehilangan tombol Keluar.

---

## Catatan Implementasi & Perbedaan Disengaja

- Karena `frontend/src/index.css` masih memuat override global `[class*="text-white"]`, `[class*="bg-white/"]`, `[class*="text-slate-…"]`, dan `[class*="rounded-2xl"]` hingga Fase 5, seluruh komponen baru di `components/ui/` dan `components/Layout/` memakai warna hex eksplisit (mis. `text-[#fff]`, `bg-[#0f172a]`, `rounded-[14px]`) agar tampilan identik dengan mockup tanpa terpengaruh override lama.
- Sidebar tetap memiliki penyesuaian role untuk `VENDOR`: sesuai `CLAUDE.md` dan `App.tsx`, `VENDOR` dibatasi hanya ke `/vendor` dan `/vendor/pickup-stats` (serta rute akun `/settings`, `/about`, `/terms`) sehingga grup `Karyawan` tidak ditampilkan untuk `VENDOR`.
