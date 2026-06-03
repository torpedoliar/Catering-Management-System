# Spec: Pembatasan Akses Role VENDOR

**Status**: Draft
**Tanggal**: 2026-06-02
**Topik**: Keamanan & Role-Based Access Control (RBAC)

## 1. Masalah
Saat ini, user dengan role `VENDOR` memiliki akses yang terlalu luas di aplikasi:
- Sidebar masih menampilkan menu "Order" dan "History".
- Vendor bisa mengakses halaman pemesanan makanan (`/`).
- Belum ada pemisahan yang jelas antara fitur konsumen (User) dan penyedia makanan (Vendor).

## 2. Kebutuhan
- **VENDOR** hanya boleh mengakses menu yang relevan bagi penyedia makanan: Dashboard Vendor dan Statistik Pickup.
- **VENDOR** tetap diizinkan mengakses halaman **Settings** untuk manajemen profil/password.
- **VENDOR** tidak boleh mengakses fitur pemesanan makanan (Order, Menu, History).
- **VENDOR** harus diarahkan otomatis ke `/vendor` setelah login atau saat mencoba mengakses halaman utama `/`.

## 3. Desain Solusi

### A. Perubahan Sidebar (Frontend)
File: `frontend/src/components/Layout/Sidebar.tsx`
- Tambahkan konstanta `vendorLinks` yang berisi:
    - `Dashboard` (`/vendor`)
    - `Statistik Pickup` (`/vendor/pickup-stats`)
- Modifikasi logika render:
    - Sembunyikan `userLinks` jika `user.role === 'VENDOR'`.
    - Tampilkan `vendorLinks` hanya jika `user.role === 'VENDOR'`.
    - Sembunyikan menu `Canteen` dan `Administration` bagi Vendor.

### B. Perubahan Routing & Redirect (Frontend)
File: `frontend/src/App.tsx`
- Update logika `ProtectedRoute` atau `AppRoutes`:
    - Jika user adalah `VENDOR` dan mencoba mengakses path `/`, redirect secara otomatis ke `/vendor`.
    - Pastikan halaman `/menu`, `/history`, `/about`, dan `/terms` memblokir role `VENDOR` (redirect ke `/vendor`).

### C. Penguatan Keamanan API (Backend)
- Audit file route (terutama `backend/src/routes/order/index.ts` atau `order.routes.ts`).
- Pastikan endpoint `POST /api/orders` (pembuatan order) menolak role `VENDOR`.
- Terapkan `vendorMiddleware` secara konsisten pada semua route di `vendor.routes.ts`.

## 4. Rencana Pengujian
- Login sebagai Vendor: pastikan langsung diarahkan ke `/vendor`.
- Cek Sidebar sebagai Vendor: pastikan menu "Order" dan "History" hilang.
- Coba akses `/` secara manual sebagai Vendor: pastikan ter-redirect ke `/vendor`.
- Coba hit API `POST /api/orders` menggunakan token Vendor: pastikan mendapat `403 Forbidden`.
