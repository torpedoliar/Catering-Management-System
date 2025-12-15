import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import {
    getEmailSettings,
    updateEmailSettings,
    testEmailConnection,
    sendTestEmail,
    resetEmailTransporter
} from '../services/email.service';

const router = Router();

/**
 * GET /api/email/settings - Get email settings (admin only)
 */
router.get('/settings', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const settings = await getEmailSettings();

        // Hide password in response
        res.json({
            ...settings,
            smtpPass: settings.smtpPass ? '********' : null,
        });
    } catch (error) {
        console.error('Get email settings error:', error);
        res.status(500).json({ error: 'Gagal mengambil pengaturan email' });
    }
});

/**
 * PUT /api/email/settings - Update email settings (admin only)
 */
router.put('/settings', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const {
            emailEnabled,
            smtpHost,
            smtpPort,
            smtpSecure,
            smtpUser,
            smtpPass,
            smtpFrom,
            adminEmail
        } = req.body;

        // Build update data, only include fields that are provided
        const updateData: Record<string, any> = {};

        if (emailEnabled !== undefined) updateData.emailEnabled = emailEnabled;
        if (smtpHost !== undefined) updateData.smtpHost = smtpHost;
        if (smtpPort !== undefined) updateData.smtpPort = Number(smtpPort);
        if (smtpSecure !== undefined) updateData.smtpSecure = smtpSecure;
        if (smtpUser !== undefined) updateData.smtpUser = smtpUser;
        // Only update password if it's not the masked value
        if (smtpPass !== undefined && smtpPass !== '********') {
            updateData.smtpPass = smtpPass;
        }
        if (smtpFrom !== undefined) updateData.smtpFrom = smtpFrom;
        if (adminEmail !== undefined) updateData.adminEmail = adminEmail;

        const settings = await updateEmailSettings(updateData);
        resetEmailTransporter();

        res.json({
            message: 'Pengaturan email berhasil diperbarui',
            settings: {
                ...settings,
                smtpPass: settings.smtpPass ? '********' : null,
            },
        });
    } catch (error) {
        console.error('Update email settings error:', error);
        res.status(500).json({ error: 'Gagal memperbarui pengaturan email' });
    }
});

/**
 * POST /api/email/test-connection - Test SMTP connection (admin only)
 */
router.post('/test-connection', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const result = await testEmailConnection();

        if (result.success) {
            res.json({ message: result.message });
        } else {
            res.status(400).json({ error: result.message });
        }
    } catch (error) {
        console.error('Test email connection error:', error);
        res.status(500).json({ error: 'Gagal menguji koneksi email' });
    }
});

/**
 * POST /api/email/send-test - Send test email (admin only)
 */
router.post('/send-test', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { to } = req.body;

        if (!to) {
            return res.status(400).json({ error: 'Email tujuan harus diisi' });
        }

        const result = await sendTestEmail(to);

        if (result.success) {
            res.json({ message: result.message });
        } else {
            res.status(400).json({ error: result.message });
        }
    } catch (error) {
        console.error('Send test email error:', error);
        res.status(500).json({ error: 'Gagal mengirim email test' });
    }
});

export default router;
