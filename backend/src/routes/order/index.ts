/**
 * Order Routes Index
 * Combines all order route modules into a single router
 */

import { Router } from 'express';

// Import route modules
import listRoutes from './list';
import createRoutes from './create';
import bulkRoutes from './bulk';
import checkinRoutes from './checkin';
import cancelRoutes from './cancel';
import adminRoutes from './admin';

const router = Router();

// Mount route modules - order matters for path matching!
// More specific paths first, then generic /:id patterns last

// User routes
router.use('/', listRoutes);      // GET /my-orders, GET /today
router.use('/', createRoutes);    // POST /
router.use('/', bulkRoutes);      // POST /bulk

// Check-in routes (must come before /:id patterns)
router.use('/', checkinRoutes);   // GET /:id/qrcode, POST /checkin/qr, POST /checkin/manual

// Cancel route
router.use('/', cancelRoutes);    // POST /:id/cancel

// Admin routes (GET / must be last to not conflict with others)
router.use('/', adminRoutes);     // GET /, POST /process-noshows

// Export combined router
export default router;

// Re-export shared utilities for other modules that might need them
export * from './shared';
