# Prompt untuk agent implementasi

Salin seluruh blok di bawah ke agent coding (Claude Code atau sejenisnya) yang dijalankan di root repo `Catering-Management-System`.

---

```text
Kamu mengerjakan redesign UI frontend Catering Management System (React + Vite + TypeScript + Tailwind, backend Express + Prisma). Aplikasi ini SUDAH PRODUCTION di PT Santos Jaya Abadi, dipakai karyawan (web + Android/Capacitor), operator kantin di PC 14 inci dengan scanner barcode USB, vendor, dan admin.

SUMBER KEBENARAN
1. docs/redesign/mockups/*.dc.html adalah desain final. Ikuti warna, ukuran, jarak, teks, dan perilakunya.
   - Style inline di markup = nilai visual persis.
   - <sc-for>/<sc-if> = loop/kondisi.
   - {{x}} = nilai dari renderVals() di <script type="text/x-dc"> di bawah file (berisi data contoh, state, dan handler yang menunjukkan perilaku).
2. docs/redesign/SPEC.md: token, app shell, komponen, motion, rincian per halaman, pagination per endpoint, batasan, dan fase. Baca seluruhnya sebelum menulis kode.
3. CLAUDE.md di root: aturan proyek (Fake-UTC, helper tanggal, pembatasan VENDOR, header keamanan di proxy, teks UI Bahasa Indonesia). Aturan ini tetap berlaku.

CARA KERJA
- Mulai dengan membaca: SPEC.md, semua file mockup, CLAUDE.md, frontend/src/App.tsx, frontend/src/components/Layout/*, frontend/src/index.css, frontend/tailwind.config.js, dan halaman yang akan diubah. Lalu tulis rencana singkat per fase di docs/redesign/PROGRESS.md dan perbarui file itu setiap selesai fase.
- Kerjakan per fase sesuai SPEC.md bagian 9. Satu commit per fase (jangan push). Setelah setiap fase, berhenti dan laporkan: halaman yang berubah, hasil build/lint, dan hal yang perlu keputusan saya.
- Fase 1 (fondasi): token di tailwind.config.js + CSS variables, komponen di frontend/src/components/ui/ (Button, Field, Badge, Card, PageHeader, StatTile, ProgressBar, Tabs, SegmentedControl, DataTable, Pagination, EmptyState, Skeleton, Modal, Drawer, toast style), MotionConfig reducedMotion="user", app shell baru (sidebar berkelompok per role + mode rail 72 px, header dengan breadcrumb/Ctrl K/status/notifikasi/profil, nav bawah HP untuk USER). Tambahkan dependensi framer-motion; jangan menambah library lain.
- Fase 2–4: migrasikan halaman sesuai peta di SPEC.md bagian 1. Halaman tanpa mockup memakai pola yang sama (tabel → pola Pengguna, ringkasan → pola Dashboard, form → kartu + Field).
- Fase 5: hapus override CSS lama di frontend/src/index.css ([class*="text-white"], [class*="bg-white/"], [class*="text-slate-…"], .card .text-white, dan sejenisnya) setelah semua halaman pindah. Sebelum fase ini, komponen baru tidak boleh bergantung pada override tersebut; untuk teks putih di atas warna pakai text-[#fff].

BATASAN KERAS
- Jangan mengubah logika frontend/src/pages/canteen/CheckInPage.tsx: antrean scan, isolasi per PC, popup hasil, suara, fokus input, deteksi double-read. Hanya selaraskan token dan shell.
- Jangan mengubah perilaku API yang ada. Endpoint baru hanya yang disebut di SPEC.md (GET /api/orders/stats/canteen-live, parameter pagination/filter yang kompatibel ke belakang). Tanpa page/limit, respons tetap seperti sekarang (aplikasi Android lama masih memakainya).
- Logika tanggal/waktu bisnis wajib memakai helper Fake-UTC (getNow/getToday di backend, formatToWIB/dateHelpers di frontend). Jangan new Date() untuk logika bisnis.
- Semua teks UI Bahasa Indonesia, mengikuti teks di mockup.
- Aksesibilitas:
  - elemen interaktif memakai <button>/<a>/<input> asli;
  - tombol ikon diberi aria-label;
  - kontras teks ≥ 4.5:1;
  - status tidak boleh hanya dibedakan warna;
  - fokus keyboard terlihat.
- Tombol utama amber #f59e0b memakai teks gelap #1c1917, bukan putih.
- Jangan commit file rahasia (.env dsb.), jangan push, jangan deploy.

VERIFIKASI SETIAP FASE
- cd frontend && npm run build && npm run lint (tanpa error baru); cd backend && npm run build bila backend disentuh.
- Jalankan frontend dan periksa halaman yang disentuh di viewport 1366×768, 1280×720, dan 390×844: tidak ada scroll horizontal yang tidak disengaja, tidak ada teks terpotong, dan semua state (loading, kosong, error) tampil.
- Uji alur inti tidak rusak: login, pesan makanan, batal pesanan, riwayat + pagination, check-in scan cepat, ekspor, halaman admin tabel + pagination.
- Bandingkan tampilan dengan mockup terkait. Catat setiap perbedaan yang disengaja di PROGRESS.md beserta alasannya.

Jika ada yang tidak jelas atau bertentangan antara mockup, SPEC.md, dan kode, tulis pertanyaannya di PROGRESS.md dan tanyakan ke saya sebelum mengambil keputusan yang sulit dibatalkan. Mulai dari Fase 1.
```
