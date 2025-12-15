import { useState, useEffect } from 'react';
import { api } from '../../contexts/AuthContext';
import { Mail, Server, Lock, Send, Loader2, CheckCircle, XCircle, Eye, EyeOff, TestTube } from 'lucide-react';
import toast from 'react-hot-toast';

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

export default function EmailSettingsPage() {
    const [settings, setSettings] = useState<EmailSettings>({
        emailEnabled: false,
        smtpHost: '',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: '',
        smtpPass: '',
        smtpFrom: '',
        adminEmail: '',
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [testEmail, setTestEmail] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const res = await api.get('/api/email/settings');
            setSettings(res.data);
            setTestEmail(res.data.adminEmail || '');
        } catch (error) {
            console.error('Failed to load email settings:', error);
            toast.error('Gagal memuat pengaturan email');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await api.put('/api/email/settings', settings);
            toast.success('Pengaturan email berhasil disimpan');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menyimpan pengaturan');
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        try {
            await api.post('/api/email/test-connection');
            toast.success('Koneksi SMTP berhasil');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal terhubung ke SMTP');
        } finally {
            setIsTesting(false);
        }
    };

    const handleSendTestEmail = async () => {
        if (!testEmail) {
            toast.error('Masukkan alamat email tujuan');
            return;
        }
        setIsTesting(true);
        try {
            await api.post('/api/email/send-test', { to: testEmail });
            toast.success(`Email test berhasil dikirim ke ${testEmail}`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal mengirim email test');
        } finally {
            setIsTesting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center shadow-glow">
                    <Mail className="w-7 h-7 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Pengaturan Email</h1>
                    <p className="text-slate-500">Konfigurasi SMTP untuk notifikasi email</p>
                </div>
            </div>

            {/* Enable/Disable Toggle */}
            <div className="card-elevated">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800">Aktifkan Notifikasi Email</h3>
                        <p className="text-sm text-slate-500">Kirim email notifikasi saat ada keluhan baru</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.emailEnabled}
                            onChange={(e) => setSettings({ ...settings, emailEnabled: e.target.checked })}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                </div>
            </div>

            {/* SMTP Settings */}
            <div className="card-elevated space-y-6">
                <div className="flex items-center gap-3 mb-4">
                    <Server className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-slate-800">Konfigurasi SMTP</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* SMTP Host */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            SMTP Host
                        </label>
                        <input
                            type="text"
                            value={settings.smtpHost || ''}
                            onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                            placeholder="smtp.gmail.com"
                            className="input-field"
                        />
                    </div>

                    {/* SMTP Port */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            SMTP Port
                        </label>
                        <input
                            type="number"
                            value={settings.smtpPort}
                            onChange={(e) => setSettings({ ...settings, smtpPort: Number(e.target.value) })}
                            placeholder="587"
                            className="input-field"
                        />
                    </div>

                    {/* SMTP User */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Username / Email
                        </label>
                        <input
                            type="text"
                            value={settings.smtpUser || ''}
                            onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                            placeholder="user@gmail.com"
                            className="input-field"
                        />
                    </div>

                    {/* SMTP Password */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Password / App Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={settings.smtpPass || ''}
                                onChange={(e) => setSettings({ ...settings, smtpPass: e.target.value })}
                                placeholder="••••••••"
                                className="input-field pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Sender Email */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Email Pengirim (From)
                        </label>
                        <input
                            type="email"
                            value={settings.smtpFrom || ''}
                            onChange={(e) => setSettings({ ...settings, smtpFrom: e.target.value })}
                            placeholder="noreply@company.com"
                            className="input-field"
                        />
                    </div>

                    {/* Admin Email */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Email Admin (Penerima Notifikasi)
                        </label>
                        <input
                            type="email"
                            value={settings.adminEmail || ''}
                            onChange={(e) => setSettings({ ...settings, adminEmail: e.target.value })}
                            placeholder="admin@company.com"
                            className="input-field"
                        />
                    </div>
                </div>

                {/* Secure Connection */}
                <div className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        id="smtpSecure"
                        checked={settings.smtpSecure}
                        onChange={(e) => setSettings({ ...settings, smtpSecure: e.target.checked })}
                        className="w-4 h-4 text-primary-600 bg-white border-slate-300 rounded focus:ring-primary-500"
                    />
                    <label htmlFor="smtpSecure" className="text-sm text-slate-700">
                        Gunakan SSL/TLS (port 465)
                    </label>
                </div>
            </div>

            {/* Test Section */}
            <div className="card-elevated space-y-4">
                <div className="flex items-center gap-3 mb-4">
                    <TestTube className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-slate-800">Test Koneksi</h3>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                    <button
                        onClick={handleTestConnection}
                        disabled={isTesting || !settings.smtpHost}
                        className="btn-secondary flex items-center justify-center gap-2"
                    >
                        {isTesting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <CheckCircle className="w-4 h-4" />
                        )}
                        Test Koneksi SMTP
                    </button>
                </div>

                <div className="border-t border-slate-200 pt-4 mt-4">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                        Kirim Email Test
                    </label>
                    <div className="flex gap-3">
                        <input
                            type="email"
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            placeholder="test@email.com"
                            className="input-field flex-1"
                        />
                        <button
                            onClick={handleSendTestEmail}
                            disabled={isTesting || !testEmail}
                            className="btn-primary flex items-center gap-2"
                        >
                            {isTesting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                            Kirim
                        </button>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="btn-primary flex items-center gap-2 px-6"
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Menyimpan...
                        </>
                    ) : (
                        <>
                            <CheckCircle className="w-4 h-4" />
                            Simpan Pengaturan
                        </>
                    )}
                </button>
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-medium text-blue-800 mb-2">💡 Tips Konfigurasi</h4>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                    <li>Untuk Gmail, gunakan App Password (bukan password akun biasa)</li>
                    <li>Port 587 untuk STARTTLS, Port 465 untuk SSL/TLS</li>
                    <li>Email Admin akan menerima notifikasi setiap ada keluhan baru</li>
                </ul>
            </div>
        </div>
    );
}
