import toast from 'react-hot-toast';

/**
 * Handle API errors with user-friendly Indonesian messages
 */
export const handleApiError = (error: any, customMessage?: string) => {
    console.error('API Error:', error);

    if (error.response) {
        // Server responded with error status
        const status = error.response.status;
        const serverMessage = error.response.data?.error || error.response.data?.message;

        // Use server message if available, otherwise use default for status code
        const message = serverMessage || getDefaultErrorMessage(status);

        toast.error(customMessage || message, {
            duration: 4000,
            position: 'top-center',
        });

        // Handle specific status codes
        if (status === 401) {
            // Only redirect if not already on login page
            if (!window.location.pathname.includes('/login')) {
                setTimeout(() => {
                    window.location.href = '/login';
                }, 1500);
            }
        }

        return message;
    } else if (error.request) {
        // Request made but no response received
        const message = 'Koneksi terputus. Periksa koneksi internet Anda';
        toast.error(message, {
            duration: 5000,
            position: 'top-center',
        });
        return message;
    } else {
        // Something else happened
        const message = customMessage || 'Terjadi kesalahan. Silakan coba lagi';
        toast.error(message, {
            duration: 4000,
            position: 'top-center',
        });
        return message;
    }
};

/**
 * Get default error message based on HTTP status code
 */
function getDefaultErrorMessage(status: number): string {
    switch (status) {
        case 400:
            return 'Data yang Anda masukkan tidak valid';
        case 401:
            return 'Sesi Anda telah berakhir. Silakan login kembali';
        case 403:
            return 'Anda tidak memiliki izin untuk melakukan tindakan ini';
        case 404:
            return 'Data yang Anda cari tidak ditemukan';
        case 409:
            return 'Data yang sama sudah ada di sistem';
        case 500:
            return 'Terjadi kesalahan pada server. Tim kami akan segera memperbaikinya';
        case 503:
            return 'Server sedang sibuk. Silakan coba lagi sebentar';
        default:
            return 'Terjadi kesalahan. Silakan coba lagi';
    }
}

/**
 * Show success toast
 */
export const showSuccess = (message: string) => {
    toast.success(message, {
        duration: 3000,
        position: 'top-center',
    });
};

/**
 * Show info toast
 */
export const showInfo = (message: string) => {
    toast(message, {
        duration: 3000,
        position: 'top-center',
        icon: 'ℹ️',
    });
};

/**
 * Show warning toast
 */
export const showWarning = (message: string) => {
    toast(message, {
        duration: 4000,
        position: 'top-center',
        icon: '⚠️',
    });
};
