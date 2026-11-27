# Spesifikasi Redesign UI — Catering Management System

Versi 1 · 27 November 2026 · Pemilik: Vian (ICT SJA)

Dokumen ini adalah acuan implementasi redesign frontend. **Mockup di `docs/redesign/mockups/` adalah sumber kebenaran visual**: warna, ukuran, jarak, teks, dan perilaku diambil dari sana. Bila dokumen ini dan mockup berbeda, ikuti mockup lalu catat perbedaannya.

Kanvas desain asli (hanya bisa dibuka pemilik): https://claude.ai/artifact/TTUaMRafcGUuu8ndmd47FQ

---

## 1. Peta mockup → halaman

| File mockup | Route | Role | Catatan |
| --- | --- | --- | --- |
| `Main.dc.html` | `/admin/dashboard` | ADMIN | Dashboard harian; juga contoh **app shell lengkap** (sidebar berkelompok + header) |
| `DashAnalitik.dc.html` | `/admin/costs` | ADMIN | Menggantikan "Analisis Biaya"; contoh **sidebar ciut (rail 72 px)** |
| `Pengguna.dc.html` | `/admin/users` | ADMIN | **Pola tabel data standar**: cari, filter, pilih massal, sort, pagination |
| `MenuMingguan.dc.html` | `/admin/weekly-menu` | ADMIN | Grid jam istirahat × hari + panel "Atur menu" + daftar menu berpagination |
| `DashOperator.dc.html` | `/canteen` (baru) | CANTEEN, ADMIN | Dashboard kantin; tombol utama ke `/canteen/checkin` |
| `Rekap.dc.html` | `/vendor` | VENDOR, ADMIN | Rekap order per minggu, tab per kantin |
| `Pesan.dc.html` | `/` | USER (semua role) | Alur 3 langkah + ringkasan pesanan |
| `PesanMobile.dc.html` | `/` di layar < 768 px | USER | Navigasi bawah, pilih tanggal geser, CTA tetap |
| `Riwayat.dc.html` | `/history` | USER | Tab status + daftar + **pola pagination daftar** |
| `Komponen.dc.html` | — | — | Token, komponen, dan **spesifikasi motion** |

Halaman yang **tidak** ada mockupnya (Kalender, Pesan & Sanggahan, Pengumuman, Vendor, Perusahaan, Kantin, Blacklist, Ekspor, Shift, Log Audit, Pengaturan Waktu, Keamanan, Email, Branding, Server/Backup/Uptime/Update, Statistik Pengambilan vendor, Lihat Menu, Pengaturan, Tentang, Syarat & Ketentuan, Login, Kiosk) **memakai pola yang sama**:

- Halaman berisi tabel memakai pola `Pengguna.dc.html`.
- Halaman berisi ringkasan dan grafik memakai pola `Main` / `DashAnalitik`.
- Halaman form memakai kartu putih + komponen Field dari `Komponen.dc.html`.

`/canteen/checkin` sudah didesain ulang (commit `75fcd28`) untuk layar 14 inci. **Jangan ubah logikanya**: antrean scan, isolasi per PC, popup, suara, dan fokus input. Cukup selaraskan token warna dan shell-nya.

### Cara membaca file `.dc.html`

Setiap file adalah satu halaman HTML dengan:

- **markup + `style` inline**: nilai visual yang persis (warna hex, px, radius, font-weight). Pindahkan ke kelas Tailwind atau komponen; jangan salin inline style mentah ke JSX kecuali untuk nilai dinamis.
- **`<sc-for list="{{x}}">` / `<sc-if value="{{y}}">`**: loop dan kondisi (setara `.map()` dan `&&` di React).
- **`{{nama}}`**: nilai dari `renderVals()` di `<script type="text/x-dc">` di bagian bawah file. Di sana ada data contoh, state (`this.state`), dan handler klik. Ini menunjukkan **perilaku** yang diharapkan (mis. toggle tanggal, ganti tab, pindah halaman).
- Data di mockup adalah contoh. Di kode semua data datang dari API yang ada.

---

## 2. Design tokens

Font: **Plus Jakarta Sans** (sudah dipakai). Angka statistik/tabel memakai `font-variant-numeric: tabular-nums` (`tabular-nums` di Tailwind).

| Token | Nilai | Dipakai untuk |
| --- | --- | --- |
| `brand` | `#f59e0b` (amber-500) | Tombol utama (**teks gelap `#1c1917`**, bukan putih), indikator aktif, bar progres utama |
| `brand-strong` | `#b45309` (amber-700) | Link, teks aksen, nomor langkah |
| `brand-soft` | `#fffbeb` (amber-50) + border `#f59e0b` 2 px | Kartu/opsi yang dipilih |
| `brand-tint` | `#fef3c7` / teks `#92400e` | Chip, badge peringatan, info batas waktu |
| `sidebar` | `#0f172a` | Sidebar; item aktif `rgba(245,158,11,.14)` + teks `#fbbf24` |
| `ink` | `#1c1917` (stone-900) | Teks utama; tombol "segmented" aktif |
| `muted` | `#78716c` (stone-500) | Teks bantu |
| `line` | `#e7e5e4` (stone-200); garis dalam `#f0efed` / `#f5f5f4` | Border kartu, pemisah baris |
| `canvas` | `#f7f7f5` | Latar halaman |
| `surface-2` | `#fafaf9` | Header tabel, footer pagination |
| success | `#15803d` / bg `#dcfce7` / teks `#166534` | Diambil, Online, Aktif |
| info | bg `#dbeafe` / teks `#1e40af` | Menunggu |
| danger | `#b91c1c` / bg `#fee2e2` / teks `#991b1b` | Tidak diambil, gagal, hapus |
| neutral | bg `#f5f5f4` / teks `#57534e` | Dibatalkan, nonaktif |

Radius: kartu 14 px, kontrol (button/input) 10 px, kontrol kecil 8–9 px, chip/badge 999 px.
Ukuran kontrol: tinggi 38–40 px (desktop), 44–50 px (HP / CTA). Target sentuh minimal 44 px di HP.
Tipografi: judul halaman 24/800 (`tracking-tight`), judul kartu 15–16/700, isi 13–14, bantu 12, angka KPI 26–30/800.
Kartu: `bg-white border border-[#e7e5e4] rounded-[14px] p-5`, **tanpa bayangan** (bayangan hanya untuk toast, modal, dropdown).
Tidak ada gradient, glow, atau emoji di UI.

### Wajib dibereskan: override CSS lama

`frontend/src/index.css` berisi override global dari tema gelap lama, misalnya `[class*="text-white"] { color: … !important }`, `[class*="bg-white/"]`, `[class*="text-slate-…"]`, dan `.card .text-white`. Override ini membuat kelas Tailwind tidak bekerja sebagaimana mestinya.

- Komponen baru **tidak boleh** bergantung pada override itu.
- Setelah semua halaman pindah ke komponen baru, **hapus override tersebut** lalu cek ulang setiap halaman.
- Sampai saat itu, untuk teks putih di atas warna gunakan `text-[#fff]` (tidak kena selector `text-white`).

Masukkan token ke `tailwind.config.js` (`theme.extend.colors`) dan CSS variables di `:root`. Jangan menghapus nama token lama yang masih dipakai halaman yang belum dimigrasi.

---

## 3. App shell

Acuan: `Main.dc.html` (sidebar lebar 248 px) dan `Pengguna.dc.html` / `DashAnalitik.dc.html` / `MenuMingguan.dc.html` (rail 72 px).

**Sidebar** (`#0f172a`), dikelompokkan per role. Grup hanya muncul bila role-nya berhak:

| Grup | Item → route | Role |
| --- | --- | --- |
| Karyawan | Pesan Makanan `/`, Lihat Menu `/menu`, Riwayat `/history` | semua |
| Operasional | Dashboard `/admin/dashboard`, Dashboard Kantin `/canteen`, Check-in `/canteen/checkin`, Kalender `/admin/calendar`, Pesan & Sanggahan `/admin/messages` (badge jumlah menunggu), Pengumuman `/admin/announcements` | ADMIN; CANTEEN hanya Dashboard Kantin + Check-in |
| Laporan | Analitik Biaya `/admin/costs`, Rekap Vendor `/vendor`, Statistik Pengambilan `/vendor/pickup-stats`, Ekspor `/admin/export`, Log Audit `/admin/audit-log` | ADMIN; VENDOR hanya Rekap + Statistik |
| Data Master | Pengguna, Perusahaan, Kantin, Shift, Blacklist, Vendor, Menu Mingguan | ADMIN |
| Sistem | Pengaturan Waktu, Keamanan, Email, Branding, Syarat & Ketentuan, Performa, Uptime, Backup, Update | ADMIN |

- "Syarat & Ketentuan" hanya muncul **satu kali**: di menu akun untuk user, dan di Sistem untuk admin (edit).
- Pengaturan akun (Pengaturan, Tentang, Keluar) dipindah ke menu profil di header.
- Tombol ciutkan menyimpan status di `localStorage` (`sidebar-collapsed`, sudah ada). Mode ciut = rail 72 px, ikon 20 px, tooltip label, `aria-label` pada link.
- Halaman Check-in membuka sidebar dalam mode ciut secara default, untuk memberi ruang di layar 14 inci.

**Header** (64 px, putih, border bawah):

- Breadcrumb (grup / halaman).
- Pencarian global "Cari menu, karyawan, pesanan…" dengan pintasan Ctrl K: command palette untuk lompat ke halaman. Pencarian data cukup diarahkan ke halaman terkait.
- Status koneksi "Live · N terhubung" (hijau) atau "Terputus" (merah).
- Lonceng notifikasi dan profil (nama + role).
- Untuk USER, header menampilkan chip "Batas pesan besok: hari ini HH:MM", diambil dari setting cutoff.

**HP (< 768 px)**: sidebar diganti navigasi bawah untuk USER (Pesan, Menu, Riwayat, Akun), sesuai `PesanMobile.dc.html`. Untuk role lain, sidebar menjadi drawer.

---

## 4. Komponen (`frontend/src/components/ui/`)

Buat sekali, pakai di semua halaman. Semua teks UI dalam Bahasa Indonesia.

- **Button**: `primary` (amber, teks gelap), `secondary` (putih + border), `ghost` (teks amber-700), `danger` (merah, teks putih), `disabled`, `loading` (spinner + teks "Menyimpan…"). Ukuran `sm`/`md`/`lg`.
- **Field / Input / Select**: label di atas (12/600). Error: border merah 2 px, `aria-invalid`, pesan di bawah.
- **Badge**: peta status pesanan → warna (Menunggu, Diambil, Tidak diambil, Dibatalkan, Perlu dicek). Selalu teks + warna.
- **Card**, **PageHeader** (judul + subjudul + slot aksi di kanan), **StatTile** (label + angka + sub), **ProgressBar**.
- **Tabs**: dengan angka di badge kecil; underline aktif bergerak (`layoutId`). **SegmentedControl** untuk periode (Hari ini / 7 hari / Bulan ini / Kustom).
- **DataTable**:
  - toolbar (cari dengan debounce 300 ms, filter select, Reset);
  - header bisa di-sort (ikon arah);
  - checkbox per baris + "pilih semua";
  - **bulk bar** gelap saat ada yang dipilih (jumlah + aksi + "Batal pilih");
  - menu aksi baris (⋯);
  - baris terpilih ber-latar `#fffbeb`;
  - state kosong dan skeleton loading;
  - scroll horizontal di layar sempit.
- **Pagination**:
  - "Menampilkan **x–y** dari **z**";
  - pilihan per halaman (10/25/50/100 untuk tabel admin, 8/20/50 untuk daftar user);
  - tombol halaman dengan elipsis (1 2 3 … N), ‹ ›, dan input "Ke hal." (tabel admin);
  - sinkron ke URL `?page=&limit=` supaya bisa dibagikan dan tombol back tetap bekerja.
- **EmptyState**: judul + 1 kalimat petunjuk (tanpa ilustrasi besar). **Skeleton**: shimmer, bentuk mengikuti konten.
- **Toast**: tampilan ulang dari `react-hot-toast`: kartu putih, titik warna, judul + isi, bayangan lembut.
- **Modal / Drawer**: Framer Motion, fokus terkunci, Esc menutup, `aria-modal`.
- **Grafik**: bar sederhana dengan div/CSS seperti di mockup (tanpa library chart baru). Angka di atas bar, label di bawah, bar hari ini disorot amber.

---

## 5. Motion (Framer Motion)

Tambahkan dependensi `framer-motion`. Bungkus app dengan `<MotionConfig reducedMotion="user">` agar mengikuti pengaturan "kurangi animasi" di sistem.

| Momen | Gerak | Durasi | Easing |
| --- | --- | --- | --- |
| Pindah halaman | fade + naik 8 px (`AnimatePresence` di outlet layout) | 180 ms | `[0.2, 0.8, 0.2, 1]` |
| Daftar / baris tabel | stagger 20 ms, maks. 10 baris pertama | 160 ms | easeOut |
| Modal & drawer | skala 0.98→1 + fade; drawer geser dari kanan | 200 ms | spring(400, 32) |
| Tab & filter aktif | underline/latar bergeser (`layoutId`) | 220 ms | spring(500, 40) |
| Angka KPI | hitung naik ke nilai baru | 400 ms | easeOut |
| Toast | masuk dari bawah, keluar fade | 200 / 150 ms | easeOut |
| Popup check-in | pop 0.96→1, tanpa delay | 140 ms | easeOut |

Aturan: animasi tidak boleh menunda input. Di halaman Check-in tidak ada transisi halaman yang memblokir scanner.

---

## 6. Rincian per halaman

**`/admin/dashboard`** (`Main.dc.html`)
- SegmentedControl periode.
- 5 StatTile: Total order, Sudah diambil, Menunggu, Tidak diambil, Diblacklist.
- Kartu "Pengambilan per waktu istirahat": 3 kolom, status Berjalan/Akan datang, progres, "Belum diambil" / "Tidak diambil".
- Baris bawah: Order per kantin (bar), Rekap per departemen (tabel ringkas + "Lihat semua"), Order terbaru (avatar inisial + badge).
- Data: `/api/orders/stats/today` dan endpoint dashboard yang ada.

**`/admin/costs`** (`DashAnalitik.dc.html`)
- 4 StatTile: Total biaya, Biaya termanfaatkan, Kerugian, Waste rate dengan target.
- **Kotak peringatan** dibuat otomatis bila waste rate > 15%: sebut shift penyumbang kerugian terbesar.
- Grafik order per hari dalam minggu berjalan.
- Daftar "Porsi tidak diambil per shift", diurutkan dari kerugian terbesar. Warna bar: ≥50% merah, ≥15% amber, sisanya hijau.

**`/admin/users`** (`Pengguna.dc.html`)
- DataTable penuh.
- Filter: Perusahaan, Departemen, Role, Status.
- Aksi massal: Nonaktifkan, Reset strike, Reset password, masing-masing dengan konfirmasi.
- Kolom: Nama (+ID mono), Perusahaan, Departemen, Role (badge), Strike (0 abu, 1–2 amber, ≥3 merah), Status (titik + teks), Aksi.
- Pagination server-side: endpoint sudah mendukung `page`, `limit`, `search`, `company`, `department`, `status`. Filter `role` belum ada; tambahkan secara kompatibel ke belakang.

**`/admin/weekly-menu`** (`MenuMingguan.dc.html`)
- Navigasi minggu, "Salin dari minggu lalu", "+ Menu baru".
- Grid: baris = jam istirahat (dengan daftar shift), kolom = 7 hari; kolom hari ini disorot.
- Slot terisi: foto menu (pakai `imageUrl` yang ada), nama 3 baris maks., vendor. Slot kosong: border putus-putus "+ Atur menu".
- Klik slot → panel kanan "Atur menu": cari menu, pilih (radio), shift yang berlaku, Simpan / Kosongkan.
- Di bawah grid: daftar menu (kartu kecil, cari, filter vendor, pagination).

**`/canteen`** baru (`DashOperator.dc.html`)
- Kartu gelap utama untuk jam istirahat yang berjalan: sisa waktu, "X dari Y sudah diambil", progres, rata-rata orang/menit, tombol besar "Buka Check-in".
- Grafik pengambilan per 10 menit.
- "Per pos check-in": jumlah per akun counter (`checkedInBy`) dan waktu scan terakhir. Tandai "Diam N mnt" bila > 15 menit tanpa scan saat istirahat berjalan.
- Jadwal istirahat hari ini.
- **Butuh endpoint baru** (fase terpisah): `GET /api/orders/stats/canteen-live?canteenId=` (CANTEEN/ADMIN) yang mengembalikan jendela istirahat aktif, total/diambil, bucket 10 menit, dan agregat per `checkedInBy`. Wajib Fake-UTC (`getNow()`); jangan pakai `new Date()` untuk logika bisnis. Dengan cache singkat (3 detik), seperti `stats/today?fresh=1`.

**`/vendor`** (`Rekap.dc.html`)
- Navigasi minggu, Ekspor Excel, 4 StatTile.
- Tab per kantin ("Semua kantin" + tiap kantin, dengan total), menggantikan tabel yang ditumpuk.
- Tabel: hari × jam istirahat; baris hari ini disorot; footer total minggu; catatan bahwa angka berubah sampai batas pesan.

**`/` Pesan Makanan** (`Pesan.dc.html`, `PesanMobile.dc.html`)
- Langkah 1, tanggal: grid kartu. Status per kartu: Tersedia / Dipilih / Lewat batas / Libur / Sudah dipesan (yang dinonaktifkan tidak bisa diklik). Ada "Pilih semua" / "Hapus pilihan".
- Langkah 2, shift: kartu radio, jam kerja + jam istirahat.
- Langkah 3, kantin: kartu + sisa kuota. Kantin yang tidak melayani shift ditampilkan nonaktif dengan alasannya.
- Ringkasan di kanan (desktop) atau CTA tetap di bawah (HP): tanggal, shift, kantin, chip tanggal, tombol "Pesan N hari", catatan pelanggaran.
- Versi HP juga punya kartu "Makan hari ini" + "Lihat QR" di header.

**`/history`** (`Riwayat.dc.html`)
- Tab status dengan jumlah (Semua, Menunggu, Diambil, Tidak diambil, Dibatalkan) dan pilihan periode.
- Baris: blok tanggal, hari · shift, istirahat · kantin, badge, aksi kontekstual (Menunggu → Batalkan; Tidak diambil → Ajukan sanggahan).
- Pagination dari `/api/orders/my-orders` (`page`, `limit`, `status`).
- State kosong per tab.

---

## 7. Pagination per endpoint

| Halaman | Endpoint | Status |
| --- | --- | --- |
| Pengguna | `GET /api/users` | sudah ada `page`, `limit`, filter |
| Riwayat | `GET /api/orders/my-orders` | sudah ada `page`, `limit`, `status` |
| Pesan & Sanggahan | `GET /api/messages`, `/my-messages` | sudah ada `page`, `limit` |
| Log Audit | `GET /api/audit…` | cek; tambahkan bila belum |
| Daftar menu, Blacklist, Perusahaan, Kantin, Vendor | — | belum: paginasi di klien dulu (data kecil). Endpoint server ditambahkan di fase terpisah bila perlu |

Penambahan parameter pagination di backend harus **kompatibel ke belakang**: tanpa `page`/`limit`, respons tetap sama seperti sekarang, karena aplikasi Android lama masih memakainya.

---

## 8. Batasan

- Ikuti `CLAUDE.md` di root repo: Fake-UTC, helper tanggal, VENDOR dibatasi, header keamanan di proxy, Bahasa Indonesia untuk teks UI.
- Jangan mengubah perilaku API yang sudah ada. Endpoint baru hanya yang disebut di dokumen ini.
- Jangan menyentuh logika `CheckInPage.tsx` (antrean, isolasi, popup, fokus). Hanya shell dan token.
- Aksesibilitas:
  - elemen interaktif memakai `<button>` / `<a>` / `<input>` asli;
  - tombol ikon diberi `aria-label`;
  - kontras teks ≥ 4.5:1;
  - status tidak boleh hanya dibedakan dengan warna;
  - fokus keyboard terlihat (ring amber).
- Responsif: desktop 1280–1440 px, laptop 14 inci (1366×768 dan 1280×720 setelah scaling), HP 390 px.
- Tidak menambah library selain `framer-motion` tanpa izin.

## 9. Fase dan definisi selesai

1. **Fondasi**: token, Tailwind, komponen `ui/`, MotionConfig, app shell (sidebar berkelompok + rail, header, nav bawah HP).
2. **Karyawan**: Pesan Makanan (desktop + HP), Riwayat, Lihat Menu, Pengaturan.
3. **Operator & vendor**: Dashboard Kantin (UI dulu, lalu endpoint `canteen-live`), selaraskan Check-in ke shell baru, Rekap Vendor, Statistik Pengambilan.
4. **Admin**: Dashboard, Analitik Biaya, Pengguna, Menu Mingguan, lalu semua halaman tabel/form lain dengan pola yang sama.
5. **Pembersihan**: hapus override CSS lama di `index.css`, hapus komponen/kelas yang tidak terpakai, audit tampilan semua halaman.

Setiap fase dianggap selesai bila:

- `npm run build` (frontend dan backend) lolos;
- `npm run lint` (frontend) tanpa error baru;
- halaman yang disentuh dicek di 1366×768 dan 390×844;
- tidak ada regresi fitur (pesan, batal, check-in, ekspor);
- satu commit per fase, pesan commit menjelaskan halaman yang berubah.
