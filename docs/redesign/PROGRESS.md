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

- **Fase 1:** Selesai (`done`) — commit `fbee36f`
- **Fase 2:** Selesai (`done`) — commit `eb287a4`
- **Fase 3:** Selesai (`done`) — commit `5680f3e`
- **Fase 4:** Selesai (`done`) — 27 November 2026
- **Fase 5:** Sedang dikerjakan (`in_progress`)

### Ringkasan Hasil Fase 4
- **Backend (kompatibel ke belakang):**
  - `backend/src/routes/user.routes.ts` & `backend/src/types/index.ts`: menambah filter opsional `role` (`USER | ADMIN | CANTEEN | VENDOR`) dan `status=blacklisted` pada `GET /api/users`.
  - `backend/src/routes/message.routes.ts`: menambah filter opsional `status` (`PENDING | APPROVED | REJECTED`) pada `GET /api/messages` untuk filter admin dan badge pending di sidebar (`Layout.tsx`).
- **Frontend — Halaman Admin & Shell:**
  - 4 halaman dengan mockup: `DashboardPage.tsx` (`Main.dc.html`: 5 `StatTile`, kartu istirahat + `ProgressBar`, order per kantin, rekap departemen/perusahaan, order terbaru/besok, user berisiko), `CostAnalysisPage.tsx` (`DashAnalitik.dc.html`: 4 `StatTile`, banner peringatan otomatis jika waste > 15%, `BarChart` 7 hari, porsi no-show per shift, tabel biaya), `UserManagementPage.tsx` (`Pengguna.dc.html`: `DataTable` search/4 filter/sort/selection/bulk actions/row actions `⋯`, `Pagination variant="admin"` `[10,25,50,100]` + "Ke hal."), `WeeklyMenuPage.tsx` (`MenuMingguan.dc.html`: jadwal 7 hari × jam istirahat + panel samping "Atur menu", salin minggu lalu, katalog berpaginasi).
  - 20 halaman tabel/ringkasan/form lainnya: `OrderListPage`, `MessagesPage`, `AuditLogPage`, `BlacklistPage`, `CompanyManagementPage`, `CanteenManagementPage`, `VendorManagementPage`, `ShiftConfigPage`, `CalendarPage`, `AnnouncementPage`, `ExportPage`, `TimeSettingsPage`, `SecurityPage`, `EmailSettingsPage`, `BrandingSettingsPage`, `UserAgreementPage`, `PerformancePage`, `BackupRestorePage`, `UptimeHistoryPage`, `UpdatePage` (mengganti dialog `confirm()` bawaan browser dengan `Modal` v2 serta helper tanggal Fake-UTC `dateHelpers.ts`).
  - `EmptyState.tsx` mendukung prop opsional `icon`, dan `Layout.tsx` terhubung ke badge jumlah sanggahan `PENDING`.
- **Verifikasi:** `backend` build lolos, `frontend` build lolos, `eslint --max-warnings 0` pada seluruh 26 file Fase 4 (0 error, 0 warning), audit Playwright (`1366×768` & `390×844`) melintasi 24 rute admin (48 pengecekan) lolos tanpa redirect/error/overflow horizontal.

### Ringkasan Hasil Fase 3
- **Backend (`backend/src/routes/order/stats.ts`):** Endpoint baru `GET /api/orders/stats/canteen-live?canteenId=` (`authMiddleware, canteenMiddleware`), memakai Fake-UTC (`getNow()`, `getToday()`, `getTomorrow()`), cache Redis 3 detik, jendela istirahat aktif/mendatang, bucket 10 menit, agregat per `checkedInBy`, dan jadwal istirahat hari ini.
- **Frontend:**
  - `CanteenDashboardPage.tsx` (`/canteen` — `DashOperator.dc.html`): kartu gelap hero + sisa menit + progres + tombol "Buka Check-in", grafik pengambilan per 10 menit, per pos check-in ("Diam N mnt" > 15 menit saat aktif), jadwal istirahat hari ini.
  - `CheckInPage.tsx` (`/canteen/checkin`): penyelarasan token dan radius tanpa mengubah logika antrean/scan/isolasi/popup/suara/fokus.
  - `VendorDashboardPage.tsx` (`/vendor` — `Rekap.dc.html`): 4 `StatTile`, tab per kantin ("Semua kantin" + tiap kantin), tabel hari × jam istirahat dengan sorotan hari ini & footer total minggu.
  - `VendorPickupStatsPage.tsx` (`/vendor/pickup-stats`): filter tanggal, 4 `StatTile`, kartu progres per jam istirahat.
- **Verifikasi:** `backend` build lolos, `frontend` build + lint 0 error/warning di file Fase 3, Playwright cek 7 kombinasi (`/canteen`, `/canteen/checkin`, `/vendor`, `/vendor/pickup-stats`) di `1366×768` & `390×844` lolos tanpa overflow atau error.

### Ringkasan Hasil Fase 2
- **Halaman diubah:**
  - `OrderPage.tsx` (`/` — `Pesan.dc.html` & `PesanMobile.dc.html`): alur 3 langkah (pilih tanggal, shift, kantin) + ringkasan kanan desktop, header gelap & kartu makan hari ini + geser tanggal & CTA tetap di HP `< 768 px`, helper Fake-UTC `dateHelpers.ts`, barcode + batal pesanan modal.
  - `HistoryPage.tsx` (`/history` — `Riwayat.dc.html`): tab status dengan jumlah, filter periode, blok tanggal, badge status, aksi kontekstual (Batalkan / Ajukan sanggahan / Kirim komplain), pagination user `[8, 20, 50]` sinkron URL.
  - `FoodMenuPage.tsx` (`/menu`): navigasi minggu, kartu harian per jam istirahat, modal zoom/rotate foto menu.
  - `SettingsPage.tsx` (`/settings`), `AboutPage.tsx` (`/about`), `TermsPage.tsx` (`/terms`), `LoginPage.tsx` (`/login`), `KioskPage.tsx` (`/kiosk`).
- **Verifikasi:** `npm run build` lolos, `eslint` 0 error & 0 warning di seluruh file Fase 2, Playwright cek 15 kombinasi halaman/viewport (`1366×768`, `1280×720`, `390×844`) lolos tanpa overflow horizontal atau error runtime.

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
