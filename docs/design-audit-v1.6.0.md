# 🎨 Frontend Design Audit — v1.6.0
## Catering Management System — Impeccable Technical Quality Assessment

**Audit Date:** 2026-08-19
**Scope:** `frontend/src` (35 halaman, 311 kontrol interaktif)
**Frontend Version:** 1.6.0 · **App Version:** 2.8.0
**Register:** product (app UI / admin / tool) · **Platform:** web
**Method:** analisis statis — detektor `impeccable` + verifikasi manual per temuan

---

## Ringkasan Eksekutif

| | |
|---|---|
| **Audit Health Score** | **10 / 20** — Acceptable (significant work needed) |
| **Issue terverifikasi** | P0 ×0 · P1 ×4 · P2 ×4 · P3 ×2 |
| **Temuan detektor** | 60 mentah → **17 nyata, 43 false positive** |
| **Verdict AI-slop** | Lulus sebagian — bukan AI-generated, 2 tell nyata |

Tiga hal paling penting:

1. Aksesibilitas belum pernah masuk workflow — nol ARIA, nol `prefers-reduced-motion`, nol focus trap
2. 94 dari 96 label form tanpa asosiasi ke kontrolnya
3. Design token dibuat lalu ditinggalkan — `slate-*` mendominasi token brand 22:1

> **Catatan metodologi.** Audit ini analisis statis. Rasio kontras aktual dan perilaku keyboard perlu diverifikasi di browser; server tidak tersedia lokal saat audit dijalankan.

---

## 1. Skor per Dimensi

| # | Dimensi | Skor | Temuan Kunci |
|---|---------|------|--------------|
| 1 | Accessibility | **1**/4 | Nol atribut ARIA pada 311 button; 94 label form tanpa asosiasi |
| 2 | Performance | **3**/4 | Code-split 27 route, 86 `useCallback`; 25 `<img>` tanpa lazy |
| 3 | Responsive Design | **3**/4 | 164 breakpoint; 16 dari 17 tabel di-wrap `overflow-x` |
| 4 | Theming | **1**/4 | 1253 `slate-*` hard-coded vs 57 token `primary-*`; nol dark mode |
| 5 | Anti-Patterns | **2**/4 | Gradient text pada wordmark di 4 lokasi (absolute ban) |
| | **Total** | **10/20** | **Acceptable** |

**Rating band:** 18-20 Excellent · 14-17 Good · **10-13 Acceptable** · 6-9 Poor · 0-5 Critical

---

## 2. Verdict Anti-Pattern

**Lulus sebagian.** Aplikasi ini tidak terbaca sebagai AI-generated. Palet amber (`primary.DEFAULT: #f59e0b`) adalah pilihan brand yang berkomitmen — bukan default cream/sand/violet yang jadi tell AI 2026. Kepadatan informasi, tabel, dan vocabulary komponennya khas tool internal yang tumbuh dari kebutuhan operasional nyata.

Dua tell yang nyata:

- **Gradient text pada wordmark** — absolute ban. Ironisnya brand di sini cukup kuat untuk tampil solid; gradient justru melemahkannya.
- **Indigo/purple di 7 file** bersanding dengan brand amber. `accent.violet` memang token terdaftar, tapi dipakai sebagai gradient hero dekoratif, bukan aksen semantik.

---

## 3. Temuan Detail

Severity: **P0** Blocking · **P1** Major (perbaiki sebelum rilis) · **P2** Minor · **P3** Polish

### [P1] Tidak ada atribut ARIA sama sekali

| | |
|---|---|
| **Lokasi** | Seluruh `frontend/src` — 311 `<button>`, 0 `aria-*` |
| **Kategori** | Accessibility |
| **Standar** | WCAG 4.1.2 Name, Role, Value (Level A) |

**Dampak.** Tombol ikon-only seperti close modal di `pages/admin/UserManagementPage.tsx:575` diumumkan screen reader hanya sebagai "button" tanpa nama. Pengguna tidak tahu fungsinya. Ada 50 atribut `title=` yang membantu sebagian, tetapi `title` tidak konsisten dibacakan lintas screen reader.

**Rekomendasi.** `aria-label` pada setiap kontrol ikon-only; `aria-expanded` pada toggle sidebar/filter; `aria-live` pada region toast.

**Command:** `/impeccable harden`

---

### [P1] 94 label form tanpa asosiasi

| | |
|---|---|
| **Lokasi** | 96 `<label>` mendahului kontrol; hanya 2 ber-`htmlFor`; nol yang membungkus input |
| **Kategori** | Accessibility |
| **Standar** | WCAG 1.3.1 Info and Relationships (A), 3.3.2 Labels or Instructions (A) |

**Dampak.** Klik label tidak memfokuskan input; screen reader tidak memasangkan keduanya. Paling terasa di form padat seperti `SettingsPage` dan `ShiftConfigPage`.

**Rekomendasi.** Pasangkan `htmlFor` + `id`, atau bungkus input di dalam `<label>`.

**Command:** `/impeccable harden`

---

### [P1] `prefers-reduced-motion` tidak ada

| | |
|---|---|
| **Lokasi** | `src/index.css` — 6 keyframe animation, 0 media query |
| **Kategori** | Accessibility |
| **Standar** | WCAG 2.3.3 Animation from Interactions (AAA); praktik baku AA |

**Dampak.** `animate-float` (6s infinite), `animate-glow` (2s infinite alternate), dan `animate-pulse-slow` (3s infinite) berjalan terus tanpa opsi berhenti. Memicu ketidaknyamanan bagi pengguna sensitif gerak.

**Rekomendasi.** Satu blok `@media (prefers-reduced-motion: reduce)` yang menonaktifkan animasi infinite dan memendekkan transisi.

**Command:** `/impeccable harden`

---

### [P1] Gradient text pada wordmark

| | |
|---|---|
| **Lokasi** | `pages/LoginPage.tsx:128,135` · `components/Layout/Layout.tsx:196` · `components/Layout/Sidebar.tsx:122` · `src/index.css:499,979` |
| **Kategori** | Anti-Pattern (absolute ban) |

**Dampak.** Nama aplikasi adalah elemen brand paling penting; gradient membuatnya kurang terbaca dan kontrasnya tidak dapat diandalkan. `LoginPage` bahkan menambal dengan `drop-shadow(0 4px 12px rgba(0,0,0,0.6))` — indikasi kontrasnya memang bermasalah.

**Rekomendasi.** `text-amber-400` solid. Beri penekanan lewat `font-weight` / `size`, bukan gradient.

**Command:** `/impeccable typeset`

---

### [P2] Theming: token ada, tapi dilewati

| | |
|---|---|
| **Lokasi** | Seluruh `src` — `slate-*` 1253× · `primary-*` 57× · hex literal 113× |
| **Kategori** | Theming |

**Dampak.** Rasio 22:1 terhadap token brand. Mengubah warna brand butuh menyentuh ratusan lokasi. `tailwind.config.js:33` mendefinisikan `dark.bg-tertiary: '#f5f5f4'` — warna terang di dalam namespace bernama `dark`, tanda penamaan token sudah tidak dipercaya saat menulis kode.

**Rekomendasi.** Petakan `slate-*` yang paling sering ke token semantik (`surface`, `ink`, `muted`, `border`) **sebelum** menyentuh nilai warna apa pun.

**Command:** `/impeccable extract`

---

### [P2] Nol dark mode meski token menyiratkannya

| | |
|---|---|
| **Lokasi** | `tailwind.config.js:30-39` mendefinisikan namespace `dark`; nol varian `dark:` di 35 halaman; `darkMode` tidak dikonfigurasi |
| **Kategori** | Theming |

**Dampak.** Token `dark` menjanjikan sesuatu yang tidak ada. Aplikasi kantin dipakai di area produksi dengan pencahayaan bervariasi — ini bukan sekadar preferensi estetis.

**Rekomendasi.** Putuskan secara eksplisit: implementasikan dark mode, atau hapus namespace `dark` agar token jujur.

**Command:** `/impeccable colorize`

---

### [P2] Modal tanpa focus trap, Esc, atau role

| | |
|---|---|
| **Lokasi** | Nol `<dialog>`, nol `role="dialog"`, nol handler Escape di seluruh `src` |
| **Kategori** | Accessibility |
| **Standar** | WCAG 2.1.2 No Keyboard Trap (A), 2.4.3 Focus Order (A) |

**Dampak.** Fokus keyboard bocor ke konten di belakang modal; Esc tidak menutup. Paling terasa di alur check-in yang dipakai cepat dan berulang oleh petugas kantin.

**Rekomendasi.** Elemen `<dialog>` native memberi focus trap, Esc, dan backdrop sekaligus tanpa dependency.

**Command:** `/impeccable harden`

---

### [P2] 25 gambar tanpa lazy loading

| | |
|---|---|
| **Lokasi** | 25 `<img>`, 0 `loading="lazy"` |
| **Kategori** | Performance |

**Catatan.** Seluruh 25 gambar sudah punya `alt` — 100%.

**Rekomendasi.** `loading="lazy"` pada gambar di bawah lipatan; `decoding="async"`.

**Command:** `/impeccable optimize`

---

### [P3] Landmark semantik minim

| | |
|---|---|
| **Lokasi** | 1 `<main>`, 2 `<nav>`, 1 `<header>`, 0 `<footer>` di 35 halaman |
| **Kategori** | Accessibility |
| **Standar** | WCAG 1.3.1 Info and Relationships (A) |

**Dampak.** Navigasi "skip to landmark" praktis tidak berfungsi bagi pengguna screen reader.

**Command:** `/impeccable harden`

---

### [P3] Dua `focus:outline-none` tanpa pengganti

| | |
|---|---|
| **Lokasi** | `pages/admin/WeeklyMenuPage.tsx:587` (`focus:border-teal-400` saja — perubahan border 1px terlalu halus) · `pages/SettingsPage.tsx:812` |
| **Kategori** | Accessibility |
| **Standar** | WCAG 2.4.7 Focus Visible (AA) |

**Catatan.** 20 `focus:outline-none` total; 18 sudah dipasangkan `focus:ring`. Hanya 2 ini yang bocor.

**Command:** `/impeccable polish`

---

## 4. False Positive (43 dari 60 temuan detektor)

Setiap kelas diverifikasi ke sumbernya. **Tidak ada yang di-suppress** — hanya diklasifikasi, agar tetap terlaporkan pada audit berikutnya.

| Rule | N | Alasan false positive |
|---|---|---|
| `border-accent-on-rounded` | 28 | Semuanya spinner. Pola `animate-spin rounded-full border-t-2 border-b-2` (`App.tsx:57`) adalah spinner CSS standar, bukan side-stripe dekoratif — border parsial itulah yang menciptakan efek putarnya. |
| `gray-on-color` | 12 | Detektor salah baca state. `Layout.tsx:311`: `text-slate-500` adalah default, `bg-rose-500/10` hanya pada hover, dan saat hover teks ikut jadi `text-rose-400` — keduanya tidak pernah bertemu. `CalendarPage.tsx:879` adalah ternary aktif/inaktif. `SettingsPage.tsx:924` (`text-slate-950` di atas `bg-amber-500`) justru ~11:1. |
| `ai-color-palette` | 2 | `UptimeHistoryPage.tsx:215,364`. `accent.violet: '#8b5cf6'` adalah token brand terdaftar (`tailwind.config.js:26`), dipakai konsisten di 14 file. Mengubah satu halaman saja justru merusak konsistensi. |
| `layout-transition` | 1 | `index.css:757` menganimasikan `width` pada progress bar — itu memang properti yang diukur. |

**Terkonfirmasi nyata dan sudah masuk daftar temuan:**

- `gradient-text` ×6 → [P1] di atas
- `bounce-easing` ×3 → `--transition-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` (`index.css:78`) melewati batas 1.0; ini bounce, bukan ease-out
- `overused-font` ×1 → Plus Jakarta Sans; wajar untuk product register, **bukan defek**

---

## 5. Temuan Positif

Praktik yang sudah baik dan layak dipertahankan:

- **Code splitting agresif** — 27 route `React.lazy` di `App.tsx`; halaman admin tidak membebani bundel awal
- **`useCallback` 86×** — dipakai dengan disiplin, bukan taburan asal
- **Seluruh 25 `<img>` punya `alt`** — 100%, jarang terjadi
- **16 dari 17 tabel dibungkus `overflow-x`** — data padat tidak merusak layout mobile
- **Palet brand berkomitmen** — amber sebagai `primary` adalah pilihan yang jelas dibuat, bukan diwarisi template
- **Skala radius & shadow terkurasi** — `shadow-card` / `shadow-card-hover` konsisten lintas surface
- **164 penggunaan breakpoint** — responsivitas struktural sudah dipikirkan

---

## 6. Pola Sistemik

Masalah berulang yang menandakan celah sistemik, bukan kesalahan satu-dua tempat:

1. **Aksesibilitas tidak pernah masuk workflow.** Nol ARIA, nol reduced-motion, nol focus trap, 2 dari 96 label — ini dimensi yang belum pernah disentuh, bukan kelalaian sporadis.
2. **Token dibuat lalu ditinggalkan.** `tailwind.config.js` menyimpan sistem matang (5 accent, semantic status, gradient, shadow) tapi 1253 `slate-*` menunjukkan pengembangan sehari-hari melewatinya.
3. **Namespace `dark` menyesatkan.** `dark.bg-tertiary: '#f5f5f4'` adalah warna terang di dalam namespace bernama dark — token yang menyesatkan pembacanya.

---

## 7. Rencana Tindakan

Urutan prioritas, dengan estimasi dampak terhadap skor:

| # | Prioritas | Command | Cakupan | Dampak Skor |
|---|---|---|---|---|
| 1 | P1 | `/impeccable harden` | ARIA pada 311 button, `htmlFor` pada 94 label, `prefers-reduced-motion`, focus trap modal | Accessibility 1 → 3 |
| 2 | P1 | `/impeccable typeset` | Hapus gradient text dari wordmark (4 lokasi + 2 kelas CSS) | Anti-Patterns 2 → 3 |
| 3 | P2 | `/impeccable extract` | Petakan `slate-*` dominan ke token semantik | Theming 1 → 3 |
| 4 | P2 | `/impeccable colorize` | Putuskan nasib dark mode; token `dark` harus jujur | Theming (lanjutan) |
| 5 | P2 | `/impeccable optimize` | `loading="lazy"` pada 25 gambar | Performance 3 → 4 |
| 6 | P3 | `/impeccable polish` | 2 focus ring bocor, landmark semantik, easing bounce | Pass akhir |

**Proyeksi setelah langkah 1-3:** 10/20 → sekitar 16/20 (Good).

---

## 8. Batasan Audit

Hal-hal yang **tidak** tercakup dan perlu verifikasi terpisah:

- **Rasio kontras aktual** — dihitung dari nama token, bukan dari rendering. Perlu pengukuran di browser.
- **Perilaku keyboard nyata** — urutan tab, keyboard trap, dan focus order hanya dapat diverifikasi secara interaktif.
- **Performa runtime** — tidak ada profiling; skor Performance berbasis pola kode (code splitting, memoization, lazy loading).
- **Backend** — audit ini khusus `frontend/src`. Kualitas API dan query di luar cakupan.

Server tidak tersedia lokal saat audit dijalankan; seluruh temuan berbasis analisis statis atas kode sumber.

---

*Dihasilkan oleh `/impeccable audit`. Jalankan ulang setelah perbaikan untuk melihat perubahan skor.*
