/**
 * Shared imports, types, and utilities for order routes.
 * Used by all order route modules to avoid duplication.
 */

import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';
import { AuthRequest, authMiddleware, adminMiddleware, canteenMiddleware } from '../../middleware/auth.middleware';
import { cutoffMiddleware } from '../../middleware/cutoff.middleware';
import { blacklistMiddleware } from '../../middleware/blacklist.middleware';
import { sseManager } from '../../controllers/sse.controller';
import { getNow, getNowUTC, getToday, getTomorrow, isPastCutoff, isPastCutoffForDate, isDateOrderableWeekly } from '../../services/time.service';
import { logOrder, getRequestContext } from '../../services/audit.service';
import { ErrorMessages, formatErrorMessage } from '../../utils/errorMessages';
import { apiRateLimitMiddleware } from '../../services/rate-limiter.service';
import { OrderService } from '../../services/order.service';
import { validate } from '../../middleware/validate.middleware';
import { createOrderSchema, bulkOrderSchema } from '../../utils/validation';
import { OrderWhereFilter, BulkOrderSuccess, BulkOrderFailure } from '../../types';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { isOvernightShift } from '../../utils/shift-utils';

// Multer config for check-in photo
const storage = multer.memoryStorage();
export const upload = multer({ storage });

// Check-in uploads directory
export const checkinUploadDir = path.join(__dirname, '../../../uploads/checkins');

// Ensure directory exists on module load
if (!fs.existsSync(checkinUploadDir)) {
    fs.mkdirSync(checkinUploadDir, { recursive: true });
}

// Re-export all dependencies for convenience
export {
    Router,
    Response,
    prisma,
    QRCode,
    uuidv4,
    ExcelJS,
    AuthRequest,
    authMiddleware,
    adminMiddleware,
    canteenMiddleware,
    cutoffMiddleware,
    blacklistMiddleware,
    sseManager,
    getNow,
    getNowUTC,
    getToday,
    getTomorrow,
    isPastCutoff,
    isPastCutoffForDate,
    isDateOrderableWeekly,
    logOrder,
    getRequestContext,
    ErrorMessages,
    formatErrorMessage,
    apiRateLimitMiddleware,
    OrderService,
    validate,
    createOrderSchema,
    bulkOrderSchema,
    OrderWhereFilter,
    BulkOrderSuccess,
    BulkOrderFailure,
    multer,
    sharp,
    fs,
    path,
    isOvernightShift,
};
