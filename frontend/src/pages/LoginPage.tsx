import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UtensilsCrossed, Lock, User, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { handleApiError, showSuccess } from '../utils/errorHandler';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [externalId, setExternalId] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

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

                    // Show warning when approaching limit (3 or more attempts)
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

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#faf9f7]">
            <div className="w-full max-w-sm">
                {/* Logo Section */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 mb-4 shadow-lg shadow-orange-500/20">
                        <UtensilsCrossed className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-[#1a1f37]">
                        Catering Management
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Corporate Catering System</p>
                </div>

                {/* Login Card */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <div className="text-center mb-6">
                        <h2 className="text-lg font-semibold text-slate-900">Selamat Datang</h2>
                        <p className="text-slate-500 text-sm mt-0.5">Masuk untuk melanjutkan</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                ID Karyawan
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                                <input
                                    type="text"
                                    value={externalId}
                                    onChange={(e) => setExternalId(e.target.value)}
                                    placeholder="Masukkan ID karyawan"
                                    className="input-field pl-10"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Masukkan password"
                                    className="input-field pl-10"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 mt-2"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Memproses...
                                </>
                            ) : (
                                'Masuk'
                            )}
                        </button>
                    </form>


                </div>

                {/* Footer */}
                <p className="text-center text-xs text-slate-400 mt-6">
                    Powered by Catering Management System
                </p>
            </div>
        </div>
    );
}
