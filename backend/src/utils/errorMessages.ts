export const ErrorMessages = {
    // Authentication
    INVALID_CREDENTIALS: 'Email atau password yang Anda masukkan salah',
    UNAUTHORIZED: 'Anda harus login terlebih dahulu untuk mengakses halaman ini',
    FORBIDDEN: 'Anda tidak memiliki izin untuk melakukan tindakan ini',
    SESSION_EXPIRED: 'Sesi Anda telah berakhir. Silakan login kembali',
    TOKEN_INVALID: 'Sesi tidak valid. Silakan login kembali',

    // User Management
    USER_NOT_FOUND: 'Pengguna tidak ditemukan',
    USER_ALREADY_EXISTS: 'Pengguna dengan email ini sudah terdaftar',
    USER_BLACKLISTED: 'Akun Anda sedang dinonaktifkan. Hubungi admin untuk info lebih lanjut',
    INVALID_PASSWORD: 'Password harus minimal 6 karakter',
    PASSWORD_MISMATCH: 'Password dan konfirmasi password tidak sama',
    WEAK_PASSWORD: 'Password terlalu lemah. Gunakan kombinasi huruf, angka, dan simbol',
    MISSING_REQUIRED_FIELDS: 'Mohon lengkapi semua data yang diperlukan',

    // Orders
    ORDER_NOT_FOUND: 'Pesanan tidak ditemukan',
    ORDER_ALREADY_EXISTS: 'Anda sudah memiliki pesanan untuk tanggal ini',
    CUTOFF_PASSED: 'Waktu pemesanan untuk shift ini sudah habis',
    HOLIDAY_RESTRICTION: 'Tidak dapat memesan pada hari libur',
    PAST_DATE: 'Tidak dapat memesan untuk tanggal yang sudah lewat',
    MAX_DAYS_EXCEEDED: 'Anda hanya dapat memesan maksimal {days} hari ke depan',
    INVALID_ORDER_DATE: 'Tanggal pemesanan tidak valid',
    CANNOT_CANCEL_PICKED_UP: 'Tidak dapat membatalkan pesanan yang sudah diambil',
    CANNOT_CANCEL_PAST_CUTOFF: 'Tidak dapat membatalkan pesanan setelah waktu cutoff',

    // Shifts
    SHIFT_NOT_FOUND: 'Shift tidak ditemukan',
    SHIFT_INACTIVE: 'Shift ini tidak aktif',
    SHIFT_IN_USE: 'Shift tidak dapat dihapus karena masih digunakan',
    INVALID_SHIFT_TIME: 'Waktu shift tidak valid',

    // Holidays
    HOLIDAY_NOT_FOUND: 'Hari libur tidak ditemukan',
    HOLIDAY_ALREADY_EXISTS: 'Hari libur untuk tanggal ini sudah ada',

    // Settings
    SETTINGS_NOT_FOUND: 'Pengaturan tidak ditemukan',
    INVALID_SETTINGS_VALUE: 'Nilai pengaturan tidak valid',
    CUTOFF_DAYS_INVALID: 'Hari cutoff harus antara 0-30',
    CUTOFF_HOURS_INVALID: 'Jam cutoff harus antara 0-23',
    BLACKLIST_STRIKES_INVALID: 'Jumlah strike harus antara 1-10',

    // Weekly Cutoff Mode
    WEEKLY_CUTOFF_PASSED: 'Waktu pemesanan untuk minggu ini sudah ditutup',
    DATE_NOT_ORDERABLE: 'Tanggal ini tidak dapat dipesan',
    WEEK_NOT_ORDERABLE: 'Minggu ini belum dapat dipesan atau sudah lewat',
    INVALID_ORDERABLE_DAY: 'Hari ini tidak termasuk hari yang dapat dipesan',

    // General
    VALIDATION_ERROR: 'Data yang Anda masukkan tidak valid',
    SERVER_ERROR: 'Terjadi kesalahan pada server. Tim kami akan segera memperbaikinya',
    NOT_FOUND: 'Data yang Anda cari tidak ditemukan',
    NETWORK_ERROR: 'Koneksi terputus. Periksa koneksi internet Anda',
    DUPLICATE_ENTRY: 'Data yang sama sudah ada di sistem',

    // File Upload
    FILE_TOO_LARGE: 'Ukuran file terlalu besar. Maksimal {size}MB',
    INVALID_FILE_TYPE: 'Tipe file tidak didukung. Gunakan format {types}',
    FILE_UPLOAD_FAILED: 'Gagal mengunggah file. Silakan coba lagi',

    // Database
    DATABASE_ERROR: 'Terjadi kesalahan saat mengakses data. Silakan coba lagi',
    CONNECTION_ERROR: 'Gagal terhubung ke database. Hubungi administrator',
};

/**
 * Format error message with parameters
 * @example formatErrorMessage('MAX_DAYS_EXCEEDED', { days: 7 })
 */
export function formatErrorMessage(key: keyof typeof ErrorMessages, params?: Record<string, any>): string {
    let message = ErrorMessages[key];
    if (params) {
        Object.entries(params).forEach(([k, v]) => {
            message = message.replace(`{${k}}`, String(v));
        });
    }
    return message;
}

/**
 * Get user-friendly error message from error object
 */
export function getUserFriendlyError(error: any): string {
    // If it's already a formatted message
    if (typeof error === 'string') {
        return error;
    }

    // If it's an error object with a message
    if (error?.message) {
        return error.message;
    }

    // Default fallback
    return ErrorMessages.SERVER_ERROR;
}
