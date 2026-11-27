import { useState, useEffect } from 'react';
import { Server, Send, CheckCircle, Eye, EyeOff, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import {
    PageHeader,
    Button,
    Card,
    Field,
    Input,
    Skeleton,
} from '../../components/ui';

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
        api.get('/api/email/settings')
            .then((res) => {
                setSettings(res.data);
                setTestEmail(res.data.adminEmail || '');
            })
            .catch(() => toast.error('Gagal memuat pengaturan email'))
            .finally(() => setIsLoading(false));
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await api.put('/api/email/settings', settings);
            toast.success('Pengaturan email disimpan');
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menyimpan pengaturan');
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        try {
            await api.post('/api/email/test-connection');
            toast.success('Koneksi SMTP berhasil');
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal terhubung ke SMTP');
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
            toast.success(`Email uji dikirim ke ${testEmail}`);
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal mengirim email uji');
        } finally {
            setIsTesting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-4 max-w-4xl">
                <Skeleton className="h-9 w-56" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-4 max-w-4xl">
            <PageHeader
                title="Pengaturan email"
                subtitle="Konfigurasi SMTP untuk notifikasi keluhan dan pesan ke admin"
                actions={
                    <Button
                        variant="primary"
                        size="sm"
                        loading={isSaving}
                        onClick={handleSave}
                        leftIcon={<CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                        Simpan pengaturan
                    </Button>
                }
            />

            <Card>
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-[15px] font-bold text-[#1c1917]">Aktifkan notifikasi email</h2>
                        <p className="text-[12.5px] text-[#78716c]">
                            Kirim notifikasi email otomatis ketika ada keluhan atau sanggahan baru
                        </p>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={settings.emailEnabled}
                        onClick={() => setSettings((s) => ({ ...s, emailEnabled: !s.emailEnabled }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full border-0 cursor-pointer transition-colors ${
                            settings.emailEnabled ? 'bg-[#16a34a]' : 'bg-[#d6d3d1]'
                        }`}
                    >
                        <span
                            className={`inline-block h-4 w-4 rounded-full bg-[#fff] transition-transform ${
                                settings.emailEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
            </Card>

            <Card>
                <div className="flex items-center gap-2 mb-4">
                    <Server className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
                    <h2 className="text-[15px] font-bold text-[#1c1917]">Konfigurasi SMTP</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="SMTP Host">
                        <Input
                            value={settings.smtpHost || ''}
                            onChange={(e) => setSettings((s) => ({ ...s, smtpHost: e.target.value }))}
                            placeholder="smtp.gmail.com"
                        />
                    </Field>
                    <Field label="SMTP Port">
                        <Input
                            type="number"
                            value={settings.smtpPort}
                            onChange={(e) =>
                                setSettings((s) => ({ ...s, smtpPort: Number(e.target.value) || 587 }))
                            }
                        />
                    </Field>
                    <Field label="Username / Email">
                        <Input
                            value={settings.smtpUser || ''}
                            onChange={(e) => setSettings((s) => ({ ...s, smtpUser: e.target.value }))}
                            placeholder="user@company.com"
                        />
                    </Field>
                    <Field label="Password / App Password">
                        <div className="relative">
                            <Input
                                type={showPassword ? 'text' : 'password'}
                                value={settings.smtpPass || ''}
                                onChange={(e) => setSettings((s) => ({ ...s, smtpPass: e.target.value }))}
                                placeholder="••••••••"
                                className="pr-10"
                            />
                            <button
                                type="button"
                                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#78716c] bg-transparent border-0 cursor-pointer p-1"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </Field>
                    <Field label="Email pengirim (From)">
                        <Input
                            type="email"
                            value={settings.smtpFrom || ''}
                            onChange={(e) => setSettings((s) => ({ ...s, smtpFrom: e.target.value }))}
                            placeholder="noreply@company.com"
                        />
                    </Field>
                    <Field label="Email admin penerima">
                        <Input
                            type="email"
                            value={settings.adminEmail || ''}
                            onChange={(e) => setSettings((s) => ({ ...s, adminEmail: e.target.value }))}
                            placeholder="admin@company.com"
                        />
                    </Field>
                </div>

                <label className="flex items-center gap-2 mt-4 text-[13px] font-medium text-[#1c1917] cursor-pointer">
                    <input
                        type="checkbox"
                        checked={settings.smtpSecure}
                        onChange={(e) => setSettings((s) => ({ ...s, smtpSecure: e.target.checked }))}
                    />
                    Gunakan SSL/TLS langsung (biasanya port 465)
                </label>
            </Card>

            <Card>
                <h2 className="text-[15px] font-bold text-[#1c1917] mb-3">Uji koneksi & kirim tes</h2>
                <div className="space-y-4">
                    <div>
                        <Button
                            variant="secondary"
                            size="sm"
                            loading={isTesting}
                            disabled={!settings.smtpHost}
                            onClick={handleTestConnection}
                        >
                            Uji koneksi SMTP
                        </Button>
                    </div>
                    <div className="flex flex-wrap items-end gap-2.5 pt-3 border-t border-[#f5f5f4]">
                        <Field label="Alamat email tujuan tes" className="flex-1 min-w-[220px]">
                            <Input
                                type="email"
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                                placeholder="test@company.com"
                            />
                        </Field>
                        <Button
                            variant="primary"
                            loading={isTesting}
                            disabled={!testEmail}
                            onClick={handleSendTestEmail}
                            leftIcon={<Send className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Kirim tes
                        </Button>
                    </div>
                </div>
            </Card>

            <Card padding="sm">
                <div className="flex items-start gap-3">
                    <Info className="w-4 h-4 text-[#2563eb] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="text-[12.5px] text-[#57534e]">
                        Untuk Gmail, gunakan App Password. Port 587 memakai STARTTLS (SSL/TLS tidak dicentang); port 465 memakai SSL/TLS dicentang.
                    </div>
                </div>
            </Card>
        </div>
    );
}
