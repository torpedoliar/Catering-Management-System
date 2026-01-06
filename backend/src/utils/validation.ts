import { z } from 'zod';

// ============================================
// Auth Schemas
// ============================================

export const loginSchema = z.object({
    externalId: z.string().min(1, 'ID Karyawan wajib diisi'),
    password: z.string().min(1, 'Password wajib diisi'),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Password saat ini wajib diisi'),
    newPassword: z.string().min(6, 'Password baru minimal 6 karakter'),
});

// ============================================
// User Schemas
// ============================================

export const createUserSchema = z.object({
    externalId: z.string().min(1, 'ID Karyawan wajib diisi').max(50),
    nik: z.string().regex(/^\d+$/, 'NIK harus berupa angka').max(30).optional().nullable(),
    name: z.string().min(2, 'Nama minimal 2 karakter').max(100),
    email: z.string().email('Format email tidak valid').optional().nullable(),
    password: z.string().min(6, 'Password minimal 6 karakter').optional(),
    company: z.string().min(1, 'Perusahaan wajib diisi'),
    division: z.string().min(1, 'Divisi wajib diisi'),
    department: z.string().min(1, 'Departemen wajib diisi'),
    departmentId: z.string().uuid().optional().nullable(),
    role: z.enum(['USER', 'ADMIN', 'CANTEEN', 'VENDOR']).optional().default('USER'),
    vendorId: z.string().uuid().optional().nullable(),
});

export const updateUserSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    nik: z.string().regex(/^\d+$/, 'NIK harus berupa angka').max(30).optional().nullable(),
    email: z.string().email().optional().nullable(),
    company: z.string().min(1).optional(),
    division: z.string().min(1).optional(),
    department: z.string().min(1).optional(),
    departmentId: z.string().uuid().optional().nullable(),
    role: z.enum(['USER', 'ADMIN', 'CANTEEN', 'VENDOR']).optional(),
    isActive: z.boolean().optional(),
    vendorId: z.string().uuid().optional().nullable(),
});

// ============================================
// Order Schemas
// ============================================

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createOrderSchema = z.object({
    shiftId: z.string().uuid('Shift ID tidak valid'),
    orderDate: z.string().regex(dateRegex, 'Format tanggal harus YYYY-MM-DD').optional(),
    canteenId: z.string().uuid().optional().nullable(),
});

export const bulkOrderSchema = z.object({
    orders: z.array(z.object({
        date: z.string().regex(dateRegex, 'Format tanggal harus YYYY-MM-DD'),
        shiftId: z.string().uuid('Shift ID tidak valid'),
    })).min(1, 'Minimal 1 pesanan').max(30, 'Maksimal 30 pesanan sekaligus'),
    canteenId: z.string().uuid().optional().nullable(),
});

export const cancelOrderSchema = z.object({
    reason: z.string().min(5, 'Alasan pembatalan minimal 5 karakter').max(500).optional(),
});

// ============================================
// Shift Schemas
// ============================================

const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

export const createShiftSchema = z.object({
    name: z.string().min(1, 'Nama shift wajib diisi').max(50),
    startTime: z.string().regex(timeRegex, 'Format waktu tidak valid (HH:mm)'),
    endTime: z.string().regex(timeRegex, 'Format waktu tidak valid (HH:mm)'),
    mealPrice: z.coerce.number().min(0, 'Harga tidak boleh negatif').optional().default(25000),
    description: z.string().max(500).optional().nullable(),
    isActive: z.boolean().optional().default(true),
});

export const updateShiftSchema = createShiftSchema.partial();

// ============================================
// Holiday Schemas
// ============================================

export const createHolidaySchema = z.object({
    date: z.string().regex(dateRegex, 'Format tanggal tidak valid (YYYY-MM-DD)'),
    name: z.string().min(1, 'Nama hari libur wajib diisi').max(100),
    description: z.string().max(500).optional().nullable(),
    shiftId: z.string().uuid().optional().nullable(), // null = fullday
    isActive: z.boolean().optional().default(true),
});

// ============================================
// Settings Schemas
// ============================================

export const updateSettingsSchema = z.object({
    // Mode selection
    cutoffMode: z.enum(['per-shift', 'weekly']).optional(),

    // Per-shift mode settings
    cutoffDays: z.coerce.number().min(0).max(30).optional(),
    cutoffHours: z.coerce.number().min(0).max(23).optional(),
    maxOrderDaysAhead: z.coerce.number().min(1).max(30).optional(),

    // Weekly mode settings
    weeklyCutoffDay: z.coerce.number().min(0).max(6).optional(),
    weeklyCutoffHour: z.coerce.number().min(0).max(23).optional(),
    weeklyCutoffMinute: z.coerce.number().min(0).max(59).optional(),
    orderableDays: z.string().regex(/^[0-6](,[0-6])*$/, 'Format hari tidak valid').optional(),
    maxWeeksAhead: z.coerce.number().min(1).max(4).optional(),

    // Blacklist settings
    blacklistStrikes: z.coerce.number().min(1).max(10).optional(),
    blacklistDuration: z.coerce.number().min(1).max(365).optional(),

    // NTP settings
    ntpEnabled: z.boolean().optional(),
    ntpServer: z.string().optional(),
    ntpTimezone: z.string().optional(),
    ntpSyncInterval: z.coerce.number().min(60).max(86400).optional(),

    // Email settings
    emailEnabled: z.boolean().optional(),
    smtpHost: z.string().optional().nullable(),
    smtpPort: z.coerce.number().min(1).max(65535).optional(),
    smtpSecure: z.boolean().optional(),
    smtpUser: z.string().optional().nullable(),
    smtpPass: z.string().optional().nullable(),
    smtpFrom: z.string().email().optional().nullable(),
    adminEmail: z.string().email().optional().nullable(),

    // Other settings
    checkinPhotoEnabled: z.boolean().optional(),
});

// ============================================
// Message Schemas
// ============================================

export const createMessageSchema = z.object({
    orderId: z.string().uuid().optional().nullable(),
    shiftId: z.string().uuid('Shift ID wajib dipilih'),
    type: z.enum(['COMPLAINT', 'CANCELLATION']),
    content: z.string().min(10, 'Pesan minimal 10 karakter').max(1000),
    orderDate: z.string().regex(dateRegex, 'Format tanggal tidak valid'),
});

// ============================================
// Announcement Schemas
// ============================================

export const createAnnouncementSchema = z.object({
    title: z.string().min(3, 'Judul minimal 3 karakter').max(200),
    content: z.string().min(10, 'Konten minimal 10 karakter').max(5000),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
    expiresAt: z.string().datetime().optional().nullable(),
});

// ============================================
// Query Parameter Schemas
// ============================================

export const paginationSchema = z.object({
    page: z.coerce.number().min(1).optional().default(1),
    limit: z.coerce.number().min(1).max(100).optional().default(20),
});

export const dateRangeSchema = z.object({
    startDate: z.string().regex(dateRegex).optional(),
    endDate: z.string().regex(dateRegex).optional(),
});

// ============================================
// Type exports
// ============================================

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type BulkOrderInput = z.infer<typeof bulkOrderSchema>;
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
