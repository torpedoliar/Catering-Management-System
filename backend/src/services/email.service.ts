import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma';

interface EmailSettings {
    emailEnabled: boolean;
    smtpHost: string | null;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string | null;
    smtpPass: string | null;
    smtpFrom: string | null;
    adminEmail: string | null;
}

interface EmailPayload {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

interface ComplaintData {
    userName: string;
    userExternalId: string;
    userEmail?: string | null;
    shiftName: string;
    orderDate: string;
    content: string;
    createdAt: string;
}

let transporter: nodemailer.Transporter | null = null;
let cachedSettings: EmailSettings | null = null;

/**
 * Get email settings from database
 */
export async function getEmailSettings(): Promise<EmailSettings> {
    const settings = await prisma.settings.findUnique({
        where: { id: 'default' }
    });

    return {
        emailEnabled: settings?.emailEnabled ?? false,
        smtpHost: settings?.smtpHost ?? null,
        smtpPort: settings?.smtpPort ?? 587,
        smtpSecure: settings?.smtpSecure ?? false,
        smtpUser: settings?.smtpUser ?? null,
        smtpPass: settings?.smtpPass ?? null,
        smtpFrom: settings?.smtpFrom ?? null,
        adminEmail: settings?.adminEmail ?? null,
    };
}

/**
 * Update email settings in database
 */
export async function updateEmailSettings(data: Partial<EmailSettings>): Promise<EmailSettings> {
    await prisma.settings.upsert({
        where: { id: 'default' },
        update: {
            ...(data.emailEnabled !== undefined && { emailEnabled: data.emailEnabled }),
            ...(data.smtpHost !== undefined && { smtpHost: data.smtpHost }),
            ...(data.smtpPort !== undefined && { smtpPort: data.smtpPort }),
            ...(data.smtpSecure !== undefined && { smtpSecure: data.smtpSecure }),
            ...(data.smtpUser !== undefined && { smtpUser: data.smtpUser }),
            ...(data.smtpPass !== undefined && { smtpPass: data.smtpPass }),
            ...(data.smtpFrom !== undefined && { smtpFrom: data.smtpFrom }),
            ...(data.adminEmail !== undefined && { adminEmail: data.adminEmail }),
        },
        create: {
            id: 'default',
            emailEnabled: data.emailEnabled ?? false,
            smtpHost: data.smtpHost ?? null,
            smtpPort: data.smtpPort ?? 587,
            smtpSecure: data.smtpSecure ?? false,
            smtpUser: data.smtpUser ?? null,
            smtpPass: data.smtpPass ?? null,
            smtpFrom: data.smtpFrom ?? null,
            adminEmail: data.adminEmail ?? null,
        }
    });

    // Refresh cached settings and transporter
    cachedSettings = null;
    transporter = null;

    return getEmailSettings();
}

/**
 * Initialize or get nodemailer transporter
 */
async function getTransporter(): Promise<nodemailer.Transporter | null> {
    if (transporter) return transporter;

    const settings = cachedSettings || await getEmailSettings();
    cachedSettings = settings;

    if (!settings.emailEnabled || !settings.smtpHost || !settings.smtpUser) {
        console.log('[Email] Email is disabled or not configured');
        return null;
    }

    try {
        transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort,
            secure: settings.smtpSecure,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPass || '',
            },
        });

        console.log(`[Email] Transporter initialized for ${settings.smtpHost}:${settings.smtpPort}`);
        return transporter;
    } catch (error) {
        console.error('[Email] Failed to create transporter:', error);
        return null;
    }
}

/**
 * Test email connection
 */
export async function testEmailConnection(): Promise<{ success: boolean; message: string }> {
    try {
        const transport = await getTransporter();

        if (!transport) {
            return { success: false, message: 'Email tidak dikonfigurasi atau dinonaktifkan' };
        }

        await transport.verify();
        return { success: true, message: 'Koneksi SMTP berhasil' };
    } catch (error: any) {
        console.error('[Email] Connection test failed:', error);
        return { success: false, message: error.message || 'Gagal terhubung ke SMTP server' };
    }
}

/**
 * Send email
 */
export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
        const transport = await getTransporter();
        const settings = cachedSettings || await getEmailSettings();

        if (!transport) {
            return { success: false, error: 'Email tidak dikonfigurasi' };
        }

        const fromAddress = settings.smtpFrom || settings.smtpUser;
        if (!fromAddress) {
            return { success: false, error: 'Alamat pengirim email tidak dikonfigurasi' };
        }

        const mailOptions = {
            from: fromAddress,
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
        };

        const info = await transport.sendMail(mailOptions) as { messageId: string };
        console.log(`[Email] Sent to ${payload.to}: ${info.messageId}`);

        return { success: true, messageId: info.messageId };
    } catch (error: any) {
        console.error('[Email] Send failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send test email
 */
export async function sendTestEmail(to: string): Promise<{ success: boolean; message: string }> {
    const result = await sendEmail({
        to,
        subject: 'Test Email - Catering Management System',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2563eb;">✉️ Test Email Berhasil!</h2>
                <p>Jika Anda menerima email ini, berarti konfigurasi SMTP sudah benar.</p>
                <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="color: #6b7280; font-size: 12px;">
                    Email ini dikirim otomatis oleh Catering Management System.
                </p>
            </div>
        `,
        text: 'Test Email Berhasil! Jika Anda menerima email ini, berarti konfigurasi SMTP sudah benar.',
    });

    if (result.success) {
        return { success: true, message: `Email test berhasil dikirim ke ${to}` };
    } else {
        return { success: false, message: result.error || 'Gagal mengirim email test' };
    }
}

/**
 * Send complaint notification to admin
 */
export async function sendComplaintNotification(complaint: ComplaintData): Promise<{ success: boolean; error?: string }> {
    const settings = cachedSettings || await getEmailSettings();

    if (!settings.emailEnabled || !settings.adminEmail) {
        console.log('[Email] Complaint notification skipped - email disabled or no admin email');
        return { success: false, error: 'Email tidak aktif atau admin email tidak dikonfigurasi' };
    }

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
            <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 20px; border-radius: 12px 12px 0 0;">
                <h2 style="margin: 0;">⚠️ Keluhan Baru Diterima</h2>
            </div>
            
            <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; width: 120px;">Pengirim</td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-weight: 600;">${complaint.userName}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">ID Karyawan</td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">${complaint.userExternalId}</td>
                    </tr>
                    ${complaint.userEmail ? `
                    <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">Email</td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">${complaint.userEmail}</td>
                    </tr>
                    ` : ''}
                    <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">Tanggal Order</td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">${complaint.orderDate}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b;">Shift</td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">${complaint.shiftName}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px 0; color: #64748b;">Waktu Kirim</td>
                        <td style="padding: 12px 0;">${complaint.createdAt}</td>
                    </tr>
                </table>
                
                <div style="margin-top: 20px; padding: 16px; background-color: #fef2f2; border-radius: 8px; border-left: 4px solid #ef4444;">
                    <p style="margin: 0 0 8px 0; color: #b91c1c; font-weight: 600;">Isi Keluhan:</p>
                    <p style="margin: 0; color: #1f2937; line-height: 1.6;">${complaint.content}</p>
                </div>
            </div>
            
            <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 20px;">
                Email ini dikirim otomatis oleh Catering Management System
            </p>
        </div>
    `;

    return sendEmail({
        to: settings.adminEmail,
        subject: `[KELUHAN] ${complaint.userName} - ${complaint.orderDate}`,
        html,
        text: `Keluhan Baru dari ${complaint.userName} (${complaint.userExternalId})\n\nTanggal: ${complaint.orderDate}\nShift: ${complaint.shiftName}\n\nIsi Keluhan:\n${complaint.content}`,
    });
}

/**
 * Reset transporter (call when settings change)
 */
export function resetEmailTransporter(): void {
    transporter = null;
    cachedSettings = null;
    console.log('[Email] Transporter reset');
}
