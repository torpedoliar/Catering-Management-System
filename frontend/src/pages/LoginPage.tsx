import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UtensilsCrossed, Lock, User, Loader2, Sparkles } from 'lucide-react';
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
            handleApiError(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated background orbs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-purple/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-teal/10 rounded-full blur-3xl" />

            <div className="w-full max-w-md relative z-10">
                {/* Logo Section */}
                <div className="text-center mb-10 animate-fade-in">
                    <div className="relative inline-block">
                        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center shadow-glow animate-float">
                            <UtensilsCrossed className="w-12 h-12 text-white" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-accent-teal to-accent-cyan rounded-full flex items-center justify-center animate-pulse">
                            <Sparkles className="w-3 h-3 text-white" />
                        </div>
                    </div>
                    <h1 className="text-4xl font-extrabold mt-6 mb-2">
                        <span className="text-gradient">Catering Management</span>
                    </h1>
                    <p className="text-white/60">Zero Waste Corporate Catering System</p>
                </div>

                {/* Login Card */}
                <div className="card card-glow animate-slide-up">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-white">Selamat Datang</h2>
                        <p className="text-white/50 mt-1">Masuk untuk melanjutkan</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-2">
                                ID Karyawan
                            </label>
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-focus-within:text-primary-400 transition-colors" />
                                <input
                                    type="text"
                                    value={externalId}
                                    onChange={(e) => setExternalId(e.target.value)}
                                    placeholder="Masukkan ID karyawan"
                                    className="input-field pl-12"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-2">
                                Password
                            </label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-focus-within:text-primary-400 transition-colors" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Masukkan password"
                                    className="input-field pl-12"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn-primary w-full flex items-center justify-center gap-2 text-lg py-4"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Memproses...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5" />
                                    Masuk
                                </>
                            )}
                        </button>
                    </form>

                    {/* Demo Credentials */}
                    <div className="mt-8 p-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-accent-teal animate-pulse" />
                            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Demo Account</span>
                        </div>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-white/5 transition-colors">
                                <span className="text-white/40">Admin</span>
                                <code className="text-primary-400 font-mono">ADMIN001 / admin123</code>
                            </div>
                            <div className="flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-white/5 transition-colors">
                                <span className="text-white/40">Canteen</span>
                                <code className="text-accent-teal font-mono">CANTEEN001 / admin123</code>
                            </div>
                            <div className="flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-white/5 transition-colors">
                                <span className="text-white/40">User</span>
                                <code className="text-accent-purple font-mono">EMP001 / admin123</code>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-sm text-white/30 mt-8">
                    Powered by <span className="text-gradient font-semibold">Catering Management System</span>
                </p>
            </div>
        </div>
    );
}
