import { OrderStatus, Role, MessageType } from '@prisma/client';

// ============================================
// Query Filter Types
// ============================================

export interface OrderWhereFilter {
    userId?: string;
    status?: OrderStatus | { in: OrderStatus[] };
    orderDate?: Date | { gte?: Date; lte?: Date };
    shiftId?: string;
    qrCode?: string;
}

export interface UserWhereFilter {
    id?: string;
    externalId?: string;
    isActive?: boolean;
    role?: Role;
    company?: string | { contains: string; mode: 'insensitive' };
    division?: string | { contains: string; mode: 'insensitive' };
    department?: string | { contains: string; mode: 'insensitive' };
    departmentId?: string | null;
    OR?: Array<Record<string, unknown>>;
}

export interface ShiftWhereFilter {
    id?: string;
    name?: string;
    isActive?: boolean;
}

export interface HolidayWhereFilter {
    date?: Date | { gte?: Date; lte?: Date };
    shiftId?: string | null;
    isActive?: boolean;
}

// ============================================
// Bulk Operation Types
// ============================================

export interface BulkOrderRequest {
    date: string;
    shiftId: string;
}

export interface BulkOrderSuccess {
    date: string;
    shiftId: string;
    shiftName?: string;
    orderId?: string;
    qrCode?: string;
    order?: Record<string, unknown>; // Full order object with qrCodeImage
}

export interface BulkOrderFailure {
    date: string;
    shiftId: string;
    reason: string;
}

export interface BulkOrderResult {
    success: BulkOrderSuccess[];
    failed: BulkOrderFailure[];
    totalSuccess: number;
    totalFailed: number;
}

// ============================================
// Import Types
// ============================================

export interface ImportUserData {
    externalId: string;
    nik?: string;
    name: string;
    company: string;
    division: string;
    department: string;
    password?: string;
}

export interface ImportResult {
    created: number;
    updated: number;
    errors: ImportError[];
}

export interface ImportError {
    row?: number;
    message?: string;
    error?: string;
    externalId?: string;
}

// ============================================
// API Response Types
// ============================================

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface ApiSuccessResponse<T = unknown> {
    data?: T;
    message?: string;
}

export interface ApiErrorResponse {
    error: string;
    code?: string;
    details?: unknown;
}

// ============================================
// User Types
// ============================================

export interface UserBasicInfo {
    id: string;
    name: string;
    externalId: string;
    company: string;
    division: string;
    department: string;
    photo?: string | null;
}

export interface UserWithOrders extends UserBasicInfo {
    role: Role;
    email?: string | null;
    noShowCount: number;
    isActive: boolean;
    orders?: OrderBasicInfo[];
}

// ============================================
// Order Types
// ============================================

export interface OrderBasicInfo {
    id: string;
    orderDate: Date;
    status: OrderStatus;
    qrCode: string;
    mealPrice?: number | null;
    checkInTime?: Date | null;
}

export interface OrderWithUser extends OrderBasicInfo {
    user: UserBasicInfo;
    shift: ShiftBasicInfo;
}

// ============================================
// Shift Types
// ============================================

export interface ShiftBasicInfo {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    mealPrice: number;
    isActive: boolean;
}

// ============================================
// Message Types
// ============================================

export interface MessageData {
    orderId?: string;
    shiftId: string;
    userId: string;
    type: MessageType;
    content: string;
    orderDate: Date;
}
