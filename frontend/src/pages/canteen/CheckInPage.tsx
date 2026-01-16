import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { api } from '../../contexts/AuthContext';
import { useSSE, useSSERefresh, ORDER_EVENTS } from '../../contexts/SSEContext';
import { ScanLine, Search, CheckCircle2, AlertCircle, Loader2, Wifi, X, User as UserIcon, Building2, Briefcase, Clock, Zap, Calendar, Camera, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import Webcam from 'react-webcam';
import { Html5Qrcode } from 'html5-qrcode';

interface CheckInResult {
    success: boolean;
    message: string;
    order?: {
        id: string;
        status: string;
        checkInTime?: Date | string;
        user: {
            name: string;
            externalId: string;
            company: string;
            department: string;
            photo?: string;
        };
        shift: { name: string };
        canteen?: { id: string; name: string; location: string | null };
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
    let formattedTime = 'Baru saja';
    if (checkInTime) {
        // Parse the ISO string directly - toLocaleString with timeZone will handle conversion
        const date = new Date(checkInTime);
        formattedTime = date.toLocaleString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Asia/Jakarta'
        });
    }

    const isSuccess = data.success;

    return (
        <div className="modal-backdrop flex items-center justify-center p-4 animate-fade-in">
            <div className={`modal-content p-8 max-w-lg w-full relative overflow-hidden ${isSuccess ? 'border-success/30' : 'border-warning/30'}`}>
                <div className={`absolute inset-0 opacity-30 ${isSuccess ? 'bg-gradient-to-br from-success/30 to-transparent' : 'bg-gradient-to-br from-warning/30 to-transparent'}`} />
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden ${isSuccess ? 'bg-gradient-to-br from-success to-accent-teal shadow-glow-success' : 'bg-gradient-to-br from-warning to-orange-500'}`}>
                                {data.order.user.photo ? (
                                    <img
                                        src={`${(import.meta as any).env?.VITE_API_URL || 'http://localhost:3012'}${data.order.user.photo}`}
                                        alt={data.order.user.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    isSuccess ? <CheckCircle2 className="w-8 h-8 text-white" /> : <AlertCircle className="w-8 h-8 text-white" />
                                )}
                            </div>
                            <div>
                                <h2 className={`text-2xl font-bold ${isSuccess ? 'text-white' : 'text-warning'}`}>{data.message}</h2>
                                <p className="text-white/50">{isSuccess ? 'Makanan siap diambil' : 'Sudah pernah check-in'}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="btn-icon"><X className="w-6 h-6" /></button>
                    </div>
                    <div className="space-y-4 mb-6">
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 text-white/40 text-sm mb-2">
                                <UserIcon className="w-4 h-4" /><span>Informasi Pengguna</span>
                            </div>
                            <p className="text-xl font-bold text-white">{data.order.user.name}</p>
                            <p className="text-primary-400 font-mono">ID: {data.order.user.externalId}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
                                    <Building2 className="w-3.5 h-3.5" /><span>Perusahaan</span>
                                </div>
                                <p className="font-semibold text-white">{data.order.user.company || '-'}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
                                    <Briefcase className="w-3.5 h-3.5" /><span>Departemen</span>
                                </div>
                                <p className="font-semibold text-white">{data.order.user.department || '-'}</p>
                            </div>
                        </div>
                        {data.order.canteen && (
                            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
                                <div className="flex items-center gap-2 text-primary text-xs mb-1">
                                    <MapPin className="w-3.5 h-3.5" /><span>Lokasi Kantin</span>
                                </div>
                                <p className="font-semibold text-white">{data.order.canteen.name}</p>
                                {data.order.canteen.location && (
                                    <p className="text-sm text-white/50">{data.order.canteen.location}</p>
                                )}
                            </div>
                        )}
                        <div className={`p-4 rounded-2xl border ${isSuccess ? 'bg-success/10 border-success/20' : 'bg-warning/10 border-warning/20'}`}>
                            <div className={`flex items-center gap-2 text-sm mb-2 ${isSuccess ? 'text-success' : 'text-warning'}`}>
                                <Clock className="w-4 h-4" /><span>Waktu Check-In</span>
                            </div>
                            <p className="font-semibold text-white mb-2">{formattedTime}</p>
                            <div className="flex items-center justify-between text-xs text-white/40">
                                <span>Shift: <span className="text-primary-400">{data.order.shift.name}</span></span>
                                <span>Admin: <span className="text-accent-purple">{data.checkInBy || 'Admin'}</span></span>
                            </div>
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-white/40 mb-2">Menutup dalam <span className="text-white font-bold">{countdown}</span> detik</p>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-1000 ${isSuccess ? 'bg-gradient-to-r from-success to-accent-teal' : 'bg-gradient-to-r from-warning to-orange-500'}`} style={{ width: `${(countdown / 5) * 100}%` }} />
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
    const [todayStats, setTodayStats] = useState({ total: 0, checkedIn: 0, pending: 0, noShow: 0 });
    const [lastCheckInTime, setLastCheckInTime] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState(new Date());
    const inputRef = useRef<HTMLInputElement>(null);
    const webcamRef = useRef<Webcam>(null);
    const [photoEnabled, setPhotoEnabled] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
    const [pendingOrder, setPendingOrder] = useState<any>(null);
    // Canteen check-in enforcement
    const [enforceCanteenCheckin, setEnforceCanteenCheckin] = useState(false);
    const [selectedCanteenId, setSelectedCanteenId] = useState<string>('');
    const [canteens, setCanteens] = useState<{ id: string; name: string; location: string | null }[]>([]);
    // QR Scanner state
    const [showQRScanner, setShowQRScanner] = useState(false);
    const qrScannerRef = useRef<Html5Qrcode | null>(null);
    const qrContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const loadStats = useCallback(async () => {
        try {
            const res = await api.get('/api/orders/stats/today');
            setTodayStats({ total: res.data.total, checkedIn: res.data.pickedUp, pending: res.data.pending, noShow: res.data.noShow || 0 });
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }, []);

    useEffect(() => { loadStats(); }, [loadStats]);
    useSSERefresh(ORDER_EVENTS, loadStats);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const [settingsRes, canteensRes] = await Promise.all([
                    api.get('/api/settings'),
                    api.get('/api/canteens')
                ]);
                setPhotoEnabled(settingsRes.data.checkinPhotoEnabled || false);
                setEnforceCanteenCheckin(settingsRes.data.enforceCanteenCheckin || false);
                setCanteens(canteensRes.data.canteens || []);
            } catch (error) {
                console.error('Failed to load settings:', error);
            }
        };
        fetchSettings();
    }, []);

    const togglePhotoSetting = async () => {
        try {
            await api.put('/api/settings', { checkinPhotoEnabled: !photoEnabled });
            setPhotoEnabled(!photoEnabled);
            toast.success(`Foto check-in ${!photoEnabled ? 'diaktifkan' : 'dinonaktifkan'}`);
        } catch (error) {
            toast.error('Gagal mengubah pengaturan');
        }
    };

    const capturePhoto = useCallback(() => {
        const imageSrc = webcamRef.current?.getScreenshot();
        if (imageSrc) {
            setCapturedPhoto(imageSrc);
            setShowCamera(false);
            // Auto proceed with check-in
            if (pendingOrder) {
                handleCheckIn(pendingOrder.method, imageSrc);
            }
        }
    }, [pendingOrder]);

    // QR Scanner functions
    const openQRScanner = useCallback(async () => {
        if (enforceCanteenCheckin && !selectedCanteenId) {
            toast.error('Pilih kantin terlebih dahulu');
            return;
        }

        setShowQRScanner(true);

        // Wait for DOM to render
        await new Promise(resolve => setTimeout(resolve, 100));

        if (qrContainerRef.current && !qrScannerRef.current) {
            try {
                const qrScanner = new Html5Qrcode('qr-reader');
                qrScannerRef.current = qrScanner;

                await qrScanner.start(
                    { facingMode: 'environment' },
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                    },
                    (decodedText) => {
                        // QR Code found - process check-in
                        closeQRScanner();
                        handleCheckIn('qr', decodedText);
                    },
                    () => {
                        // QR Code not found - keep scanning
                    }
                );
            } catch (err) {
                console.error('Failed to start QR scanner:', err);
                toast.error('Gagal membuka kamera. Pastikan izin kamera diberikan.');
                setShowQRScanner(false);
            }
        }
    }, [enforceCanteenCheckin, selectedCanteenId]);

    const closeQRScanner = useCallback(async () => {
        if (qrScannerRef.current) {
            try {
                await qrScannerRef.current.stop();
                qrScannerRef.current.clear();
            } catch (err) {
                console.error('Failed to stop QR scanner:', err);
            }
            qrScannerRef.current = null;
        }
        setShowQRScanner(false);
    }, []);

    const handleCheckIn = async (method: 'manual' | 'qr', qrCodeData?: string) => {
        const codeToUse = qrCodeData || searchInput.trim();

        if (!codeToUse) {
            if (method === 'qr') {
                // Open QR scanner instead of showing error
                openQRScanner();
                return;
            } else {
                toast.error('Masukkan ID Karyawan, Nama, atau QR Code');
            }
            return;
        }

        // Validate canteen selection if enforcement is enabled
        if (enforceCanteenCheckin && !selectedCanteenId) {
            toast.error('Pilih kantin terlebih dahulu');
            return;
        }

        setIsProcessing(true);
        setLastError(null);

        try {
            let res;
            const formData = new FormData();

            if (method === 'qr') {
                formData.append('qrCode', codeToUse);
                if (selectedCanteenId) {
                    formData.append('operatorCanteenId', selectedCanteenId);
                }
                if (capturedPhoto) {
                    const blob = await (await fetch(capturedPhoto)).blob();
                    formData.append('photo', blob, 'checkin.webp');
                }
                res = await api.post('/api/orders/checkin/qr', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } else {
                // Send all possible identifiers - backend will check in order: externalId, nik, name
                const searchValue = searchInput.trim();
                const isNumeric = /^\d+$/.test(searchValue);
                const isId = /^[A-Z0-9]+$/i.test(searchValue);

                const payload = isId
                    ? { externalId: searchValue, nik: isNumeric ? searchValue : undefined, operatorCanteenId: selectedCanteenId || undefined }
                    : { name: searchValue, operatorCanteenId: selectedCanteenId || undefined };
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
                toast.success(`${result.order?.user.name} - ${result.order?.shift.name}`, { duration: 2000, icon: '✅' });
            } else {
                setSuccessData(result);
                setShowSuccessPopup(true);
            }

            setLastCheckInTime(now);
            setSearchInput('');
            setCapturedPhoto(null);
            setPendingOrder(null);
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
                // Clear input on error too for quick retry
                setSearchInput('');
            }
            setTimeout(() => inputRef.current?.focus(), 100);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleCheckIn('manual');
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
            <div className="glass-card p-6 rounded-2xl text-center">
                <div className="flex items-center justify-center gap-3 mb-2">
                    <Clock className="w-8 h-8 text-primary-400" />
                    <span className="text-5xl font-bold text-white font-mono tracking-wider">{format(currentTime, 'HH:mm:ss')}</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-white/60">
                    <Calendar className="w-5 h-5" />
                    <span className="text-lg">{format(currentTime, 'EEEE, dd MMMM yyyy', { locale: idLocale })}</span>
                </div>
            </div>

            <div className={`flex items-center justify-between p-4 rounded-2xl border ${isConnected ? 'bg-success/10 border-success/30' : 'bg-danger/10 border-danger/30'}`}>
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

            {/* Canteen Selection - Only show when enforcement is enabled */}
            {enforceCanteenCheckin && (
                <div className="card border-primary-500/30 bg-gradient-to-r from-primary-500/10 to-transparent">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
                            <MapPin className="w-6 h-6 text-primary-400" />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-white/70 mb-1">
                                Pos Check-in Saat Ini
                            </label>
                            <select
                                value={selectedCanteenId}
                                onChange={(e) => setSelectedCanteenId(e.target.value)}
                                className="input-field w-full bg-dark-800"
                            >
                                <option value="">-- Pilih Kantin --</option>
                                {canteens.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}{c.location ? ` (${c.location})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {!selectedCanteenId && (
                        <p className="text-xs text-warning mt-2">
                            ⚠️ Pilih kantin untuk memvalidasi lokasi check-in
                        </p>
                    )}
                </div>
            )}

            <div className="grid grid-cols-4 gap-4">
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
                <div className="stat-card text-center">
                    <p className="text-xs text-white/40 uppercase tracking-wider">Tidak Diambil</p>
                    <p className="text-3xl font-bold text-danger mt-1">{todayStats.noShow}</p>
                </div>
            </div>

            <div className="card relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-500/20 to-transparent rounded-full blur-3xl" />
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center shadow-glow">
                                <Zap className="w-7 h-7 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">Check-In</h2>
                                <p className="text-white/50">Scan QR atau masukkan ID karyawan</p>
                            </div>
                        </div>
                        <button onClick={togglePhotoSetting} className={`px-4 py-2 rounded-xl border flex items-center gap-2 transition-all ${photoEnabled ? 'bg-success/20 border-success/40 text-success' : 'bg-white/5 border-white/20 text-white/60'}`}>
                            <Camera className="w-5 h-5" />
                            <span className="text-sm font-medium">{photoEnabled ? 'Foto ON' : 'Foto OFF'}</span>
                        </button>
                    </div>

                    <div className="relative mb-6">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        <input ref={inputRef} type="text" placeholder="ID Karyawan / Nama / QR Code..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyPress={handleKeyPress} autoFocus className="input-search text-lg h-16" disabled={isProcessing} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => handleCheckIn('manual')} disabled={isProcessing || !searchInput.trim()} className="btn-success h-14 flex items-center justify-center gap-3 text-base font-semibold">
                            {isProcessing ? (<><Loader2 className="w-5 h-5 animate-spin" />Memproses...</>) : (<><CheckCircle2 className="w-5 h-5" />Ambil Makan</>)}
                        </button>
                        <button onClick={() => handleCheckIn('qr')} disabled={isProcessing} className="btn-primary h-14 flex items-center justify-center gap-3 text-base font-semibold">
                            {isProcessing ? (<><Loader2 className="w-5 h-5 animate-spin" />Memproses...</>) : (<><ScanLine className="w-5 h-5" />Scan QR</>)}
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

            <SuccessPopup show={showSuccessPopup} data={successData} onClose={() => { setShowSuccessPopup(false); setSuccessData(null); }} />

            {showCamera && pendingOrder && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
                    <div className="w-full max-w-2xl space-y-4 bg-dark-900/90 rounded-2xl p-6 border border-white/10 shadow-2xl">
                        <div className="glass-card p-6 rounded-2xl">
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                                    {pendingOrder.data?.order?.user?.photo ? (
                                        <img src={`${import.meta.env.VITE_API_URL ?? 'http://localhost:3012'}${pendingOrder.data.order.user.photo}`} alt={pendingOrder.data.order.user.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/40"><UserIcon className="w-10 h-10" /></div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className="text-2xl font-bold text-white">{pendingOrder.data?.order?.user?.name}</p>
                                    <p className="text-primary-400 font-mono">ID: {pendingOrder.data?.order?.user?.externalId}</p>
                                    <p className="text-white/60 text-sm">{pendingOrder.data?.order?.shift?.name}</p>
                                </div>
                            </div>
                        </div>
                        <div className="relative aspect-[4/3] bg-black rounded-2xl overflow-hidden">
                            <Webcam audio={false} ref={webcamRef} screenshotFormat="image/webp" className="w-full h-full object-cover" videoConstraints={{ facingMode: "user" }} />
                            <div className="absolute inset-0 border-4 border-primary-500/50 rounded-2xl pointer-events-none" />
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => { setShowCamera(false); setPendingOrder(null); setIsProcessing(false); }} className="btn-secondary flex-1 h-14">
                                <X className="w-5 h-5 mr-2" />Batal
                            </button>
                            <button onClick={capturePhoto} className="btn-primary flex-1 h-14">
                                <Camera className="w-5 h-5 mr-2" />Ambil Foto
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QR Scanner Modal */}
            {showQRScanner && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
                    <div className="w-full max-w-lg space-y-4 bg-dark-900/90 rounded-2xl p-6 border border-white/10 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
                                    <ScanLine className="w-6 h-6 text-primary-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">Scan QR Code</h3>
                                    <p className="text-white/50 text-sm">Arahkan kamera ke QR pesanan</p>
                                </div>
                            </div>
                            <button
                                onClick={closeQRScanner}
                                className="btn-icon bg-white/10 hover:bg-white/20"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div
                            ref={qrContainerRef}
                            id="qr-reader"
                            className="w-full aspect-square bg-black rounded-2xl overflow-hidden"
                        />

                        <div className="flex gap-4">
                            <button
                                onClick={closeQRScanner}
                                className="btn-secondary flex-1 h-14 flex items-center justify-center gap-2"
                            >
                                <X className="w-5 h-5" />
                                Batal
                            </button>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                            <p className="text-white/60 text-sm">
                                Pastikan QR code terlihat jelas dalam kotak scan
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
