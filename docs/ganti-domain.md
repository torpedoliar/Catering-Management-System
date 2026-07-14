# Panduan Lengkap: Mengganti Domain Aplikasi

Dokumen ini menjelaskan langkah-langkah presisi dan runtut ketika Anda perlu mengubah domain utama aplikasi Catering Management System (misalnya dari `hallofood.santosjayaabadi.co.id` menjadi domain lain).

## 1. Konfigurasi Keamanan API (Backend)
Backend menggunakan fitur CORS (*Cross-Origin Resource Sharing*) untuk menolak request dari domain tidak dikenal. Anda harus mendaftarkan domain baru Anda di sini.
*   **Lokasi File:** File `.env` (berada di *root repository* atau di dalam `/backend/.env`).
*   **Variabel Target:** `CORS_ORIGIN`
*   **Cara Update:**
    Buka file `.env`, ubah *value* dari properti tersebut menjadi nama domain baru.
    ```env
    CORS_ORIGIN=https://domainbaru.com
    ```
    *(Catatan: pastikan tidak ada garis miring `/` di paling belakang domain).*

## 2. Konfigurasi Mobile App Wrapper (Android & iOS)
Aplikasi mobile native menggunakan modul *Capacitor WebView* yang membungkus antarmuka web. Aplikasi ini di-set untuk memuat (*load*) URL server secara langsung secara *seamless*.
*   **Lokasi File:** `frontend/capacitor.config.ts`
*   **Baris Target:** `server.url`
*   **Cara Update:**
    Buka file tersebut dan ganti link URL-nya dengan yang baru, lalu jangan lupa *sync* ulang dependensinya.
    ```typescript
    // Sebelum
    server: {
      url: 'https://hallofood.santosjayaabadi.co.id',
      androidScheme: 'https',
    }

    // Sesudah
    server: {
      url: 'https://domainbaru.com',
      androidScheme: 'https',
    }
    ```
*   **Langkah Eksekusi Lanjutan:** 
    Setelah baris URL pada file `capacitor.config.ts` diubah, lakukan kompilasi ulang (build) di komputer/laptop Anda:
    ```bash
    cd frontend
    npm run build
    npx cap sync
    ```
    Lalu, buka *Android Studio* maupun *Xcode* untuk melakukan pembuatan file `.apk` / `.aab` / `.ipa` baru untuk di-*update* ke para pengguna ponsel.

## 3. Konfigurasi Web / Frontend Environment
Frontend ViteJS membutuhkan tahu di mana ia harus 'melempar' koneksi REST API. Apabila domain yang Anda terapkan sejajar dalam satu URL (misalnya backend berdiri di `domainbaru.com/api`), maka URL di `.env` frontend dapat dibiarkan kosong (`""`).
*   **Lokasi File:** File `.env` (atau di config file `docker-compose.yml`)
*   **Variabel Target:** `VITE_API_URL`
*   **Cara Update:** 
    Biarkan `VITE_API_URL=""` apabila backend berada di belakang mesin Nginx Server yang sama (sebagai relative routing). Sebaliknya, bila backend ditempatkan di port spesifik/sub-domain pisah (contoh `api.domainbaru.com`), rubah menjadi:
    ```env
    VITE_API_URL=https://api.domainbaru.com
    ```

## 4. Konfigurasi Jaringan Panel NGINX (Nginx Proxy Manager)
Aplikasi terhubung ke internet melalui Reverse Proxy NGINX. 
*   **Lokasi:** Dashboard web *Nginx Proxy Manager* Anda (biasanya port 81).
*   **Cara Update:**
    1. Akses halaman *Proxy Hosts*.
    2. Edit rekam jejak (*record*) proxy yang asalnya `hallofood.santosjayaabadi.co.id`.
    3. Ganti field *Domain Names* ke domain baru Anda.
    4. Masuk ke tab **SSL**, pilih opsi *"Request a new Let's Encrypt Certificate"* agar domain yang baru ini mendapatkan *gembok hijau* (HTTPS bertanda aman).

## 5. Restart Layanan Docker
Agar *Backend Server* dan *Frontend* menelan dan menerapkan pergantian domain yang bersumber di lingkup file `.env`, *restart* seluruh kontainer.
*   **Cara Update (pada terminal root server VPS Anda):**
    ```bash
    docker-compose down
    docker-compose up -d --build
    ```

## 6. Pembaruan Notifikasi Mobile (Firebase Cloud Messaging)
Jika Anda mengganti domain utama, biasanya Anda juga ingin mengubah **App ID (Package Name)** aplikasi mudah alih Anda agar serasi (misal diubah dari `co.id.santosjayaabadi.hallofood` menjadi `com.domainbaru.app`). Jika *App ID* ini **TIDAK** diubah, maka Anda tidak perlu melakukan apa-apa di Firebase. 

Namun, **JIKA Anda mengubah App ID**, ikuti langkah berikut agar push notification tidak putus:
1.  **Daftarkan Ulang di Firebase Console:**
    *   Buka dashboard project Firebase Anda saat ini.
    *   Klik **Add App** (Tambahkan Aplikasi) -> Pilih lambang **Android**.
    *   Masukkan Android package name yang baru: `com.domainbaru.app`, lalu daftarkan.
    *   Unduh file kredensial baru bernama `google-services.json`.
    *   (Lakukan langkah yang sama untuk iOS jika rilis ke ekosistem Apple untuk mendapatkan `GoogleService-Info.plist` yang baru).
2.  **Timpa Kredensial di Source Code:**
    *   Hapus file `google-services.json` lama, dan copas file yang baru ke: `frontend/android/app/google-services.json`
    *   Copas file `GoogleService-Info.plist` yang baru ke: `frontend/ios/App/App/GoogleService-Info.plist`
3.  **Ubah App ID di Capacitor:**
    *   Buka `frontend/capacitor.config.ts`
    *   Ubah bagian `appId` menjadi `appId: 'com.domainbaru.app'`
4.  **Eksekusi Perubahan:**
    Kompilasi ulang aplikasi native Anda dengan menjalankan perintah:
    ```bash
    cd frontend
    npm run build
    npx cap sync
    ```

## 7. Hal Lainnya Yang Berkaitan
*   Jika **Web-Push Notification** (notifikasi dari browser langsung) diklaim tidak muncul setelah ganti domain, sarankan karyawan Anda membersihkan *Cache* browser aplikasinya lalu Re-login. Hal ini dikarenakan pergantian URL memaksa browser mendaftarkan *Vapid Key PushSubscription* baru pada *service worker*.

## 8. Troubleshooting (Masalah Pasca Ganti Domain)

### A. Login Gagal / Error 502 Bad Gateway pada API
Jika halaman web bisa dibuka namun saat login gagal dan muncul error **502 Bad Gateway** di console browser, ini **BUKAN** karena backend Anda rusak. 

Penyebab utamanya adalah **Nginx Proxy Manager (NPM) men-cache IP internal lama** dari container backend. Ketika Anda menjalankan `docker compose down` dan `up -d` (Langkah 5), container backend mendapatkan IP internal Docker yang baru. Namun, konfigurasi *Advanced* di NPM (`proxy_pass http://catering-backend:3012;`) masih mencoba mengirim traffic ke IP yang lama.

**Solusi:**
Anda harus me-restart service Nginx Proxy Manager agar ia membaca ulang IP terbaru backend.
Cara termudah: Buka dashboard NPM Anda -> Edit *Proxy Host* domain Anda -> Langsung klik **Save** tanpa merubah apapun. Tindakan ini akan memaksa Nginx melakukan *reload* dan memperbaiki koneksi API secara instan.

### B. Error Console: `Content Security Policy directive...` (Cloudflare)
Jika Anda menggunakan **Cloudflare** sebagai DNS proxy (awan orange menyala) dan mengaktifkan fitur seperti *Web Analytics* atau *Rocket Loader*, Anda mungkin akan melihat banyak tulisan merah panjang terkait pemblokiran script (CSP) di console browser.

Aplikasi secara ketat menolak masuknya script pihak ketiga. Untuk mengatasinya, buka pengaturan **Advanced** pada Proxy Host NPM Anda, cari baris header `Content-Security-Policy`, dan ganti baris tersebut menjadi:

```nginx
more_set_headers "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'none'";
```

Perubahan ini melonggarkan keamanan khusus untuk domain `cloudflareinsights.com` agar fitur analytics dan rocket loader Cloudflare Anda dapat bekerja normal tanpa diblokir oleh aplikasi.
