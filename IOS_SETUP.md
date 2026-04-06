# Panduan Persyaratan & Setup iOS HalloFood

Dokumen ini berisi informasi mengenai versi perangkat lunak (software) dan alat (tools) yang dibutuhkan untuk melakukan *build* dan *development* aplikasi HalloFood khusus untuk platform iOS.

Karena adanya limitasi kompabilitas antara Capacitor versi terbaru dengan Xcode versi lama (khususnya macOS Ventura), proyek ini telah disesuaikan dengan spesifikasi berikut agar dapat berjalan dengan stabil.

## 🛠 Versi Persyaratan Sistem (System Requirements)

Berikut adalah daftar versi *tools* yang **berhasil** dan **teruji** untuk melakukan *build* proyek ini:

| Perangkat Lunak | Versi yang Dibutuhkan | Keterangan |
| :--- | :--- | :--- |
| **macOS** | Ventura (v13.x) atau lebih baru | Sistem Operasi dasar untuk menjalankan Xcode 14. |
| **Xcode** | v14.3.1 | Editor dan kompilator Apple. (Penting: Jika Anda menggunakan Xcode 15/16 di masa depan, Anda bisa meng-upgrade Capacitor kembali ke versi 8). |
| **Node.js** | v20.x (LTS) | Diperlukan versi 20 karena Capacitor 5 sangat stabil di versi ini. (Abaikan peringatan jika ada, hindari Node 22+ untuk Capacitor 5). |
| **NPM** | v10.x | Bawaan dari instalasi Node.js v20. |
| **Capacitor CLI & Core** | v5.7.8 | Menggunakan versi 5 karena versi ini mendukung manajemen *dependency* iOS menggunakan CocoaPods. (Capacitor 8 memerlukan Swift Package Manager / SPM yang hanya optimal di Xcode 15+). |
| **CocoaPods** | v1.11.3 | Manajemen *dependency* Swift/Objective-C. Versi ini dipilih karena kompatibel dengan versi bawaan Ruby di macOS Ventura. |
| **Ruby** | v2.6.x (Bawaan Mac) | Digunakan secara eksklusif untuk menjalankan CocoaPods. |
| **ActiveSupport** | v5.2.8.1 | Pustaka pendukung Ruby yang meminimalkan konflik saat instalasi CocoaPods tanpa menggunakan Homebrew. |

---

## 🚀 Panduan Setup & Build iOS Baru

Jika suatu saat proyek ini di-*clone* ke komputer macOS yang benar-benar baru, ikuti panduan berurutan di bawah ini agar terhindar dari bentrok instalasi (*Dependency Hell*):

### 1. Instalasi NVM & Node.js 20
Pasang Node Version Manager agar bisa bergonta-ganti versi Node js dengan mudah:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20
```

### 2. Instalasi CocoaPods Tanpa Homebrew (Sangat Cepat)
Gunakan *gem* bawaan Mac untuk menginstal versi CocoaPods yang tepat:
```bash
# Pastikan path ini masuk ke sistem agar perintah `pod` bisa dipanggil
export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"

# Atur Encoding UTF-8 agar nama folder berspasi (seperti "Catering Management") tidak error
export LANG=en_US.UTF-8 
export LC_ALL=en_US.UTF-8

# Install library khusus tanpa sudo
gem install activesupport -v 5.2.8.1 --user-install
gem install cocoapods -v 1.11.3 --user-install
```

### 3. Mengatur Dependencies Frontend
Masuk ke direktori `frontend` dan pastikan package Capacitor terinstal persis di versi 5:
```bash
cd "frontend"
npm install --legacy-peer-deps
```

### 4. Build dan Sinkronisasi ke Xcode
*Catatan: Pastikan Anda selalu mengatur lingkungan UTF-8 sebelum melakukan instalasi library native Apple (pod install) via Capacitor.*

Lakukan build aplikasi web menjadi file statis dan injeksikan ke dalam wadah aplikasi iOS (WebView):
```bash
export LANG=en_US.UTF-8 
export LC_ALL=en_US.UTF-8

# Membangun folder /dist
npm run build 

# Sinkronisasi ke project Xcode
npx cap sync ios
```

Anda juga dapat menggunakan script otomatis yang telah disediakan:
```bash
chmod +x build-ios.sh
./build-ios.sh
```

### 5. Membuka dan Meluncurkan Simulator
Untuk membuka Xcode secara langsung dari Terminal:
```bash
npx cap open ios
```
Setelah antarmuka program Xcode terbuka:
1. Tunggu *Indexing* di bar navigasi atas selesai.
2. Pastikan file pengaturan proyek `App.xcodeproj` sudah terpilih.
3. Klik pada pilihan simulator perangkat di sisi atas layar (contoh: iPhone 14).
4. Tekan ikon `Play` (▶) di kiri atas layar atau kombinasi `Cmd + R` untuk me-*run* (menyalankan) aplikasi ke dalam Simulator.

---

## ⚠️ Peringatan Penting (Troubleshooting)

- **Crash saat mengakses Kamera:** `Info.plist` secara *default* sudah dimasukkan parameter `NSCameraUsageDescription` dan `NSMicrophoneUsageDescription`. Jangan menghapus baris tersebut di `ios/App/App/Info.plist`.
- **Unicode Encoding Error:** Saat menjalankan perintah `npx cap sync ios` atau melakukan `pod install`, sangat sering terjadi error "Unicode Normalization". Ini dikarenakan path direktori (seperti "Catering Management") memiliki karakter spasi kosong, selalu biasakan memakai perintah pendahuluan `export LANG=en_US.UTF-8`.
- **CocoaPods & Xcode 14:** Mengingat arsitektur Apple tidak begitu bersahabat dengan versi aplikasi *legacy*, **TIDAK DISARANKAN** memutakhirkan CocoaPods atau Capacitor melampaui rentang versi yang ditulis dalam dokumen ini hingga Anda sepenuhnya memperbarui MacOS dan Xcode ke generasi terbaru (misalnya Mac M1/M2/M3 dengan MacOS Sonoma/Sequoia & Xcode 16).
