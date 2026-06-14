import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { sseManager } from '../controllers/sse.controller';
import { getNow } from '../services/time.service';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

/**
 * R-002: SSE Ticket endpoint
 * 
 * Since EventSource API does not support custom headers (Authorization: Bearer),
 * we use a short-lived ticket system:
 * 1. Client calls POST /api/sse/ticket (with Bearer token) to get a one-time ticket
 * 2. Client connects to GET /api/sse?ticket=<ticket>&tabId=<tabId>
 * 3. Server validates the ticket, extracts userId/role from it (NOT from query params)
 * 
 * Ticket is a JWT with 30-second expiry, signed with JWT_SECRET.
 */
router.post('/ticket', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Generate short-lived SSE ticket (30 seconds)
        const ticket = jwt.sign(
            {
                id: req.user!.id,
                role: req.user!.role,
                purpose: 'sse',
            },
            jwtSecret,
            { expiresIn: '30s', algorithm: 'HS256', issuer: 'catering-api' }
        );

        res.json({ ticket });
    } catch (error) {
        console.error('SSE ticket error:', error);
        res.status(500).json({ error: 'Failed to generate SSE ticket' });
    }
});

// SSE endpoint for real-time updates (R-002: ticket-based authentication)
router.get('/', (req: Request, res: Response) => {
    const ticket = req.query.ticket as string | undefined;
    const tabId = (req.query.tabId as string) || uuidv4();

    // R-002: Validate ticket (server-side authentication)
    if (!ticket) {
        return res.status(401).json({ error: 'SSE ticket required' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    let decoded: { id: string; role: string; purpose: string };
    try {
        // A-7: alg + issuer pinned to match the sign call above.
        decoded = jwt.verify(ticket, jwtSecret, {
            algorithms: ['HS256'],
            issuer: 'catering-api',
        }) as any;
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired SSE ticket' });
    }

    // Verify it's actually an SSE ticket, not a regular access token
    if (decoded.purpose !== 'sse') {
        return res.status(401).json({ error: 'Invalid ticket type' });
    }

    // R-002: userId and role are derived from the validated ticket, NOT from query params
    const userId = decoded.id;
    const role = decoded.role;
    const clientId = uuidv4();

    // Add client to SSE manager with server-verified identity
    sseManager.addClient(clientId, tabId, res, userId, role);

    // Send heartbeat every 10 seconds to keep connection alive
    const heartbeat = setInterval(() => {
        try {
            res.write(`event: heartbeat\ndata: ${JSON.stringify({
                time: getNow().toISOString(),
                clientId,
                tabId,
            })}\n\n`);
        } catch (error) {
            clearInterval(heartbeat);
            sseManager.removeClient(clientId);
        }
    }, 10000);

    // Handle client disconnect
    req.on('close', () => {
        clearInterval(heartbeat);
        sseManager.removeClient(clientId);
    });

    req.on('error', () => {
        clearInterval(heartbeat);
        sseManager.removeClient(clientId);
    });
});

// Get current SSE status (for admin monitoring) - R-002: requires auth
router.get('/status', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
    res.json(sseManager.getStatus());
});

// Manual broadcast endpoint (for testing/admin) - R-002: requires auth
router.post('/broadcast', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
    const { event, data } = req.body;

    if (!event) {
        return res.status(400).json({ error: 'Event name is required' });
    }

    sseManager.broadcast(event, data || {});

    res.json({
        success: true,
        event,
        clientCount: sseManager.getClientCount()
    });
});

export default router;
