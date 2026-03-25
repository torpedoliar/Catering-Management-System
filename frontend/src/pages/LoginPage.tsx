import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UtensilsCrossed, Lock, User, Loader2, ChefHat, Utensils, Coffee } from 'lucide-react';
import toast from 'react-hot-toast';
import { handleApiError, showSuccess } from '../utils/errorHandler';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [externalId, setExternalId] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [branding, setBranding] = useState<{ logoUrl?: string | null, appName?: string }>({});

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!externalId || !password) {
            toast.error('Mohon isi semua data');
            return;
        }

        setIsLoading(true);
        try {
            await login(externalId, password);
            showSuccess('Selamat datang kembali!');
            navigate('/');
        } catch (error: any) {
            // Check for rate limit error (429)
            if (error.response?.status === 429) {
                const remainingTime = error.response?.data?.remainingTime || error.response?.data?.retryAfter;
                if (remainingTime) {
                    toast.error(
                        `Akun diblokir! Coba lagi dalam ${remainingTime} detik.`,
                        { duration: 5000 }
                    );
                } else {
                    toast.error('Terlalu banyak percobaan login. Silakan tunggu beberapa saat.');
                }
                return;
            }

            // Handle invalid credentials with progressive warnings
            if (error.response?.status === 401) {
                const attemptCount = error.response?.data?.attemptCount || 0;
                const remainingAttempts = error.response?.data?.remainingAttempts;

                let message = 'Kredensial salah';

                if (attemptCount > 0) {
                    message += ` (${attemptCount}x salah)`;

                    if (remainingAttempts !== undefined && remainingAttempts <= 2) {
                        if (remainingAttempts === 0) {
                            message = `❌ ${attemptCount}x salah! Akun Anda akan diblokir pada percobaan berikutnya`;
                        } else {
                            message += `\n⚠️ ${remainingAttempts}x lagi sebelum akun dibatasi aksesnya`;
                        }
                        toast.error(message, { duration: 5000 });
                    } else {
                        toast.error(message);
                    }
                } else {
                    toast.error(message);
                }

                return;
            }

            // Fallback to default error handler
            handleApiError(error);
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch branding on mount
    useEffect(() => {
        const apiUrl = (import.meta as any).env?.VITE_API_URL || '';
        fetch(`${apiUrl}/api/settings/branding`)
            .then(r => r.json())
            .then(setBranding)
            .catch(() => { });
    }, []);

    return (
        <div className="min-h-screen flex" style={{ background: 'var(--color-bg-secondary)' }}>
            {/* Left — Hero Panel */}
            <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
                {/* Decorative elements */}
                <div className="absolute inset-0">
                    {/* Gradient orbs */}
                    <div className="absolute top-20 left-20 w-72 h-72 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)' }}></div>
                    <div className="absolute bottom-32 right-16 w-96 h-96 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #fbbf24 0%, transparent 70%)' }}></div>
                    <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #d97706 0%, transparent 70%)' }}></div>

                    {/* Grid pattern */}
                    <div className="absolute inset-0 opacity-[0.03]" style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                        backgroundSize: '64px 64px'
                    }}></div>
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-center px-16 xl:px-24">
                    {/* Floating food icons */}
                    <div className="absolute top-32 right-24 p-4 rounded-2xl bg-white/[0.05] border border-white/[0.08] backdrop-blur-sm" style={{ animation: 'float 6s ease-in-out infinite' }}>
                        <ChefHat className="w-8 h-8 text-amber-400/80" />
                    </div>
                    <div className="absolute bottom-48 right-40 p-3 rounded-xl bg-white/[0.05] border border-white/[0.08] backdrop-blur-sm" style={{ animation: 'float 8s ease-in-out infinite 1s' }}>
                        <Utensils className="w-6 h-6 text-amber-300/70" />
                    </div>
                    <div className="absolute top-1/2 right-12 p-3 rounded-xl bg-white/[0.05] border border-white/[0.08] backdrop-blur-sm" style={{ animation: 'float 7s ease-in-out infinite 2s' }}>
                        <Coffee className="w-6 h-6 text-amber-200/60" />
                    </div>

                    {/* Main text */}
                    <div className="max-w-lg">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-8">
                            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                            <span className="text-amber-300 text-sm font-medium">Corporate Catering</span>
                        </div>

                        <h1 className="text-5xl xl:text-6xl font-extrabold text-white leading-tight tracking-tight" style={{ letterSpacing: '-0.03em' }}>
                            Smart{' '}
                            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                                Catering
                            </span>
                            <br />
                            Management
                        </h1>

                        <p className="text-slate-400 text-lg mt-6 leading-relaxed max-w-md">
                            Kelola pemesanan makanan korporat dengan efisien.
                            Zero waste, real-time tracking, dan laporan lengkap dalam satu platform.
                        </p>

                        {/* Stats */}
                        <div className="flex gap-8 mt-12">
                            <div>
                                <p className="text-3xl font-extrabold text-white tracking-tight">10K+</p>
                                <p className="text-slate-500 text-sm mt-1">Pengguna aktif</p>
                            </div>
                            <div className="w-px bg-white/10"></div>
                            <div>
                                <p className="text-3xl font-extrabold text-white tracking-tight">99.9%</p>
                                <p className="text-slate-500 text-sm mt-1">Uptime server</p>
                            </div>
                            <div className="w-px bg-white/10"></div>
                            <div>
                                <p className="text-3xl font-extrabold text-amber-400 tracking-tight">0%</p>
                                <p className="text-slate-500 text-sm mt-1">Food waste</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom gradient fade */}
                <div className="absolute bottom-0 left-0 right-0 h-32" style={{ background: 'linear-gradient(to top, rgba(15,23,42,0.8), transparent)' }}></div>
            </div>

            {/* Right — Login Form */}
            <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
                <div className="w-full max-w-[400px]">
                    {/* Logo */}
                    <div className="text-center mb-10">
                        {branding.logoUrl ? (
                            <img src={branding.logoUrl} alt="" className="w-14 h-14 mx-auto mb-5 rounded-2xl object-contain" />
                        ) : (
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 mb-5 shadow-xl shadow-amber-500/20" style={{ animation: 'fadeIn 0.5s ease-out' }}>
                                <UtensilsCrossed className="w-8 h-8 text-white" />
                            </div>
                        )}
                        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
                            {branding.appName || 'Catering Management'}
                        </h1>
                        <p className="mt-1.5 text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                            Corporate Catering System
                        </p>
                    </div>

                    {/* Form Card */}
                    <div className="bg-white rounded-2xl border p-8" style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-lg)' }}>
                        <div className="text-center mb-7">
                            <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Selamat Datang</h2>
                            <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>Masuk untuk melanjutkan</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                                    ID Karyawan
                                </label>
                                <div className="relative">
                                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px]" style={{ color: 'var(--color-text-tertiary)' }} />
                                    <input
                                        type="text"
                                        value={externalId}
                                        onChange={(e) => setExternalId(e.target.value)}
                                        placeholder="Masukkan ID karyawan"
                                        className="input-field pl-11"
                                        style={{ padding: '0.75rem 0.875rem 0.75rem 2.75rem' }}
                                        autoComplete="username"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                                    Password
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px]" style={{ color: 'var(--color-text-tertiary)' }} />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Masukkan password"
                                        className="input-field pl-11"
                                        style={{ padding: '0.75rem 0.875rem 0.75rem 2.75rem' }}
                                        autoComplete="current-password"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
                                style={{ padding: '0.8rem 1.25rem', fontSize: '0.9375rem' }}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-4.5 h-4.5 animate-spin" />
                                        Memproses...
                                    </>
                                ) : (
                                    'Masuk'
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Footer */}
                    <p className="text-center text-xs mt-8 font-medium" style={{ color: 'var(--color-text-muted)' }}>
                        Powered by Catering Management System
                    </p>
                </div>
            </div>

            {/* CSS animation for floating elements */}
            <style>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-12px); }
                }
            `}</style>
        </div>
    );
}
