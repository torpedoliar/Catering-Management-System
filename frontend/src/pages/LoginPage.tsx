import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UtensilsCrossed, Lock, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { handleApiError, showSuccess } from '../utils/errorHandler';
import { Button, Input } from '../components/ui';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [externalId, setExternalId] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [branding, setBranding] = useState<{
        logoUrl?: string | null;
        appName?: string;
        loginBackgroundUrl?: string | null;
    }>({});

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!externalId || !password) {
            toast.error('Mohon isi ID karyawan dan password');
            return;
        }
        setIsLoading(true);
        try {
            await login(externalId, password);
            showSuccess('Selamat datang kembali!');
            navigate('/');
        } catch (error: unknown) {
            const err = error as {
                response?: {
                    status?: number;
                    data?: {
                        remainingTime?: number;
                        retryAfter?: number;
                        attemptCount?: number;
                        remainingAttempts?: number;
                    };
                };
            };
            if (err.response?.status === 429) {
                const remainingTime = err.response.data?.remainingTime || err.response.data?.retryAfter;
                toast.error(
                    remainingTime
                        ? `Akun diblokir! Coba lagi dalam ${remainingTime} detik.`
                        : 'Terlalu banyak percobaan login. Silakan tunggu beberapa saat.',
                    { duration: 5000 }
                );
                return;
            }
            if (err.response?.status === 401) {
                const attemptCount = err.response.data?.attemptCount || 0;
                const remainingAttempts = err.response.data?.remainingAttempts;
                let message = 'Kredensial salah';
                if (attemptCount > 0) {
                    message += ` (${attemptCount}x salah)`;
                    if (remainingAttempts !== undefined && remainingAttempts <= 2) {
                        message =
                            remainingAttempts === 0
                                ? `${attemptCount}x salah. Akun Anda akan diblokir pada percobaan berikutnya.`
                                : `${message}. ${remainingAttempts}x lagi sebelum akun dibatasi.`;
                        toast.error(message, { duration: 5000 });
                    } else {
                        toast.error(message);
                    }
                } else {
                    toast.error(message);
                }
                return;
            }
            handleApiError(error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const apiUrl = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || '';
        fetch(`${apiUrl}/api/settings/branding`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data) setBranding(data);
            })
            .catch(() => {});
    }, []);

    return (
        <div className="min-h-screen flex bg-[#f7f7f5] text-[#1c1917]">
            {/* Left panel */}
            <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-[#0f172a]">
                {branding.loginBackgroundUrl && (
                    <img
                        src={branding.loginBackgroundUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-35"
                    />
                )}
                <div className="relative z-10 flex flex-col justify-between p-14 xl:p-20 w-full">
                    <div className="flex items-center gap-3">
                        {branding.logoUrl ? (
                            <img
                                src={branding.logoUrl}
                                alt=""
                                className="w-10 h-10 rounded-[10px] object-contain bg-[#fff] p-1"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-[10px] bg-[#f59e0b] text-[#1c1917] flex items-center justify-center font-extrabold text-[18px]">
                                C
                            </div>
                        )}
                        <div>
                            <div className="text-[#fff] font-bold text-[16px]">
                                {branding.appName || 'Catering'}
                            </div>
                            <div className="text-[12px] text-[#94a3b8]">PT Santos Jaya Abadi</div>
                        </div>
                    </div>

                    <div className="max-w-lg space-y-4">
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(245,158,11,0.16)] text-[#fbbf24] text-[12px] font-bold">
                            Sistem Katering Karyawan
                        </span>
                        <h1 className="m-0 text-[42px] xl:text-[48px] font-extrabold leading-[1.12] tracking-[-0.03em] text-[#fff]">
                            Pesan makan harian lebih rapi dan terukur.
                        </h1>
                        <p className="m-0 text-[15px] text-[#cbd5e1] leading-relaxed">
                            Pilih jadwal makan per shift, pantau riwayat pengambilan, dan check-in cepat di kantin.
                        </p>
                    </div>

                    <div className="text-[12px] text-[#64748b]">
                        © 2026 PT Santos Jaya Abadi · Catering Management System
                    </div>
                </div>
            </div>

            {/* Right form panel */}
            <div className="flex-1 flex items-center justify-center p-6 md:p-10">
                <div className="w-full max-w-[400px] space-y-6">
                    <div className="text-center lg:text-left">
                        <div className="inline-flex lg:hidden items-center justify-center w-12 h-12 rounded-[12px] bg-[#f59e0b] text-[#1c1917] mb-3">
                            {branding.logoUrl ? (
                                <img src={branding.logoUrl} alt="" className="w-8 h-8 object-contain" />
                            ) : (
                                <UtensilsCrossed className="w-6 h-6" aria-hidden="true" />
                            )}
                        </div>
                        <h2 className="m-0 text-[24px] font-extrabold tracking-[-0.02em] text-[#1c1917]">
                            Masuk ke akun Anda
                        </h2>
                        <p className="m-0 mt-1 text-[14px] text-[#78716c]">
                            {branding.appName || 'Catering Management System'}
                        </p>
                    </div>

                    <div className="bg-[#fff] border border-[#e7e5e4] rounded-[14px] p-6">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <Input
                                label="ID Karyawan"
                                type="text"
                                value={externalId}
                                onChange={(e) => setExternalId(e.target.value)}
                                placeholder="Masukkan ID karyawan"
                                autoComplete="username"
                                leftIcon={<User className="w-4 h-4" aria-hidden="true" />}
                            />

                            <Input
                                label="Password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Masukkan password"
                                autoComplete="current-password"
                                leftIcon={<Lock className="w-4 h-4" aria-hidden="true" />}
                            />

                            <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                loading={isLoading}
                                loadingText="Memproses…"
                                className="w-full"
                            >
                                Masuk
                            </Button>
                        </form>
                    </div>

                    <p className="m-0 text-center text-[12px] text-[#78716c]">
                        Butuh bantuan akses? Hubungi Admin Kantin.
                    </p>
                </div>
            </div>
        </div>
    );
}
