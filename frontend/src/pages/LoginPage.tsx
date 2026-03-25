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
    const [branding, setBranding] = useState<{ logoUrl?: string | null, appName?: string, loginBackgroundUrl?: string | null }>({});

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
            <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden" style={{ background: '#0f172a' }}>
                {/* Background Image / Pattern */}
                {branding.loginBackgroundUrl ? (
                    <img 
                        src={branding.loginBackgroundUrl} 
                        alt="Login Background" 
                        className="absolute inset-0 w-full h-full object-cover" 
                        style={{ filter: 'brightness(0.75)' }}
                    />
                ) : (
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
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
                )}

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-center px-16 xl:px-24 w-full h-full pb-20">
                    <div className="max-w-xl">
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8 shadow-xl" style={{ background: 'rgba(0, 0, 0, 0.5)', border: '1px solid rgba(245, 158, 11, 0.4)', backdropFilter: 'blur(8px)' }}>
                            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" style={{ boxShadow: '0 0 10px rgba(251, 191, 36, 0.8)' }}></div>
                            <span style={{ color: '#fcd34d', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }} className="text-sm font-semibold tracking-wide">Corporate Catering</span>
                        </div>

                        {/* Title */}
                        <h1 className="text-5xl xl:text-6xl font-extrabold leading-tight tracking-tight" style={{ color: '#ffffff', letterSpacing: '-0.03em', textShadow: '0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)' }}>
                            {branding.appName ? (
                                <>
                                    {branding.appName.split(' ')[0]}{' '}
                                    <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }}>
                                        {branding.appName.split(' ').slice(1).join(' ')}
                                    </span>
                                </>
                            ) : (
                                <>
                                    Smart{' '}
                                    <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }}>
                                        Catering
                                    </span>
                                    <br />
                                    Management
                                </>
                            )}
                        </h1>

                        {/* Floating Icons alternative (neatly arranged) */}
                        <div className="flex gap-4 mt-12 w-fit">
                            <div className="p-4 rounded-xl shadow-2xl transition hover:scale-105 duration-300" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <ChefHat className="w-7 h-7 text-amber-400 drop-shadow-md" />
                            </div>
                            <div className="p-4 rounded-xl shadow-2xl transition hover:scale-105 duration-300" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Utensils className="w-7 h-7 text-amber-400 drop-shadow-md" />
                            </div>
                            <div className="p-4 rounded-xl shadow-2xl transition hover:scale-105 duration-300" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Coffee className="w-7 h-7 text-amber-400 drop-shadow-md" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom dark gradient fade so it blends well */}
                <div className="absolute bottom-0 left-0 right-0 h-48" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}></div>
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
