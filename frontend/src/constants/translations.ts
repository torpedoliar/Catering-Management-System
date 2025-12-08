export const UI_TEXT = {
    // Common Actions
    save: 'Simpan',
    cancel: 'Batal',
    delete: 'Hapus',
    edit: 'Ubah',
    add: 'Tambah',
    search: 'Cari',
    filter: 'Filter',
    reset: 'Reset',
    confirm: 'Konfirmasi',
    back: 'Kembali',
    next: 'Lanjut',
    loading: 'Memuat...',
    submit: 'Kirim',
    close: 'Tutup',
    download: 'Unduh',
    upload: 'Unggah',
    refresh: 'Muat Ulang',

    // Common Labels
    name: 'Nama',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Konfirmasi Password',
    date: 'Tanggal',
    time: 'Waktu',
    status: 'Status',
    action: 'Aksi',
    description: 'Deskripsi',

    // Navigation
    nav: {
        order: 'Pesan Makanan',
        history: 'Riwayat',
        settings: 'Pengaturan',
        about: 'Tentang',
        dashboard: 'Dashboard',
        calendar: 'Kalender',
        shiftConfig: 'Konfigurasi Shift',
        users: 'Pengguna',
        companies: 'Perusahaan',
        blacklist: 'Blacklist',
        export: 'Ekspor',
        auditLog: 'Log Audit',
        checkin: 'Check-in',
        logout: 'Keluar',
        timeSettings: 'Pengaturan Waktu',
    },

    // Login Page
    login: {
        title: 'Masuk ke Akun Anda',
        subtitle: 'Catering Management System',
        emailPlaceholder: 'Masukkan email Anda',
        passwordPlaceholder: 'Masukkan password Anda',
        loginButton: 'Masuk',
        loggingIn: 'Sedang masuk...',
        success: 'Berhasil masuk!',
        failed: 'Login gagal',
        mustChangePassword: 'Anda harus mengganti password',
    },

    // Order Page
    order: {
        title: 'Pesan Makanan Anda',
        subtitle: 'Pilih tanggal dan shift untuk memesan makanan Anda. Pesanan harus dibuat {hours} jam sebelum shift dimulai.',
        selectDate: 'Tanggal Pemesanan',
        selectShift: 'Pilih Shift Makanan',
        placeOrder: 'Pesan Sekarang',
        orderSuccess: 'Pesanan berhasil dibuat!',
        orderFailed: 'Gagal membuat pesanan',
        cutoffPassed: 'Waktu pemesanan habis',
        timeLeft: 'tersisa',
        holiday: 'Hari Libur',
        fulldayHoliday: 'Libur Penuh',
        alreadyOrdered: 'Anda sudah memesan untuk tanggal ini',
        qrCode: 'QR Code Pesanan Anda',
        downloadQr: 'Unduh QR Code',
        cancelOrder: 'Batalkan Pesanan',
        confirmCancel: 'Yakin ingin membatalkan pesanan?',
        cancelSuccess: 'Pesanan berhasil dibatalkan',
        maxDaysInfo: 'Anda dapat memesan hingga {days} hari ke depan',
        orderConfirmed: 'Pesanan Dikonfirmasi',
        alreadyPickedUp: 'Sudah Diambil!',
        pickupInfo: 'Tunjukkan QR code ini saat mengambil makanan',
        ordering: 'Sedang memesan...',
        cancelling: 'Membatalkan...',
    },

    // History Page
    history: {
        title: 'Riwayat Pesanan',
        subtitle: 'Lihat semua pesanan Anda',
        allStatus: 'Semua Status',
        filterBy: 'Filter berdasarkan',
        noOrders: 'Belum ada pesanan',
        noOrdersDesc: 'Anda belum pernah memesan makanan',
        orderDetails: 'Detail Pesanan',
        orderDate: 'Tanggal Pesanan',
        shift: 'Shift',
        orderedAt: 'Dipesan pada',
        pickedUpAt: 'Diambil pada',
    },

    // Status
    status: {
        ordered: 'Menunggu Diambil',
        pickedUp: 'Sudah Diambil',
        noShow: 'Tidak Diambil',
        cancelled: 'Dibatalkan',
        active: 'Aktif',
        inactive: 'Nonaktif',
        pending: 'Menunggu',
    },

    // Settings Page
    settings: {
        title: 'Pengaturan Akun',
        changePassword: 'Ubah Password',
        currentPassword: 'Password Saat Ini',
        newPassword: 'Password Baru',
        confirmNewPassword: 'Konfirmasi Password Baru',
        updatePassword: 'Perbarui Password',
        passwordChanged: 'Password berhasil diubah',
        passwordChangeFailed: 'Gagal mengubah password',
    },

    // About Page
    about: {
        title: 'Tentang Sistem',
        version: 'Versi',
        description: 'Sistem Manajemen Pemesanan Katering',
    },

    // Dashboard
    dashboard: {
        title: 'Dashboard',
        todayOrders: 'Pesanan Hari Ini',
        totalOrders: 'Total Pesanan',
        pickedUp: 'Sudah Diambil',
        pending: 'Menunggu',
        cancelled: 'Dibatalkan',
        noShow: 'Tidak Diambil',
        pickupRate: 'Tingkat Pengambilan',
        byShift: 'Berdasarkan Shift',
        byCompany: 'Berdasarkan Perusahaan',
        byDepartment: 'Berdasarkan Departemen',
        blacklistedUsers: 'Pengguna Diblacklist',
        usersAtRisk: 'Pengguna Hampir Blacklist',
        holidays: 'Hari Libur Hari Ini',
        noHolidays: 'Tidak ada hari libur',
    },

    // Calendar
    calendar: {
        title: 'Kalender Hari Libur',
        subtitle: 'Kelola hari libur dan lihat statistik pesanan',
        addHoliday: 'Tambah Hari Libur',
        bulkAdd: 'Bulk Hari Libur',
        holidayName: 'Nama Hari Libur',
        holidayType: 'Tipe Libur',
        fullday: 'Libur Penuh (Semua Shift)',
        selectShifts: 'Pilih Shift',
        startDate: 'Tanggal Mulai',
        endDate: 'Tanggal Akhir',
        addEntry: 'Tambah Entry',
        totalDays: 'Total hari libur',
        entries: 'entry',
        holidayAdded: 'Hari libur berhasil ditambahkan',
        holidayDeleted: 'Hari libur berhasil dihapus',
        thisMonth: 'Bulan Ini',
        today: 'Hari Ini',
        totalOrders: 'Total Pesanan',
    },

    // Users Management
    users: {
        title: 'Manajemen Pengguna',
        addUser: 'Tambah Pengguna',
        importUsers: 'Import Pengguna',
        exportUsers: 'Ekspor Pengguna',
        searchPlaceholder: 'Cari berdasarkan nama, email, atau ID...',
        totalUsers: 'Total Pengguna',
        activeUsers: 'Aktif',
        externalId: 'ID Eksternal',
        role: 'Role',
        company: 'Perusahaan',
        division: 'Divisi',
        department: 'Departemen',
        strikes: 'Strike',
        actions: 'Aksi',
        resetPassword: 'Reset Password',
        reduceStrike: 'Kurangi Strike',
        deactivate: 'Nonaktifkan',
        activate: 'Aktifkan',
        downloadTemplate: 'Unduh Template',
        selectFile: 'Pilih File Excel',
        importSuccess: 'Berhasil mengimpor {count} pengguna',
        userUpdated: 'Data pengguna berhasil diperbarui',
    },

    // Blacklist
    blacklist: {
        title: 'Manajemen Blacklist',
        activeBlacklists: 'Blacklist Aktif',
        addBlacklist: 'Blacklist Pengguna',
        selectUser: 'Pilih Pengguna',
        reason: 'Alasan',
        duration: 'Durasi (hari)',
        permanent: 'Permanen',
        blacklistUser: 'Blacklist',
        unblacklist: 'Hapus Blacklist',
        adminPassword: 'Password Admin',
        confirmAction: 'Konfirmasi Tindakan',
        blacklistSuccess: 'Pengguna berhasil di-blacklist',
        unblacklistSuccess: 'Blacklist berhasil dihapus',
        currentStrikes: 'Strike Saat Ini',
        endDate: 'Berakhir',
        neverEnds: 'Tidak berakhir',
    },

    // Check-in
    checkin: {
        title: 'Check-in Pesanan',
        scanQr: 'Scan QR Code',
        manualEntry: 'Input Manual',
        enterUserId: 'Masukkan ID Pengguna',
        checkinSuccess: 'Check-in berhasil!',
        alreadyCheckedIn: 'Sudah check-in sebelumnya',
        orderNotFound: 'Pesanan tidak ditemukan',
        invalidQr: 'QR Code tidak valid',
        checkinFor: 'Check-in untuk',
    },

    // Confirmation Dialogs
    confirm: {
        deleteTitle: 'Konfirmasi Hapus',
        deleteMessage: 'Yakin ingin menghapus {item}?',
        cancelTitle: 'Konfirmasi Pembatalan',
        yes: 'Ya',
        no: 'Tidak',
        areYouSure: 'Apakah Anda yakin?',
        cannotBeUndone: 'Tindakan ini tidak dapat dibatalkan',
    },

    // Validation Messages
    validation: {
        required: '{field} harus diisi',
        email: 'Format email tidak valid',
        minLength: '{field} minimal {min} karakter',
        maxLength: '{field} maksimal {max} karakter',
        passwordMatch: 'Password tidak sama',
        invalidDate: 'Tanggal tidak valid',
        futureDate: 'Tanggal harus di masa depan',
        pastDate: 'Tanggal tidak boleh di masa lalu',
    },
};

/**
 * Format text with parameters
 * @example formatText(UI_TEXT.order.maxDaysInfo, { days: 7 })
 */
export function formatText(text: string, params: Record<string, any>): string {
    let result = text;
    Object.entries(params).forEach(([key, value]) => {
        result = result.replace(`{${key}}`, String(value));
    });
    return result;
}
