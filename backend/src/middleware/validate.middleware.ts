import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodIssue } from 'zod';
import { ErrorMessages } from '../utils/errorMessages';

/**
 * Validation middleware using Zod schemas
 * @param schema - Zod schema to validate request body against
 */
export const validate = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            const errors = result.error.issues.map((issue: ZodIssue) => ({
                field: issue.path.join('.'),
                message: issue.message,
            }));

            return res.status(400).json({
                error: ErrorMessages.VALIDATION_ERROR,
                code: 'VALIDATION_ERROR',
                details: errors,
            });
        }

        // Replace body with parsed data (handles coercion and defaults)
        req.body = result.data;
        next();
    };
};

/**
 * Validation middleware for query parameters
 * @param schema - Zod schema to validate query params against
 */
export const validateQuery = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.query);

        if (!result.success) {
            const errors = result.error.issues.map((issue: ZodIssue) => ({
                field: issue.path.join('.'),
                message: issue.message,
            }));

            return res.status(400).json({
                error: ErrorMessages.VALIDATION_ERROR,
                code: 'VALIDATION_ERROR',
                details: errors,
            });
        }

        // Type-safe assignment
        const parsedData = result.data as Record<string, string>;
        Object.keys(parsedData).forEach(key => {
            req.query[key] = parsedData[key];
        });
        next();
    };
};

/**
 * Validation middleware for URL parameters
 * @param schema - Zod schema to validate params against
 */
export const validateParams = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.params);

        if (!result.success) {
            return res.status(400).json({
                error: 'Parameter tidak valid',
                code: 'INVALID_PARAMS',
            });
        }

        next();
    };
};
