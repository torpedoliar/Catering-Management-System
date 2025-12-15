import { Request, Response, NextFunction } from 'express';
import { ErrorMessages } from '../utils/errorMessages';

/**
 * Custom application error class with status code and error code support
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly isOperational: boolean;

    constructor(
        message: string,
        statusCode: number = 500,
        code: string = 'INTERNAL_ERROR'
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;

        // Maintains proper stack trace for where error was thrown
        Error.captureStackTrace(this, this.constructor);
    }

    // Factory methods for common errors
    static badRequest(message: string, code: string = 'BAD_REQUEST'): AppError {
        return new AppError(message, 400, code);
    }

    static unauthorized(message: string = ErrorMessages.UNAUTHORIZED): AppError {
        return new AppError(message, 401, 'UNAUTHORIZED');
    }

    static forbidden(message: string = ErrorMessages.FORBIDDEN): AppError {
        return new AppError(message, 403, 'FORBIDDEN');
    }

    static notFound(message: string = ErrorMessages.NOT_FOUND): AppError {
        return new AppError(message, 404, 'NOT_FOUND');
    }

    static conflict(message: string, code: string = 'CONFLICT'): AppError {
        return new AppError(message, 409, code);
    }

    static tooManyRequests(message: string, code: string = 'RATE_LIMITED'): AppError {
        return new AppError(message, 429, code);
    }

    static internal(message: string = ErrorMessages.SERVER_ERROR): AppError {
        return new AppError(message, 500, 'INTERNAL_ERROR');
    }
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export const asyncHandler = (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Centralized error handling middleware
 */
export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: NextFunction
) => {
    // Log error details
    console.error('[Error]', {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
    });

    // Handle AppError (operational errors)
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: err.message,
            code: err.code,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        });
    }

    // Handle Prisma errors
    if (err.name === 'PrismaClientKnownRequestError') {
        const prismaError = err as { code?: string; meta?: { target?: string[] } };

        if (prismaError.code === 'P2002') {
            return res.status(409).json({
                error: ErrorMessages.DUPLICATE_ENTRY,
                code: 'DUPLICATE_ENTRY',
            });
        }

        if (prismaError.code === 'P2025') {
            return res.status(404).json({
                error: ErrorMessages.NOT_FOUND,
                code: 'NOT_FOUND',
            });
        }
    }

    // Handle validation errors (from Zod)
    if (err.name === 'ZodError') {
        return res.status(400).json({
            error: ErrorMessages.VALIDATION_ERROR,
            code: 'VALIDATION_ERROR',
            details: (err as unknown as { errors: unknown[] }).errors,
        });
    }

    // Default to 500 internal server error
    res.status(500).json({
        error: ErrorMessages.SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};
