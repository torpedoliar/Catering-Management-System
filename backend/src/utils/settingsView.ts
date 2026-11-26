/**
 * K1 (audit 2026-11-25): the Settings row holds SMTP credentials and other
 * admin-only configuration. Never send it to clients as-is.
 *
 * - Non-admins get the row without any admin-only field.
 * - Admins get every field, but the SMTP password is masked (the email
 *   settings page already treats '********' as "unchanged").
 *
 * Use this for every HTTP response, SSE payload and audit-log value built
 * from the Settings row.
 */

const ADMIN_ONLY_FIELDS = [
    'emailEnabled',
    'smtpHost',
    'smtpPort',
    'smtpSecure',
    'smtpUser',
    'smtpPass',
    'smtpFrom',
    'adminEmail',
    'ntpEnabled',
    'ntpServer',
    'ntpSyncInterval',
    'ntpLastSync',
    'ntpOffset',
    'autoBackupEnabled',
    'autoBackupInterval',
    'lastAutoBackup',
    'enableTokenRotation',
] as const;

export const MASKED_SECRET = '********';

export function maskSettingsSecrets<T extends Record<string, any> | null | undefined>(settings: T): T {
    if (!settings || typeof settings !== 'object') return settings;
    if (!('smtpPass' in settings)) return settings;
    return { ...settings, smtpPass: settings.smtpPass ? MASKED_SECRET : null };
}

export function settingsForRole<T extends Record<string, any> | null | undefined>(settings: T, role?: string): Partial<NonNullable<T>> | T {
    if (!settings || typeof settings !== 'object') return settings;
    if (role === 'ADMIN') return maskSettingsSecrets(settings);
    const view: Record<string, any> = { ...settings };
    for (const field of ADMIN_ONLY_FIELDS) delete view[field];
    return view as Partial<NonNullable<T>>;
}
