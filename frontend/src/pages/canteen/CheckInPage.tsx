import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../contexts/AuthContext';
import { useSSE, useSSERefresh, ORDER_EVENTS } from '../../contexts/SSEContext';
import { ScanLine, Search, CheckCircle2, AlertCircle, Loader2, Wifi, X, User as UserIcon, Building2, Briefcase, Clock, Sparkles, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

interface CheckInResult {
    success: boolean;
    message: string;
    order?: {
        id: string;
        status: string;
        checkInTime?: Date | string;
        user: { name: string; externalId: string; company: string; department: string };
        shift: { name: string };
    };
    checkInBy?: string;
    checkInTime?: Date | string;
}

interface SuccessPopupProps {
    show: boolean;
    data: CheckInResult | null;
    onClose: () => void;
}

function SuccessPopup({ show, data, onClose }: SuccessPopupProps) {
    const [countdown, setCountdown] = useState(5);

    useEffect(() => {
        if (show && countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else if (countdown === 0) {
            onClose();
        }
    }, [show, countdown, onClose]);

    useEffect(() => {
        if (show) setCountdown(5);
    }, [show]);

    if (!show || !data || !data.order) return null;

    const checkInTime = data.checkInTime || data.order.checkInTime;
    const formattedTime = checkInTime
        ? new Date(checkInTime).toLocaleString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
        : 'Baru saja';

    const isSuccess = data.success;

    return (
        <div className="modal-backdrop flex items-center justify-center p-4 animate-fade-in">
            <div className={`modal-content p-8 max-w-lg w-full relative overflow-hidden ${
                isSuccess ? 'border-success/30' : 'border-warning/30'
            }`}>
                {/* Background glow */}
                <div className={`absolute inset-0 opacity-30 ${
                    isSuccess 
                        ? 'bg-gradient-to-br from-success/30 to-transparent' 
                        : 'bg-gradient-to-br from-warning/30 to-transparent'
                }`} />

                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                                isSuccess 
                                    ? 'bg-gradient-to-br from-success to-accent-teal shadow-glow-success' 
                                    : 'bg-gradient-to-br from-warning to-orange-500'
                            }`}>
                                {isSuccess ? (
                                    <CheckCircle2 className="w-8 h-8 text-white" />
                                ) : (
                                    <AlertCircle className="w-8 h-8 text-white" />
                                )}
                            </div>
                            <div>
                                <h2 className={`text-2xl font-bold ${isSuccess ? 'text-white' : 'text-warning'}`}>
                                    {data.message}
                                </h2>
                                <p className="text-white/50">
                                    {isSuccess ? 'Makanan siap diambil' : 'Sudah pernah check-in'}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="btn-icon">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="space-y-4 mb-6">
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 text-white/40 text-sm mb-2">
                                <UserIcon className="w-4 h-4" />
                                <span>Informasi Pengguna</span>
                            </div>
                            <p className="text-xl font-bold text-white">{data.order.user.name}</p>
                            <p className="text-primary-400 font-mono">ID: {data.order.user.externalId}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
                                    <Building2 className="w-3.5 h-3.5" />
                                    <span>Perusahaan</span>
                                </div>
                                <p className="font-semibold text-white">{data.order.user.company || '-'}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
                                    <Briefcase className="w-3.5 h-3.5" />
                                    <span>Departemen</span>
                                </div>
                                <p className="font-semibold text-white">{data.order.user.department || '-'}</p>
                            </div>
                        </div>

                        <div className={`p-4 rounded-2xl border ${
                            isSuccess 
                                ? 'bg-success/10 border-success/20' 
                                : 'bg-warning/10 border-warning/20'
                        }`}>
                            <div className={`flex items-center gap-2 text-sm mb-2 ${
                                isSuccess ? 'text-success' : 'text-warning'
                            }`}>
                                <Clock className="w-4 h-4" />
                                <span>Waktu Check-In</span>
                            </div>
                            <p className="font-semibold text-white mb-2">{formattedTime}</p>
                            <div className="flex items-center justify-between text-xs text-white/40">
                                <span>Shift: <span className="text-primary-400">{data.order.shift.name}</span></span>
                                <span>Admin: <span className="text-accent-purple">{data.checkInBy || 'Admin'}</span></span>
                            </div>
                        </div>
                    </div>

                    <div className="text-center">
                        <p className="text-sm text-white/40 mb-2">
                            Menutup dalam <span className="text-white font-bold">{countdown}</span> detik
                        </p>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ${
                                    isSuccess 
                                        ? 'bg-gradient-to-r from-success to-accent-teal' 
                                        : 'bg-gradient-to-r from-warning to-orange-500'
                                }`}
                                style={{ width: `${(countdown / 5) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CheckInPage() {
    const { isConnected, connectedClients } = useSSE();
    const [searchInput, setSearchInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);
    const [successData, setSuccessData] = useState<CheckInResult | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const [todayStats, setTodayStats] = useState({ total: 0, checkedIn: 0, pending: 0 });
    const [lastCheckInTime, setLastCheckInTime] = useState<number>(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const loadStats = useCallback(async () => {
        try {
            const res = await api.get('/api/orders/stats/today');
            setTodayStats({
                total: res.data.total,
                checkedIn: res.data.pickedUp,
                pending: res.data.pending,
            });
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }, []);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    useSSERefresh(ORDER_EVENTS, loadStats);

    const handleCheckIn = async (method: 'manual' | 'qr') => {
        if (!searchInput.trim()) {
            toast.error('Masukkan ID Karyawan, Nama, atau QR Code');
            return;
        }

        setIsProcessing(true);
        setLastError(null);

        try {
            let res;
            if (method === 'qr') {
                res = await api.post('/api/orders/checkin/qr', { qrCode: searchInput.trim() });
            } else {
                const isId = /^[A-Z0-9]+$/i.test(searchInput.trim());
                const payload = isId
                    ? { externalId: searchInput.trim() }
                    : { name: searchInput.trim() };
                res = await api.post('/api/orders/checkin/manual', payload);
            }

            const result: CheckInResult = {
                success: true,
                message: 'Check-in Berhasil!',
                order: res.data.order,
                checkInBy: res.data.checkInBy,
                checkInTime: res.data.checkInTime
            };

            const now = Date.now();
            const isRapidCheckIn = now - lastCheckInTime < 5000;

            if (isRapidCheckIn) {
                toast.success(`${result.order?.user.name} - ${result.order?.shift.name}`, {
                    duration: 2000,
                    icon: '✅'
                });
            } else {
                setSuccessData(result);
                setShowSuccessPopup(true);
            }

            setLastCheckInTime(now);
            setSearchInput('');
            loadStats();

            setTimeout(() => inputRef.current?.focus(), 100);
        } catch (error: any) {
            const message = error.response?.data?.error || 'Check-in gagal';

            if (message.includes('sudah di-check in sebelumnya') && error.response?.data?.order) {
                const alreadyCheckedOrder = error.response.data.order;

                const warningResult: CheckInResult = {
                    success: false,
                    message: 'Sudah Ambil Makan',
                    order: alreadyCheckedOrder,
                    checkInTime: alreadyCheckedOrder.checkInTime,
                    checkInBy: 'Unknown'
                };

                setSuccessData(warningResult);
                setShowSuccessPopup(true);
                setSearchInput('');

                toast.error('User sudah check-in sebelumnya', { icon: '⚠️', duration: 3000 });
            } else {
                setLastError(message);
                toast.error(message);
            }

            setTimeout(() => inputRef.current?.focus(), 100);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCheckIn('manual');
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
            {/* Connection Status */}
            <div className={`flex items-center justify-between p-4 rounded-2xl border ${
                isConnected 
                    ? 'bg-success/10 border-success/30' 
                    : 'bg-danger/10 border-danger/30'
            }`}>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Wifi className={`w-5 h-5 ${isConnected ? 'text-success' : 'text-danger'}`} />
                        {isConnected && <span className="absolute inset-0 bg-success rounded-full animate-ping opacity-50" />}
                    </div>
                    <span className={`font-medium ${isConnected ? 'text-success' : 'text-danger'}`}>
                        {isConnected ? 'Sinkronisasi real-time aktif' : 'Menyambung kembali...'}
                    </span>
                </div>
                <span className="text-sm text-white/40">{connectedClients} terhubung</span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="stat-card text-center">
                    <p className="text-xs text-white/40 uppercase tracking-wider">Total</p>
                    <p className="text-3xl font-bold text-gradient mt-1">{todayStats.total}</p>
                </div>
                <div className="stat-card text-center">
                    <p className="text-xs text-white/40 uppercase tracking-wider">Diambil</p>
                    <p className="text-3xl font-bold text-success mt-1">{todayStats.checkedIn}</p>
                </div>
                <div className="stat-card text-center">
                    <p className="text-xs text-white/40 uppercase tracking-wider">Pending</p>
                    <p className="text-3xl font-bold text-warning mt-1">{todayStats.pending}</p>
                </div>
            </div>

            {/* Check-in Card */}
            <div className="card relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-500/20 to-transparent rounded-full blur-3xl" />
                
                <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center shadow-glow">
                            <Zap className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">Check-In</h2>
                            <p className="text-white/50">Scan QR atau masukkan ID karyawan</p>
                        </div>
                    </div>

                    <div className="relative mb-6">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="ID Karyawan / Nama / QR Code..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            autoFocus
                            className="input-search text-lg h-16"
                            disabled={isProcessing}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => handleCheckIn('manual')}
                            disabled={isProcessing || !searchInput.trim()}
                            className="btn-success h-14 flex items-center justify-center gap-3 text-base font-semibold"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Memproses...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-5 h-5" />
                                    Ambil Makan
                                </>
                            )}
                        </button>

                        <button
                            onClick={() => handleCheckIn('qr')}
                            disabled={isProcessing || !searchInput.trim()}
                            className="btn-primary h-14 flex items-center justify-center gap-3 text-base font-semibold"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Memproses...
                                </>
                            ) : (
                                <>
                                    <ScanLine className="w-5 h-5" />
                                    Scan QR
                                </>
                            )}
                        </button>
                    </div>

                    {lastError && (
                        <div className="mt-6 p-4 rounded-2xl bg-danger/10 border border-danger/30">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-6 h-6 text-danger flex-shrink-0" />
                                <div>
                                    <p className="font-medium text-danger">{lastError}</p>
                                    <p className="text-sm text-white/40 mt-1">Silakan coba lagi</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-6 p-4 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-sm text-white/60">
                            <strong className="text-white">Petunjuk:</strong><br />
                            • Ketik ID atau nama untuk <span className="text-success">check-in manual</span><br />
                            • Scan atau ketik kode untuk <span className="text-primary-400">QR check-in</span><br />
                            • Tekan <kbd className="px-2 py-0.5 bg-white/10 rounded text-xs">Enter</kbd> untuk check-in cepat
                        </p>
                    </div>
                </div>
            </div>

            <SuccessPopup
                show={showSuccessPopup}
                data={successData}
                onClose={() => {
                    setShowSuccessPopup(false);
                    setSuccessData(null);
                }}
            />
        </div>
    );
}
