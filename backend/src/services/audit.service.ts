import { PrismaClient, AuditAction } from '@prisma/client';
import { Request } from 'express';
import { getNow } from './time.service';

const prisma = new PrismaClient();

interface AuditUser {
    id?: string;
    name?: string;
    role?: string;
    externalId?: string;
}

interface AuditLogParams {
    action: AuditAction;
    entity: string;
    entityId?: string;
    entityName?: string;
    oldValue?: any;
    newValue?: any;
    changes?: any;
    description?: string;
    metadata?: any;
    success?: boolean;
    errorMessage?: string;
}

interface RequestContext {
    ipAddress?: string;
    userAgent?: string;
    requestPath?: string;
    requestMethod?: string;
}

/**
 * Extract request context from Express request
 */
export function getRequestContext(req: Request): RequestContext {
    return {
        ipAddress: req.ip || req.socket?.remoteAddress || req.headers['x-forwarded-for']?.toString().split(',')[0],
        userAgent: req.headers['user-agent'],
        requestPath: req.originalUrl || req.path,
        requestMethod: req.method,
    };
}

/**
 * Calculate what changed between old and new values
 */
function calculateChanges(oldValue: any, newValue: any): any {
    if (!oldValue || !newValue) return null;
    
    const changes: Record<string, { from: any; to: any }> = {};
    const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
    
    for (const key of allKeys) {
        // Skip internal fields
        if (['password', 'createdAt', 'updatedAt'].includes(key)) continue;
        
        const oldVal = oldValue[key];
        const newVal = newValue[key];
        
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes[key] = { from: oldVal, to: newVal };
        }
    }
    
    return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Sanitize sensitive data from objects before logging
 */
function sanitizeData(data: any): any {
    if (!data) return data;
    
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
    const sanitized = { ...data };
    
    for (const field of sensitiveFields) {
        if (sanitized[field]) {
            sanitized[field] = '[REDACTED]';
        }
    }
    
    return sanitized;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(
    user: AuditUser | null,
    params: AuditLogParams,
    context?: RequestContext
): Promise<void> {
    try {
        const sanitizedOldValue = sanitizeData(params.oldValue);
        const sanitizedNewValue = sanitizeData(params.newValue);
        const changes = params.changes || calculateChanges(sanitizedOldValue, sanitizedNewValue);

        await prisma.auditLog.create({
            data: {
                timestamp: getNow(),
                userId: user?.id || null,
                userName: user?.name || user?.externalId || null,
                userRole: user?.role || null,
                action: params.action,
                entity: params.entity,
                entityId: params.entityId || null,
                entityName: params.entityName || null,
                oldValue: sanitizedOldValue || undefined,
                newValue: sanitizedNewValue || undefined,
                changes: changes || undefined,
                ipAddress: context?.ipAddress || null,
                userAgent: context?.userAgent || null,
                requestPath: context?.requestPath || null,
                requestMethod: context?.requestMethod || null,
                metadata: params.metadata || undefined,
                description: params.description || null,
                success: params.success ?? true,
                errorMessage: params.errorMessage || null,
            },
        });
    } catch (error) {
        // Don't let audit logging errors affect the main operation
        console.error('[Audit] Failed to create audit log:', error);
    }
}

/**
 * Helper function to log auth events
 */
export async function logAuth(
    action: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'PASSWORD_CHANGE',
    user: AuditUser | null,
    context: RequestContext,
    options?: { success?: boolean; errorMessage?: string; metadata?: any }
): Promise<void> {
    const descriptions: Record<string, string> = {
        LOGIN: `User ${user?.name || 'Unknown'} logged in`,
        LOGOUT: `User ${user?.name || 'Unknown'} logged out`,
        LOGIN_FAILED: `Failed login attempt for user ${user?.externalId || 'Unknown'}`,
        PASSWORD_CHANGE: `User ${user?.name || 'Unknown'} changed password`,
    };

    await createAuditLog(user, {
        action: AuditAction[action],
        entity: 'Auth',
        entityId: user?.id,
        entityName: user?.name || user?.externalId,
        description: descriptions[action],
        success: options?.success ?? true,
        errorMessage: options?.errorMessage,
        metadata: options?.metadata,
    }, context);
}

/**
 * Helper function to log order events
 */
export async function logOrder(
    action: 'ORDER_CREATED' | 'ORDER_CANCELLED' | 'ORDER_CHECKIN' | 'ORDER_NOSHOW',
    user: AuditUser | null,
    order: any,
    context: RequestContext,
    options?: { oldValue?: any; metadata?: any }
): Promise<void> {
    const descriptions: Record<string, string> = {
        ORDER_CREATED: `Order created for ${order.shift?.name || 'Unknown Shift'}`,
        ORDER_CANCELLED: `Order cancelled`,
        ORDER_CHECKIN: `Order checked in at canteen`,
        ORDER_NOSHOW: `Order marked as no-show`,
    };

    await createAuditLog(user, {
        action: AuditAction[action],
        entity: 'Order',
        entityId: order.id,
        entityName: `Order #${order.id?.slice(-8)}`,
        oldValue: options?.oldValue,
        newValue: order,
        description: descriptions[action],
        metadata: {
            shiftId: order.shiftId,
            shiftName: order.shift?.name,
            orderDate: order.orderDate,
            ...options?.metadata,
        },
    }, context);
}

/**
 * Helper function to log user management events
 */
export async function logUserManagement(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    performer: AuditUser | null,
    targetUser: any,
    context: RequestContext,
    options?: { oldValue?: any; metadata?: any }
): Promise<void> {
    const descriptions: Record<string, string> = {
        CREATE: `User ${targetUser.name} (${targetUser.externalId}) created`,
        UPDATE: `User ${targetUser.name} (${targetUser.externalId}) updated`,
        DELETE: `User ${targetUser.name} (${targetUser.externalId}) deleted/deactivated`,
    };

    await createAuditLog(performer, {
        action: AuditAction[action],
        entity: 'User',
        entityId: targetUser.id,
        entityName: targetUser.name,
        oldValue: options?.oldValue,
        newValue: action !== 'DELETE' ? targetUser : undefined,
        description: descriptions[action],
        metadata: options?.metadata,
    }, context);
}

/**
 * Helper function to log blacklist events
 */
export async function logBlacklist(
    action: 'USER_BLACKLISTED' | 'USER_UNBLOCKED' | 'STRIKES_RESET',
    performer: AuditUser | null,
    targetUser: any,
    context: RequestContext,
    options?: { blacklist?: any; previousStrikes?: number; metadata?: any; success?: boolean; errorMessage?: string }
): Promise<void> {
    const isSuccess = options?.success !== false;
    const isFailed = options?.metadata?.failedPasswordConfirmation === true;
    
    const descriptions: Record<string, string> = {
        USER_BLACKLISTED: isFailed 
            ? `Failed blacklist attempt for user ${targetUser.name || 'Unknown'}: Invalid password`
            : `User ${targetUser.name} blacklisted: ${options?.blacklist?.reason || 'No reason'}`,
        USER_UNBLOCKED: isFailed
            ? `Failed unblock attempt: Invalid password`
            : `User ${targetUser.name} unblocked from blacklist`,
        STRIKES_RESET: `User ${targetUser.name} strikes reset from ${options?.previousStrikes || 0} to 0`,
    };

    await createAuditLog(performer, {
        action: AuditAction[action],
        entity: 'Blacklist',
        entityId: options?.blacklist?.id || targetUser.id,
        entityName: targetUser.name || 'Unknown',
        newValue: options?.blacklist,
        description: descriptions[action],
        success: isSuccess && !isFailed,
        errorMessage: isFailed ? 'Password confirmation failed' : options?.errorMessage,
        metadata: {
            targetUserId: targetUser.id,
            targetUserName: targetUser.name,
            reason: options?.blacklist?.reason,
            endDate: options?.blacklist?.endDate,
            previousStrikes: options?.previousStrikes,
            ...options?.metadata,
        },
    }, context);
}

/**
 * Helper function to log settings changes
 */
export async function logSettings(
    performer: AuditUser | null,
    oldSettings: any,
    newSettings: any,
    context: RequestContext,
    options?: { settingsType?: string; metadata?: any }
): Promise<void> {
    await createAuditLog(performer, {
        action: AuditAction.SETTINGS_UPDATE,
        entity: 'Settings',
        entityId: 'default',
        entityName: options?.settingsType || 'System Settings',
        oldValue: oldSettings,
        newValue: newSettings,
        description: `${options?.settingsType || 'Settings'} updated`,
        metadata: options?.metadata,
    }, context);
}

/**
 * Helper function to log shift management
 */
export async function logShift(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    performer: AuditUser | null,
    shift: any,
    context: RequestContext,
    options?: { oldValue?: any; metadata?: any }
): Promise<void> {
    const descriptions: Record<string, string> = {
        CREATE: `Shift "${shift.name}" created`,
        UPDATE: `Shift "${shift.name}" updated`,
        DELETE: `Shift "${shift.name}" deleted/deactivated`,
    };

    await createAuditLog(performer, {
        action: AuditAction[action],
        entity: 'Shift',
        entityId: shift.id,
        entityName: shift.name,
        oldValue: options?.oldValue,
        newValue: action !== 'DELETE' ? shift : undefined,
        description: descriptions[action],
        metadata: options?.metadata,
    }, context);
}

/**
 * Helper function to log company/division/department management
 */
export async function logOrganization(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    performer: AuditUser | null,
    entityType: 'Company' | 'Division' | 'Department',
    entity: any,
    context: RequestContext,
    options?: { oldValue?: any; metadata?: any }
): Promise<void> {
    const descriptions: Record<string, Record<string, string>> = {
        Company: {
            CREATE: `Company "${entity.name}" created`,
            UPDATE: `Company "${entity.name}" updated`,
            DELETE: `Company "${entity.name}" deleted/deactivated`,
        },
        Division: {
            CREATE: `Division "${entity.name}" created`,
            UPDATE: `Division "${entity.name}" updated`,
            DELETE: `Division "${entity.name}" deleted/deactivated`,
        },
        Department: {
            CREATE: `Department "${entity.name}" created`,
            UPDATE: `Department "${entity.name}" updated`,
            DELETE: `Department "${entity.name}" deleted/deactivated`,
        },
    };

    await createAuditLog(performer, {
        action: AuditAction[action],
        entity: entityType,
        entityId: entity.id,
        entityName: entity.name,
        oldValue: options?.oldValue,
        newValue: action !== 'DELETE' ? entity : undefined,
        description: descriptions[entityType][action],
        metadata: options?.metadata,
    }, context);
}

/**
 * Helper function to log holiday management
 */
export async function logHoliday(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    performer: AuditUser | null,
    holiday: any,
    context: RequestContext,
    options?: { oldValue?: any; metadata?: any }
): Promise<void> {
    const descriptions: Record<string, string> = {
        CREATE: `Holiday "${holiday.name}" created for ${holiday.date}`,
        UPDATE: `Holiday "${holiday.name}" updated`,
        DELETE: `Holiday "${holiday.name}" deleted`,
    };

    await createAuditLog(performer, {
        action: AuditAction[action],
        entity: 'Holiday',
        entityId: holiday.id,
        entityName: holiday.name,
        oldValue: options?.oldValue,
        newValue: action !== 'DELETE' ? holiday : undefined,
        description: descriptions[action],
        metadata: {
            date: holiday.date,
            shiftId: holiday.shiftId,
            ...options?.metadata,
        },
    }, context);
}

/**
 * Helper function to log data import/export
 */
export async function logDataOperation(
    action: 'IMPORT_DATA' | 'EXPORT_DATA',
    performer: AuditUser | null,
    context: RequestContext,
    options: { dataType: string; recordCount?: number; filename?: string; metadata?: any }
): Promise<void> {
    const descriptions: Record<string, string> = {
        IMPORT_DATA: `Imported ${options.recordCount || 0} ${options.dataType} records`,
        EXPORT_DATA: `Exported ${options.dataType} data`,
    };

    await createAuditLog(performer, {
        action: AuditAction[action],
        entity: options.dataType,
        description: descriptions[action],
        metadata: {
            recordCount: options.recordCount,
            filename: options.filename,
            ...options.metadata,
        },
    }, context);
}

/**
 * Helper function to log system events
 */
export async function logSystem(
    action: AuditAction,
    description: string,
    options?: { entity?: string; entityId?: string; metadata?: any; success?: boolean; errorMessage?: string }
): Promise<void> {
    await createAuditLog(null, {
        action,
        entity: options?.entity || 'System',
        entityId: options?.entityId,
        description,
        metadata: options?.metadata,
        success: options?.success ?? true,
        errorMessage: options?.errorMessage,
    });
}

/**
 * Query audit logs with filters
 */
export interface AuditLogQuery {
    page?: number;
    limit?: number;
    userId?: string;
    action?: AuditAction;
    entity?: string;
    entityId?: string;
    startDate?: Date;
    endDate?: Date;
    success?: boolean;
    search?: string;
}

export async function queryAuditLogs(query: AuditLogQuery) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;
    if (query.entity) where.entity = query.entity;
    if (query.entityId) where.entityId = query.entityId;
    if (query.success !== undefined) where.success = query.success;

    if (query.startDate || query.endDate) {
        where.timestamp = {};
        if (query.startDate) where.timestamp.gte = query.startDate;
        if (query.endDate) where.timestamp.lte = query.endDate;
    }

    if (query.search) {
        where.OR = [
            { userName: { contains: query.search, mode: 'insensitive' } },
            { entityName: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
        ];
    }

    const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            skip,
            take: limit,
        }),
        prisma.auditLog.count({ where }),
    ]);

    return {
        logs,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

/**
 * Get audit log statistics
 */
export async function getAuditStats(days: number = 7) {
    const startDate = getNow();
    startDate.setDate(startDate.getDate() - days);

    const [totalLogs, actionCounts, entityCounts, failedCount, recentActivity] = await Promise.all([
        prisma.auditLog.count({
            where: { timestamp: { gte: startDate } },
        }),
        prisma.auditLog.groupBy({
            by: ['action'],
            where: { timestamp: { gte: startDate } },
            _count: { id: true },
        }),
        prisma.auditLog.groupBy({
            by: ['entity'],
            where: { timestamp: { gte: startDate } },
            _count: { id: true },
        }),
        prisma.auditLog.count({
            where: { timestamp: { gte: startDate }, success: false },
        }),
        prisma.auditLog.findMany({
            where: { timestamp: { gte: startDate } },
            orderBy: { timestamp: 'desc' },
            take: 10,
            select: {
                id: true,
                timestamp: true,
                action: true,
                entity: true,
                userName: true,
                description: true,
                success: true,
            },
        }),
    ]);

    return {
        period: `Last ${days} days`,
        totalLogs,
        failedCount,
        successRate: totalLogs > 0 ? ((totalLogs - failedCount) / totalLogs * 100).toFixed(1) : 100,
        byAction: actionCounts.map(a => ({ action: a.action, count: a._count.id })),
        byEntity: entityCounts.map(e => ({ entity: e.entity, count: e._count.id })),
        recentActivity,
    };
}

/**
 * Clean up old audit logs (retention policy)
 */
export async function cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    const cutoffDate = getNow();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.auditLog.deleteMany({
        where: { timestamp: { lt: cutoffDate } },
    });

    if (result.count > 0) {
        await logSystem(AuditAction.OTHER, `Cleaned up ${result.count} audit logs older than ${retentionDays} days`);
    }

    return result.count;
}
