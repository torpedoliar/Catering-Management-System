import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

/**
 * Block VENDOR role from mutating order/checkin endpoints.
 *
 * The auth layer does not have a single "mutations" role-allow list — instead,
 * each order/checkin route is responsible for rejecting VENDOR. Some
 * handlers do this inline (e.g. order/create.ts and order/bulk.ts already
 * check `req.user?.role === 'VENDOR'`), but a few routes (cancel, checkin
 * QR fetch) were missed. This middleware centralizes the rule.
 *
 * Audit refs: A-1 (cancel), A-3 (checkin QR fetch).
 *
 * @example
 *   router.post('/:id/cancel', authMiddleware, blockVendorMiddleware, async (req, res) => { ... });
 */
export function blockVendorMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
    if (req.user?.role === 'VENDOR') {
        return res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Vendor role tidak diizinkan untuk operasi ini'
        });
    }
    next();
}
