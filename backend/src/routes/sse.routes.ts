import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { sseManager } from '../controllers/sse.controller';
import { getNow } from '../services/time.service';

const router = Router();

// SSE endpoint for real-time updates
router.get('/', (req: Request, res: Response) => {
    const clientId = uuidv4();
    const tabId = (req.query.tabId as string) || uuidv4();
    const userId = req.query.userId as string | undefined;
    const role = req.query.role as string | undefined;

    // Add client to SSE manager with tab tracking
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

// Get current SSE status (for admin monitoring)
router.get('/status', (req: Request, res: Response) => {
    res.json(sseManager.getStatus());
});

// Manual broadcast endpoint (for testing/admin)
router.post('/broadcast', (req: Request, res: Response) => {
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
