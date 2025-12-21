import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth, api } from '../contexts/AuthContext';
import { useSSE, useSSERefresh, ORDER_EVENTS, USER_EVENTS, HOLIDAY_EVENTS, SHIFT_EVENTS, SETTINGS_EVENTS } from '../contexts/SSEContext';
import { Clock, AlertTriangle, CheckCircle2, Ban, Loader2, Download, Wifi, XCircle, Sparkles, CalendarDays, Check, X, MapPin } from 'lucide-react';
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

interface DateInfo {
    date: string;
    formatted: string;
    dayName: string;
    isToday: boolean;
    shifts: Shift[];
    hasOrder: boolean;
    existingOrder?: Order | null;
}

interface BulkOrderResult {
    success: Array<{ date: string; order: Order }>;
    failed: Array<{ date: string; shiftId: string; reason: string }>;
    summary: { total: number; successCount: number; failedCount: number };
}

interface Canteen {
    id: string;
    name: string;
    location: string | null;
}

export default function OrderPage() {
    const { user, refreshUser } = useAuth();
    const { isConnected } = useSSE();
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [selectedShift, setSelectedShift] = useState<string>('');
    const [canteens, setCanteens] = useState<Canteen[]>([]);
    const [selectedCanteen, setSelectedCanteen] = useState<string>('');

    // Helper to format date as YYYY-MM-DD in local timezone (avoids UTC date shift)
    const getLocalDateString = (date: Date = new Date()): string => {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [selectedDate] = useState<string>(getLocalDateString());
    const [maxOrderDaysAhead, setMaxOrderDaysAhead] = useState(7);
    const [todayOrder, setTodayOrder] = useState<Order | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOrdering, setIsOrdering] = useState(false);
    const [cutoffDays, setCutoffDays] = useState(0);
    const [cutoffHours, setCutoffHours] = useState(6);

    // Bulk order states - Default to TRUE and remove toggle
    const [isBulkMode, setIsBulkMode] = useState(true);
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [availableDates, setAvailableDates] = useState<DateInfo[]>([]);
    const [bulkResult, setBulkResult] = useState<BulkOrderResult | null>(null);

    // Cancel modal states
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);

    // Use ref to track if canteen has been initialized to prevent infinite loop
    const canteenInitializedRef = useRef(false);
    const userPreferredCanteenRef = useRef(user?.preferredCanteenId);

    // Update ref when user changes
    useEffect(() => {
        userPreferredCanteenRef.current = user?.preferredCanteenId;
    }, [user?.preferredCanteenId]);

    const loadData = useCallback(async () => {
        try {
            const [shiftsRes, orderRes, settingsRes, canteensRes] = await Promise.all([
                api.get(`/api/shifts/for-user?date=${selectedDate}`),
                api.get(`/api/orders/today?date=${selectedDate}`),
                api.get('/api/settings'),
                api.get('/api/canteens')
            ]);
            setShifts(shiftsRes.data.shifts);
            setCutoffDays(shiftsRes.data.cutoffDays || 0);
            setCutoffHours(shiftsRes.data.cutoffHours);
            setTodayOrder(orderRes.data.order);
            setMaxOrderDaysAhead(settingsRes.data.maxOrderDaysAhead || 7);
            setCanteens(canteensRes.data.canteens || []);
            // Auto-select user's preferred canteen only on first load
            if (canteensRes.data.canteens?.length > 0 && !canteenInitializedRef.current) {
                canteenInitializedRef.current = true;
                // Check if user has a preferred canteen and it exists in the active canteens list
                const preferred = canteensRes.data.canteens.find((c: Canteen) => c.id === userPreferredCanteenRef.current);

                if (preferred) {
                    setSelectedCanteen(preferred.id);
                } else {
                    setSelectedCanteen(canteensRes.data.canteens[0].id);
                }
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    // Use ref for maxOrderDaysAhead to prevent re-renders triggering loadBulkData
    const maxOrderDaysAheadRef = useRef(maxOrderDaysAhead);
    useEffect(() => {
        maxOrderDaysAheadRef.current = maxOrderDaysAhead;
    }, [maxOrderDaysAhead]);

    // Track if bulk data has been loaded to prevent duplicate calls
    const bulkDataLoadedRef = useRef(false);

    // Load available dates for bulk ordering
    const loadBulkData = useCallback(async () => {
        // Always load bulk data

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dates: DateInfo[] = [];

            // Helper to format date as YYYY-MM-DD in local timezone
            const formatLocalDate = (d: Date) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            // First get shifts API to check cutoffMode and orderableDates
            const shiftsRes = await api.get(`/api/shifts/for-user?date=${formatLocalDate(today)}`);
            const cutoffMode = shiftsRes.data.cutoffMode || 'per-shift';
            const apiOrderableDates = shiftsRes.data.orderableDates || [];
            const currentMaxDays = maxOrderDaysAheadRef.current;

            // Determine which dates to show
            let datesToProcess: string[] = [];

            if (cutoffMode === 'weekly' && apiOrderableDates.length > 0) {
                // Weekly mode: use dates from API
                datesToProcess = apiOrderableDates;
            } else {
                // Per-shift mode: generate dates based on maxOrderDaysAhead
                const endDate = new Date(today);
                endDate.setDate(endDate.getDate() + currentMaxDays);

                for (let i = 0; i <= currentMaxDays; i++) {
                    const date = new Date(today);
                    date.setDate(date.getDate() + i);
                    datesToProcess.push(formatLocalDate(date));
                }
            }

            // Get all orders for the user in the date range
            const startDateStr = datesToProcess.length > 0 ? datesToProcess[0] : formatLocalDate(today);
            const endDateStr = datesToProcess.length > 0 ? datesToProcess[datesToProcess.length - 1] : formatLocalDate(today);

            const ordersRes = await api.get('/api/orders/my-orders', {
                params: {
                    startDate: startDateStr,
                    endDate: endDateStr,
                    limit: 100
                }
            });

            // Batch fetch shifts for all dates at once - use the first date's shifts as template
            // since shift configuration is typically the same across dates
            const firstDateShiftsRes = shiftsRes; // Already fetched above

            for (const dateStr of datesToProcess) {
                const date = new Date(dateStr + 'T00:00:00');

                // For dates other than today, fetch their specific shifts (holidays may differ)
                let dateShifts = firstDateShiftsRes.data.shifts;
                if (dateStr !== formatLocalDate(today)) {
                    try {
                        const dateShiftsRes = await api.get(`/api/shifts/for-user?date=${dateStr}`);
                        dateShifts = dateShiftsRes.data.shifts;
                    } catch {
                        // Use first date's shifts as fallback
                    }
                }

                // Check if user already has an order for this date
                const existingOrder = ordersRes.data.orders?.find((o: Order) => {
                    const orderDate = new Date(o.orderDate);
                    orderDate.setHours(0, 0, 0, 0);
                    return formatLocalDate(orderDate) === dateStr && o.status !== 'CANCELLED';
                });

                dates.push({
                    date: dateStr,
                    formatted: date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
                    dayName: date.toLocaleDateString('id-ID', { weekday: 'long' }),
                    isToday: dateStr === formatLocalDate(today),
                    shifts: dateShifts,
                    hasOrder: !!existingOrder,
                    existingOrder,
                });
            }

            setAvailableDates(dates);
            bulkDataLoadedRef.current = true;
        } catch (error) {
            console.error('Failed to load bulk data:', error);
        }
    }, []); // Empty dependency array - only run once on mount and when explicitly called

    useEffect(() => {
        loadData();
        refreshUser();
        // SSE handles real-time updates - no need for redundant polling
    }, [loadData, refreshUser]);

    useEffect(() => {
        loadBulkData();
    }, [loadBulkData]);

    // Consolidated SSE handler for all data-related events (debounced)
    const handleSSERefresh = useCallback(() => {
        loadData();
        loadBulkData();
    }, [loadData, loadBulkData]);

    useSSERefresh([...ORDER_EVENTS, ...HOLIDAY_EVENTS, ...SHIFT_EVENTS, ...SETTINGS_EVENTS], handleSSERefresh);

    useSSERefresh(USER_EVENTS, () => {
        refreshUser();
        loadData();
    });



    const handleBulkOrder = async () => {
        if (!selectedShift) {
            toast.error('Pilih shift terlebih dahulu');
            return;
        }
        if (selectedDates.length === 0) {
            toast.error('Pilih minimal satu tanggal');
            return;
        }

        setIsOrdering(true);
        setBulkResult(null);

        try {
            const orders = selectedDates.map(date => ({
                date,
                shiftId: selectedShift
            }));

            const res = await api.post('/api/orders/bulk', { orders, canteenId: selectedCanteen || null });
            setBulkResult(res.data);

            if (res.data.summary.successCount > 0) {
                toast.success(`Berhasil membuat ${res.data.summary.successCount} pesanan!`);
            }
            if (res.data.summary.failedCount > 0) {
                toast.error(`${res.data.summary.failedCount} pesanan gagal dibuat`);
            }

            // Reload bulk data to update the list
            loadBulkData();
            setSelectedDates([]);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal membuat pesanan');
        } finally {
            setIsOrdering(false);
        }
    };

    const handleCancel = async () => {
        if (!todayOrder) return;

        if (!cancelReason.trim()) {
            toast.error('Alasan pembatalan harus diisi');
            return;
        }

        setIsCancelling(true);
        try {
            await api.post(`/api/orders/${todayOrder.id}/cancel`, { reason: cancelReason.trim() });
            setTodayOrder(null);
            setShowCancelModal(false);
            setCancelReason('');
            toast.success('Pesanan dibatalkan');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal membatalkan pesanan');
        } finally {
            setIsCancelling(false);
        }
    };

    const openCancelModal = () => {
        setCancelReason('');
        setShowCancelModal(true);
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

    const toggleDateSelection = (dateStr: string) => {
        setSelectedDates(prev =>
            prev.includes(dateStr)
                ? prev.filter(d => d !== dateStr)
                : [...prev, dateStr]
        );
    };

    const selectAllAvailableDates = () => {
        const selectableDates = availableDates
            .filter(d => !d.hasOrder && d.shifts.some(s => s.canOrder))
            .map(d => d.date);
        setSelectedDates(selectableDates);
    };

    const clearSelection = () => {
        setSelectedDates([]);
    };

    // Get shifts that can be ordered for any selected date
    const availableShiftsForBulk = useMemo(() => {
        if (!isBulkMode || selectedDates.length === 0) return shifts;

        // Find shifts that have canOrder=true for at least one selected date
        const allShifts: Map<string, Shift> = new Map();

        for (const dateStr of selectedDates) {
            const dateInfo = availableDates.find(d => d.date === dateStr);
            if (dateInfo) {
                for (const shift of dateInfo.shifts) {
                    if (shift.canOrder && !allShifts.has(shift.id)) {
                        allShifts.set(shift.id, shift);
                    }
                }
            }
        }

        return Array.from(allShifts.values());
    }, [isBulkMode, selectedDates, availableDates, shifts]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto" />
                    <p className="text-slate-500 mt-4">Memuat data...</p>
                </div>
            </div>
        );
    }

    // Blacklisted user
    if (user?.isBlacklisted) {
        return (
            <div className="max-w-2xl mx-auto animate-fade-in">
                <div className="card text-center py-16">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                        <Ban className="w-12 h-12 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-[#1a1f37] mb-3">Akun Dibatasi</h2>
                    <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                        Akun Anda sementara dibatasi karena beberapa kali tidak mengambil pesanan.
                    </p>
                    {user.blacklistEndDate && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 border border-red-200">
                            <Clock className="w-4 h-4 text-red-600" />
                            <span className="text-red-600 text-sm">
                                Berakhir: {new Date(user.blacklistEndDate).toLocaleDateString('id-ID')}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        );
    }



    // Bulk order result view
    if (bulkResult) {
        return (
            <div className="max-w-2xl mx-auto animate-fade-in space-y-6">
                {/* Connection Status */}
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${isConnected
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-red-50 text-red-600'
                    }`}>
                    <div className="relative">
                        <Wifi className="w-4 h-4" />
                        {isConnected && <span className="absolute inset-0 w-4 h-4 bg-emerald-500 rounded-full animate-ping opacity-30" />}
                    </div>
                    {isConnected ? 'Terhubung' : 'Menghubungkan...'}
                </div>

                <div className="card">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0">
                            <CheckCircle2 className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-[#1a1f37]">Hasil Pemesanan</h2>
                            <p className="text-slate-500 mt-1">
                                {bulkResult.summary.successCount} berhasil, {bulkResult.summary.failedCount} gagal
                            </p>
                        </div>
                    </div>

                    {/* Success Orders */}
                    {bulkResult.success.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-sm font-medium text-emerald-600 mb-3 flex items-center gap-2">
                                <Check className="w-4 h-4" /> Berhasil ({bulkResult.success.length})
                            </h3>
                            <div className="space-y-2">
                                {bulkResult.success.map((item) => (
                                    <div key={item.date} className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[#1a1f37] font-medium">
                                                {new Date(item.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
                                            </span>
                                            <span className="text-emerald-600 text-sm">{item.order.shift.name}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Failed Orders */}
                    {bulkResult.failed.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-sm font-medium text-red-600 mb-3 flex items-center gap-2">
                                <X className="w-4 h-4" /> Gagal ({bulkResult.failed.length})
                            </h3>
                            <div className="space-y-2">
                                {bulkResult.failed.map((item, idx) => (
                                    <div key={idx} className="p-3 rounded-xl bg-red-50 border border-red-100">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[#1a1f37] font-medium">
                                                {new Date(item.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
                                            </span>
                                        </div>
                                        <p className="text-red-600 text-sm">{item.reason}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => {
                            setBulkResult(null);
                            setIsBulkMode(true);
                        }}
                        className="btn-primary w-full"
                    >
                        Kembali ke Pemesanan
                    </button>
                </div>
            </div>
        );
    }

    // Order form
    return (
        <div className="max-w-2xl mx-auto animate-fade-in space-y-6">
            {/* Connection Status */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${isConnected
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-red-50 text-red-600'
                }`}>
                <div className="relative">
                    <Wifi className="w-4 h-4" />
                    {isConnected && <span className="absolute inset-0 w-4 h-4 bg-emerald-500 rounded-full animate-ping opacity-30" />}
                </div>
                {isConnected ? 'Terhubung' : 'Menghubungkan...'}
            </div>

            {/* Existing Order / QR Code Card */}
            {todayOrder && (
                <div className="card text-center py-6 relative overflow-hidden mb-6">
                    {/* Background decoration */}
                    <div className="absolute inset-0 opacity-20 pointer-events-none">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-500/30 to-transparent rounded-full blur-3xl" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-emerald-500/30 to-transparent rounded-full blur-3xl" />
                    </div>

                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4 px-2">
                            <h2 className="text-lg font-bold text-[#1a1f37] flex items-center gap-2">
                                {todayOrder.status === 'PICKED_UP' ? (
                                    <><CheckCircle2 className="w-5 h-5 text-emerald-500" /> Pesanan Hari Ini: Selesai</>
                                ) : (
                                    <><Sparkles className="w-5 h-5 text-orange-500" /> Pesanan Hari Ini</>
                                )}
                            </h2>
                            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${todayOrder.status === 'PICKED_UP'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-orange-50 text-orange-600'
                                }`}>
                                {todayOrder.status === 'PICKED_UP' ? 'Sudah Diambil' : 'Menunggu Pengambilan'}
                            </div>
                        </div>

                        <div className="bg-white/50 rounded-xl p-4 border border-white/60 backdrop-blur-sm flex flex-col md:flex-row items-center gap-6">
                            {/* QR Code (Smaller) */}
                            {todayOrder.status === 'ORDERED' && (
                                <div className="qr-container bg-white p-2 rounded-xl shadow-sm">
                                    <QRCodeSVG
                                        id="qr-code-svg"
                                        value={todayOrder.qrCode}
                                        size={100}
                                        level="H"
                                        includeMargin
                                    />
                                </div>
                            )}

                            <div className="flex-1 text-left">
                                <p className="font-semibold text-[#1a1f37] text-lg">{todayOrder.shift.name}</p>
                                <p className="text-slate-500">{todayOrder.shift.startTime} - {todayOrder.shift.endTime}</p>

                                {todayOrder.status === 'ORDERED' && (
                                    <div className="flex gap-2 mt-4">
                                        <button onClick={downloadQRCode} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors">
                                            <Download className="w-4 h-4" />
                                            Simpan QR
                                        </button>
                                        <button onClick={openCancelModal} className="px-3 py-1.5 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600 hover:bg-red-100 flex items-center gap-2 transition-colors">
                                            <XCircle className="w-4 h-4" />
                                            Batalkan
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}



            <div className="card">
                {/* Header */}
                <div className="flex items-start gap-4 mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20 flex-shrink-0">
                        {isBulkMode ? <CalendarDays className="w-7 h-7 text-white" /> : <Sparkles className="w-7 h-7 text-white" />}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-[#1a1f37]">
                            {isBulkMode ? 'Menu Pesan Makan' : 'Buat Pesanan'}
                        </h2>
                        <p className="text-slate-500 mt-1">
                            {isBulkMode
                                ? `Order Makanan anda hingga ${maxOrderDaysAhead + 1} hari kedepan`
                                : `Pesanan harus dibuat ${cutoffDays > 0 ? `${cutoffDays} hari ` : ''}${cutoffHours} jam sebelum shift dimulai`}
                        </p>
                    </div>
                </div>



                {/* Bulk Date Selection */}
                {isBulkMode && (
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-sm font-medium text-white/60">Pilih Tanggal</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={selectAllAvailableDates}
                                    className="text-xs text-primary-400 hover:text-primary-300"
                                >
                                    Pilih Semua
                                </button>
                                <span className="text-white/20">|</span>
                                <button
                                    onClick={clearSelection}
                                    className="text-xs text-white/40 hover:text-white/60"
                                >
                                    Hapus Pilihan
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                            {availableDates.map((dateInfo) => {
                                const hasAvailableShift = dateInfo.shifts.some(s => s.canOrder);
                                const isDisabled = dateInfo.hasOrder || !hasAvailableShift;
                                const isSelected = selectedDates.includes(dateInfo.date);

                                return (
                                    <label
                                        key={dateInfo.date}
                                        className={`flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${isDisabled
                                            ? 'opacity-50 cursor-not-allowed bg-white/5'
                                            : isSelected
                                                ? 'bg-primary-500/20 border border-primary-500/30'
                                                : 'bg-white/5 hover:bg-white/10 border border-transparent'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => !isDisabled && toggleDateSelection(dateInfo.date)}
                                            disabled={isDisabled}
                                            className="hidden"
                                        />
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected
                                            ? 'border-primary-500 bg-primary-500'
                                            : 'border-white/30'
                                            }`}>
                                            {isSelected && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-white font-medium">
                                                {dateInfo.dayName}, {dateInfo.formatted}
                                                {dateInfo.isToday && <span className="text-primary-400 text-xs ml-2">(Hari ini)</span>}
                                            </p>
                                            {dateInfo.hasOrder && (
                                                <p className="text-warning text-xs">Sudah ada pesanan</p>
                                            )}
                                            {!hasAvailableShift && !dateInfo.hasOrder && (
                                                <p className="text-danger text-xs">
                                                    {dateInfo.shifts[0]?.holiday
                                                        ? `Libur: ${dateInfo.shifts[0].holiday.name}`
                                                        : 'Waktu pemesanan sudah lewat'}
                                                </p>
                                            )}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                        {selectedDates.length > 0 && (
                            <p className="text-xs text-primary-400 mt-2">
                                {selectedDates.length} tanggal dipilih
                            </p>
                        )}
                    </div>
                )}

                {/* Shift Selection */}
                <div className="mb-8">
                    <label className="block text-sm font-medium text-white/60 mb-3">Pilih Shift</label>
                    <div className="space-y-3">
                        {(isBulkMode ? availableShiftsForBulk : shifts).map((shift) => (
                            <label
                                key={shift.id}
                                className={`block cursor-pointer transition-all duration-300 ${!shift.canOrder && !isBulkMode ? 'opacity-50 cursor-not-allowed' : ''
                                    } ${selectedShift === shift.id
                                        ? 'shift-card-selected'
                                        : shift.canOrder || isBulkMode
                                            ? 'shift-card'
                                            : 'shift-card-disabled'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        {/* Custom Radio */}
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedShift === shift.id
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
                                            disabled={!shift.canOrder && !isBulkMode}
                                            className="hidden"
                                        />
                                        <div>
                                            <p className="font-semibold text-white">{shift.name}</p>
                                            <p className="text-sm text-white/50">{shift.startTime} - {shift.endTime}</p>
                                        </div>
                                    </div>

                                    {!isBulkMode && (
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
                                    )}
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Canteen Selection */}
                {canteens.length > 0 && (
                    <div className="mb-6">
                        <label className="text-sm font-medium text-white/60 block mb-3">
                            <MapPin className="w-4 h-4 inline mr-2" />
                            Pilih Lokasi Kantin
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {canteens.map((canteen) => (
                                <button
                                    key={canteen.id}
                                    type="button"
                                    onClick={() => setSelectedCanteen(canteen.id)}
                                    className={`px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-all ${selectedCanteen === canteen.id
                                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                        : 'bg-dark-lighter text-white/60 hover:bg-dark-light hover:text-white'
                                        }`}
                                >
                                    <MapPin className="w-4 h-4" />
                                    <span>{canteen.name}</span>
                                    {canteen.location && (
                                        <span className="text-xs opacity-60">({canteen.location})</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Order Button */}
                <button
                    onClick={handleBulkOrder}
                    disabled={!selectedShift || isOrdering || selectedDates.length === 0}
                    className="btn-primary w-full flex items-center justify-center gap-3 py-4 text-lg"
                >
                    {isOrdering ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Memproses...
                        </>
                    ) : (
                        <>
                            <CalendarDays className="w-5 h-5" />
                            Buat {selectedDates.length} Pesanan Sekaligus
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

                {/* Complaint Form Removed per user request */}

            </div>

            {/* Cancel Modal */}
            {showCancelModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowCancelModal(false)}
                    />
                    <div className="relative bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-white/10 shadow-2xl animate-fade-in">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-xl bg-danger/20 flex items-center justify-center">
                                <XCircle className="w-6 h-6 text-danger" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Batalkan Pesanan</h3>
                                <p className="text-sm text-white/50">Masukkan alasan pembatalan</p>
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-white/60 mb-2">
                                Alasan Pembatalan <span className="text-danger">*</span>
                            </label>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Contoh: Ada rapat mendadak di luar kantor, tidak bisa makan siang di kantor"
                                className="input-field w-full min-h-[100px] resize-none"
                                autoFocus
                            />
                            <p className="text-xs text-white/40 mt-2">
                                Alasan ini akan dicatat dan dapat dilihat oleh admin
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCancelModal(false)}
                                className="btn-secondary flex-1"
                                disabled={isCancelling}
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={!cancelReason.trim() || isCancelling}
                                className="btn-danger flex-1 flex items-center justify-center gap-2"
                            >
                                {isCancelling ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Membatalkan...
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-4 h-4" />
                                        Batalkan Pesanan
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
