import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth, api } from '../contexts/AuthContext';
import { useSSE, useSSERefresh, ORDER_EVENTS, USER_EVENTS, HOLIDAY_EVENTS, SHIFT_EVENTS, SETTINGS_EVENTS } from '../contexts/SSEContext';
import { Clock, AlertTriangle, CheckCircle2, Ban, Loader2, Download, Wifi, Calendar, XCircle, Sparkles, Timer } from 'lucide-react';
import toast from 'react-hot-toast';

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    canOrder: boolean;
    cutoffTime: string;
    minutesUntilCutoff: number;
    holiday?: {
        name: string;
        isFullday: boolean;
    } | null;
}

interface Order {
    id: string;
    qrCode: string;
    status: string;
    shift: Shift;
    orderDate: string;
    qrCodeImage?: string;
}

export default function OrderPage() {
    const { user, refreshUser } = useAuth();
    const { isConnected } = useSSE();
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [selectedShift, setSelectedShift] = useState<string>('');
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [maxOrderDaysAhead, setMaxOrderDaysAhead] = useState(7);
    const [todayOrder, setTodayOrder] = useState<Order | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOrdering, setIsOrdering] = useState(false);
    const [cutoffHours, setCutoffHours] = useState(6);

    const loadData = useCallback(async () => {
        try {
            const [shiftsRes, orderRes, settingsRes] = await Promise.all([
                api.get(`/api/shifts/for-user?date=${selectedDate}`),
                api.get(`/api/orders/today?date=${selectedDate}`),
                api.get('/api/settings'),
            ]);
            setShifts(shiftsRes.data.shifts);
            setCutoffHours(shiftsRes.data.cutoffHours);
            setTodayOrder(orderRes.data.order);
            setMaxOrderDaysAhead(settingsRes.data.maxOrderDaysAhead || 7);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        loadData();
        refreshUser();
        const interval = setInterval(loadData, 60000);
        return () => clearInterval(interval);
    }, [loadData, refreshUser]);

    useSSERefresh(ORDER_EVENTS, loadData);
    useSSERefresh(HOLIDAY_EVENTS, loadData);
    useSSERefresh(SHIFT_EVENTS, loadData);
    useSSERefresh(SETTINGS_EVENTS, loadData);
    useSSERefresh(USER_EVENTS, () => {
        refreshUser();
        loadData();
    });

    const handleOrder = async () => {
        if (!selectedShift) {
            toast.error('Pilih shift terlebih dahulu');
            return;
        }

        setIsOrdering(true);
        try {
            const res = await api.post('/api/orders', {
                shiftId: selectedShift,
                orderDate: selectedDate
            });
            setTodayOrder(res.data);
            toast.success(`Pesanan berhasil untuk ${new Date(selectedDate).toLocaleDateString('id-ID')}!`);
        } catch (error: any) {
            toast.error(error.response?.data?.message || error.response?.data?.error || 'Gagal membuat pesanan');
        } finally {
            setIsOrdering(false);
        }
    };

    const handleCancel = async () => {
        if (!todayOrder) return;

        try {
            await api.post(`/api/orders/${todayOrder.id}/cancel`);
            setTodayOrder(null);
            toast.success('Pesanan dibatalkan');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal membatalkan pesanan');
        }
    };

    const downloadQRCode = () => {
        if (!todayOrder) return;
        const svg = document.getElementById('qr-code-svg');
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx?.drawImage(img, 0, 0);
            const link = document.createElement('a');
            link.download = `catering-qr-${todayOrder.qrCode}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    };

    const formatTime = (minutes: number) => {
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hrs > 0) return `${hrs}j ${mins}m`;
        return `${mins}m`;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-primary-500 mx-auto" />
                    <p className="text-white/50 mt-4">Memuat data...</p>
                </div>
            </div>
        );
    }

    // Blacklisted user
    if (user?.isBlacklisted) {
        return (
            <div className="max-w-2xl mx-auto animate-fade-in">
                <div className="card text-center py-16">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-danger to-red-600 flex items-center justify-center shadow-glow-danger">
                        <Ban className="w-12 h-12 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-3">Akun Dibatasi</h2>
                    <p className="text-white/60 mb-6 max-w-sm mx-auto">
                        Akun Anda sementara dibatasi karena beberapa kali tidak mengambil pesanan.
                    </p>
                    {user.blacklistEndDate && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-danger/20 border border-danger/30">
                            <Clock className="w-4 h-4 text-danger" />
                            <span className="text-danger text-sm">
                                Berakhir: {new Date(user.blacklistEndDate).toLocaleDateString('id-ID')}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Show existing order
    if (todayOrder) {
        return (
            <div className="max-w-2xl mx-auto animate-fade-in space-y-6">
                {/* Connection Status */}
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                    isConnected 
                        ? 'bg-success/20 border border-success/30 text-success' 
                        : 'bg-danger/20 border border-danger/30 text-danger'
                }`}>
                    <div className="relative">
                        <Wifi className="w-4 h-4" />
                        {isConnected && <span className="absolute inset-0 w-4 h-4 bg-success rounded-full animate-ping opacity-50" />}
                    </div>
                    {isConnected ? 'Terhubung' : 'Menghubungkan...'}
                </div>

                {/* Date Selector */}
                <div className="card">
                    <label className="block text-sm font-medium text-white/60 mb-2">Pilih Tanggal</label>
                    <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            max={new Date(Date.now() + maxOrderDaysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                            className="input-field pl-12"
                        />
                    </div>
                </div>

                {/* Order Success Card */}
                <div className="card text-center py-10 relative overflow-hidden">
                    {/* Background decoration */}
                    <div className="absolute inset-0 opacity-30">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-500/30 to-transparent rounded-full blur-3xl" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-success/30 to-transparent rounded-full blur-3xl" />
                    </div>

                    <div className="relative z-10">
                        {todayOrder.status === 'PICKED_UP' ? (
                            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-success to-accent-teal flex items-center justify-center shadow-glow-success">
                                <CheckCircle2 className="w-12 h-12 text-white" />
                            </div>
                        ) : (
                            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center shadow-glow animate-pulse">
                                <Timer className="w-12 h-12 text-white" />
                            </div>
                        )}
                        
                        <h2 className="text-2xl font-bold text-white mb-2">
                            {todayOrder.status === 'PICKED_UP' ? 'Sudah Diambil!' : 'Pesanan Dikonfirmasi'}
                        </h2>
                        <p className="text-white/60">
                            {todayOrder.shift.name} • {todayOrder.shift.startTime} - {todayOrder.shift.endTime}
                        </p>

                        {/* QR Code */}
                        {todayOrder.status === 'ORDERED' && (
                            <div className="my-8">
                                <div className="qr-container mx-auto">
                                    <QRCodeSVG
                                        id="qr-code-svg"
                                        value={todayOrder.qrCode}
                                        size={200}
                                        level="H"
                                        includeMargin
                                    />
                                </div>
                                <p className="text-sm text-white/40 mt-4">
                                    Tunjukkan QR code ini di kantin
                                </p>
                            </div>
                        )}

                        {/* Status Badge */}
                        <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold ${
                            todayOrder.status === 'PICKED_UP'
                                ? 'bg-success/20 border border-success/30 text-success'
                                : 'bg-primary-500/20 border border-primary-500/30 text-primary-400'
                        }`}>
                            {todayOrder.status === 'PICKED_UP' ? (
                                <><CheckCircle2 className="w-4 h-4" /> Sudah Diambil</>
                            ) : (
                                <><Clock className="w-4 h-4" /> Menunggu Pengambilan</>
                            )}
                        </div>

                        {/* Action Buttons */}
                        {todayOrder.status === 'ORDERED' && (
                            <div className="flex gap-4 justify-center mt-8">
                                <button onClick={downloadQRCode} className="btn-secondary flex items-center gap-2">
                                    <Download className="w-4 h-4" />
                                    Download QR
                                </button>
                                <button onClick={handleCancel} className="btn-danger flex items-center gap-2">
                                    <XCircle className="w-4 h-4" />
                                    Batalkan
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Order form
    return (
        <div className="max-w-2xl mx-auto animate-fade-in space-y-6">
            {/* Connection Status */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                isConnected 
                    ? 'bg-success/20 border border-success/30 text-success' 
                    : 'bg-danger/20 border border-danger/30 text-danger'
            }`}>
                <div className="relative">
                    <Wifi className="w-4 h-4" />
                    {isConnected && <span className="absolute inset-0 w-4 h-4 bg-success rounded-full animate-ping opacity-50" />}
                </div>
                {isConnected ? 'Terhubung' : 'Menghubungkan...'}
            </div>

            <div className="card">
                {/* Header */}
                <div className="flex items-start gap-4 mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center shadow-glow flex-shrink-0">
                        <Sparkles className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Buat Pesanan</h2>
                        <p className="text-white/50 mt-1">
                            Pesanan harus dibuat {cutoffHours} jam sebelum shift dimulai
                        </p>
                    </div>
                </div>

                {/* Date Selection */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-white/60 mb-2">Tanggal Pesanan</label>
                    <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            max={new Date(Date.now() + maxOrderDaysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                            className="input-field pl-12"
                        />
                    </div>
                    <p className="text-xs text-white/40 mt-2">
                        Bisa memesan hingga {maxOrderDaysAhead} hari ke depan
                    </p>
                </div>

                {/* Shift Selection */}
                <div className="mb-8">
                    <label className="block text-sm font-medium text-white/60 mb-3">Pilih Shift</label>
                    <div className="space-y-3">
                        {shifts.map((shift) => (
                            <label
                                key={shift.id}
                                className={`block cursor-pointer transition-all duration-300 ${
                                    !shift.canOrder ? 'opacity-50 cursor-not-allowed' : ''
                                } ${
                                    selectedShift === shift.id
                                        ? 'shift-card-selected'
                                        : shift.canOrder
                                            ? 'shift-card'
                                            : 'shift-card-disabled'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        {/* Custom Radio */}
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                            selectedShift === shift.id
                                                ? 'border-primary-500 bg-primary-500'
                                                : 'border-white/30'
                                        }`}>
                                            {selectedShift === shift.id && (
                                                <div className="w-2 h-2 rounded-full bg-white" />
                                            )}
                                        </div>
                                        <input
                                            type="radio"
                                            name="shift"
                                            value={shift.id}
                                            checked={selectedShift === shift.id}
                                            onChange={(e) => setSelectedShift(e.target.value)}
                                            disabled={!shift.canOrder}
                                            className="hidden"
                                        />
                                        <div>
                                            <p className="font-semibold text-white">{shift.name}</p>
                                            <p className="text-sm text-white/50">{shift.startTime} - {shift.endTime}</p>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        {shift.holiday ? (
                                            <div className="badge badge-warning">
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                Libur
                                            </div>
                                        ) : shift.canOrder ? (
                                            <div className="badge badge-success">
                                                <Clock className="w-3.5 h-3.5" />
                                                {formatTime(shift.minutesUntilCutoff)} tersisa
                                            </div>
                                        ) : (
                                            <div className="badge badge-danger">
                                                <XCircle className="w-3.5 h-3.5" />
                                                Waktu habis
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Order Button */}
                <button
                    onClick={handleOrder}
                    disabled={!selectedShift || isOrdering}
                    className="btn-primary w-full flex items-center justify-center gap-3 py-4 text-lg"
                >
                    {isOrdering ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Memproses...
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-5 h-5" />
                            Buat Pesanan
                        </>
                    )}
                </button>

                {/* Warning */}
                {user && user.noShowCount > 0 && (
                    <div className="mt-6 p-4 rounded-2xl bg-warning/10 border border-warning/30">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold text-warning">Peringatan</p>
                                <p className="text-sm text-white/60 mt-1">
                                    Anda memiliki {user.noShowCount} pelanggaran. Setelah 3 pelanggaran, akun akan dibatasi.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
