import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import { blockVendorMiddleware } from './blockVendor.middleware';
import type { AuthRequest } from './auth.middleware';

function mockReqRes(role: string | undefined) {
    const req = {
        user: role ? { id: 'u1', externalId: '001', role: role } : undefined,
    } as AuthRequest;
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status, json } as unknown as Response;
    const next = vi.fn() as NextFunction;
    return { req, res, next, status, json };
}

describe('blockVendorMiddleware', () => {
    it('returns 403 when role is VENDOR', () => {
        const { req, res, next, status, json } = mockReqRes('VENDOR');
        blockVendorMiddleware(req, res, next);
        expect(status).toHaveBeenCalledWith(403);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'FORBIDDEN' }));
        expect(next).not.toHaveBeenCalled();
    });

    it('calls next() for USER', () => {
        const { req, res, next, status } = mockReqRes('USER');
        blockVendorMiddleware(req, res, next);
        expect(status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    it('calls next() for CANTEEN', () => {
        const { req, res, next, status } = mockReqRes('CANTEEN');
        blockVendorMiddleware(req, res, next);
        expect(status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    it('calls next() for ADMIN', () => {
        const { req, res, next, status } = mockReqRes('ADMIN');
        blockVendorMiddleware(req, res, next);
        expect(status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    it('calls next() when user is undefined (no auth)', () => {
        const { req, res, next, status } = mockReqRes(undefined);
        blockVendorMiddleware(req, res, next);
        expect(status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });
});
