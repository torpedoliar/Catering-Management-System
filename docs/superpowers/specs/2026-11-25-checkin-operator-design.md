# Desain perbaikan check-in operator

## Tujuan dan batasan

Pos harus mencatat pengambilan untuk orang yang benar, menunjukkan hasil lokal tanpa tertimpa aktivitas pos lain, dan tetap melayani antrean saat foto gagal. Statistik harus menjelaskan pos dan periode yang dihitung. Tampilan mengikuti desain aplikasi saat ini, dengan area scan lebih dulu.

- Gunakan dependensi dan komponen yang sudah tersedia.
- Pertahankan Fake UTC dan helper tanggal proyek untuk waktu bisnis.
- Gunakan Bahasa Indonesia untuk copy operator.
- Pertahankan pembaruan atomik status `ORDERED` → `PICKED_UP`.
- Foto bukti berbeda dari foto profil; foto opsional saat kamera atau penyimpanan gagal.
- Tidak ada redesign menyeluruh, chart baru, atau perubahan aturan pemesanan.

## Pendekatan

Pilihan pertama: perbaikan bertahap pada halaman dan endpoint yang ada, dengan kontrak yang jelas di setiap tahap. Ini mengikuti urutan yang dibahas: identitas, scanner dan hasil, foto, statistik, lalu tampilan. Pilihan kedua: ganti halaman dan seluruh API sekaligus. Itu memperbesar risiko regresi operasional tanpa manfaat yang diperlukan. Gunakan pendekatan pertama; gabungkan perubahan frontend–backend yang saling bergantung dalam rilis yang sama.

## Perilaku yang dituju

1. QR pesanan atau kode karyawan yang cocok persis tetap cepat. Nama hanya untuk pencarian; pemilihan eksplisit mendahului pencatatan. Jika external ID dan NIK cocok dengan dua orang, operator memilih orangnya.
2. Hanya satu check-in lokal berjalan. Status siap, memproses, berhasil, sudah diambil, dan gagal terlihat dekat input. Duplikat menampilkan waktu/petugas asli. Aktivitas pos lain tidak menimpa hasil lokal. Kamera bisa dipulihkan tanpa reload.
3. Admin mengelola pengaturan foto yang disimpan server; pos hanya menampilkan status. Jika aktif, pos menawarkan foto untuk jalur QR maupun manual dan pilihan lanjut tanpa foto. Jangan menyatakan sukses check-in tanpa konfirmasi API. Foto yang tidak terpakai dibersihkan; jangan menambah paparan foto sebagai aset publik.
4. Statistik memakai pasangan shift/tanggal dari jendela istirahat yang berlaku dan kantin pos. Segarkan saat batas waktu lewat, kantin berubah, dan sinkronisasi pulih. Nol dibedakan dari belum dimuat atau data lama. Penolakan check-in menampilkan arahan dari server.
5. Susunan: pos/koneksi → input dan kamera → hasil terakhir → statistik. Tampilkan aksi inti dan hasil tanpa scroll pada laptop 14 inci pada viewport uji. Input dan dialog dapat dipakai dengan keyboard; status tidak hanya mengandalkan warna.
