import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import OrderBarcode from '../components/OrderBarcode';
import { useAuth, api } from '../contexts/AuthContext';
import {
    useSSERefresh,
    ORDER_EVENTS,
    USER_EVENTS,
    HOLIDAY_EVENTS,
    SHIFT_EVENTS,
    SETTINGS_EVENTS,
} from '../contexts/SSEContext';
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    Download,
    XCircle,
    Check,
    X,
    Ban,
    QrCode,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getLocalDateString, addDays, formatOrderDate } from '../utils/dateHelpers';
import { Button, Card, PageHeader, Badge, Modal, SkeletonCard, Textarea } from '../components/ui';

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    breakStartTime?: string | null;
    breakEndTime?: string | null;
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
    canteen?: {
        id: string;
        name: string;
        location?: string | null;
    } | null;
}

interface DateInfo {
    date: string;
    dowShort: string;
    dayNum: string;
    monthShort: string;
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
    capacity?: number | null;
    canteenShifts?: Array<{
        capacity?: number | null;
        shift: { id: string; name: string };
    }>;
}

const DOW_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DOW_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

function parseDateParts(dateStr: string) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const localDt = new Date(y, m - 1, d);
    const dowIdx = localDt.getDay();
    return {
        dowShort: DOW_SHORT[dowIdx],
        dayName: DOW_LONG[dowIdx],
        dayNum: String(d),
        monthShort: MONTH_SHORT[m - 1] || '',
        formatted: `${d} ${MONTH_SHORT[m - 1] || ''} ${y}`,
        chipLabel: `${DOW_SHORT[dowIdx]} ${d} ${MONTH_SHORT[m - 1] || ''}`,
    };
}

function getGreeting(): string {
    const hr = new Date().getHours();
    if (hr < 11) return 'Selamat pagi,';
    if (hr < 15) return 'Selamat siang,';
    if (hr < 18) return 'Selamat sore,';
    return 'Selamat malam,';
}

function getInitials(name?: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

export default function OrderPage() {
    const { user, refreshUser, isLoading: authLoading } = useAuth();
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [selectedShift, setSelectedShift] = useState<string>('');
    const [canteens, setCanteens] = useState<Canteen[]>([]);
    const [selectedCanteen, setSelectedCanteen] = useState<string>('');

    const [selectedDate] = useState<string>(getLocalDateString());
    const [maxOrderDaysAhead, setMaxOrderDaysAhead] = useState(7);
    const [todayOrder, setTodayOrder] = useState<Order | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOrdering, setIsOrdering] = useState(false);

    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [availableDates, setAvailableDates] = useState<DateInfo[]>([]);
    const [bulkResult, setBulkResult] = useState<BulkOrderResult | null>(null);

    // Cancel & QR modals
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);

    const canteenInitializedRef = useRef(false);
    const maxOrderDaysAheadRef = useRef(maxOrderDaysAhead);
    useEffect(() => {
        maxOrderDaysAheadRef.current = maxOrderDaysAhead;
    }, [maxOrderDaysAhead]);

    const loadData = useCallback(async () => {
        try {
            const [shiftsRes, orderRes, settingsRes, canteensRes] = await Promise.all([
                api.get(`/api/shifts/for-user?date=${selectedDate}`),
                api.get(`/api/orders/today?date=${selectedDate}`),
                api.get('/api/settings'),
                api.get('/api/canteens'),
            ]);
            const loadedShifts: Shift[] = shiftsRes.data.shifts || [];
            setShifts(loadedShifts);
            setTodayOrder(orderRes.data.order || null);
            setMaxOrderDaysAhead(settingsRes.data.maxOrderDaysAhead || 7);
            setCanteens(canteensRes.data.canteens || []);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        if (canteens.length > 0 && !authLoading && !canteenInitializedRef.current) {
            canteenInitializedRef.current = true;
            if (user?.preferredCanteenId) {
                const preferred = canteens.find((c) => c.id === user.preferredCanteenId);
                if (preferred) {
                    setSelectedCanteen(preferred.id);
                    return;
                }
            }
            setSelectedCanteen(canteens[0].id);
        }
    }, [canteens, authLoading, user?.preferredCanteenId]);

    const loadBulkData = useCallback(async () => {
        try {
            const todayStr = getLocalDateString();
            const [shiftsRes, settingsRes] = await Promise.all([
                api.get(`/api/shifts/for-user?date=${todayStr}`),
                api.get('/api/settings'),
            ]);
            const cutoffMode = shiftsRes.data.cutoffMode || 'per-shift';
            const apiOrderableDates: string[] = shiftsRes.data.orderableDates || [];
            const currentMaxDays = settingsRes.data.maxOrderDaysAhead ?? maxOrderDaysAheadRef.current;

            let datesToProcess: string[] = [];
            if (cutoffMode === 'weekly' && apiOrderableDates.length > 0) {
                datesToProcess = apiOrderableDates;
            } else {
                for (let i = 0; i <= currentMaxDays; i++) {
                    datesToProcess.push(addDays(todayStr, i));
                }
            }

            const startDateStr = datesToProcess.length > 0 ? datesToProcess[0] : todayStr;
            const endDateStr = datesToProcess.length > 0 ? datesToProcess[datesToProcess.length - 1] : todayStr;

            const ordersRes = await api.get('/api/orders/my-orders', {
                params: { startDate: startDateStr, endDate: endDateStr, limit: 100 },
            });

            const dates: DateInfo[] = [];
            for (const dateStr of datesToProcess) {
                let dateShifts: Shift[] = shiftsRes.data.shifts || [];
                if (dateStr !== todayStr) {
                    try {
                        const dateShiftsRes = await api.get(`/api/shifts/for-user?date=${dateStr}`);
                        dateShifts = dateShiftsRes.data.shifts || dateShifts;
                    } catch {
                        // fallback to today's shifts template
                    }
                }

                const existingOrder = (ordersRes.data.orders || []).find(
                    (o: Order) => formatOrderDate(o.orderDate) === dateStr && o.status !== 'CANCELLED'
                );

                const parts = parseDateParts(dateStr);
                dates.push({
                    date: dateStr,
                    dowShort: parts.dowShort,
                    dayNum: parts.dayNum,
                    monthShort: parts.monthShort,
                    formatted: parts.formatted,
                    dayName: parts.dayName,
                    isToday: dateStr === todayStr,
                    shifts: dateShifts,
                    hasOrder: !!existingOrder,
                    existingOrder,
                });
            }

            setAvailableDates(dates);
        } catch (error) {
            console.error('Failed to load bulk data:', error);
        }
    }, []);

    useEffect(() => {
        loadData();
        refreshUser();
    }, [loadData, refreshUser]);

    useEffect(() => {
        loadBulkData();
    }, [loadBulkData]);

    const handleSSERefresh = useCallback(() => {
        loadData();
        loadBulkData();
    }, [loadData, loadBulkData]);

    useSSERefresh([...ORDER_EVENTS, ...HOLIDAY_EVENTS, ...SHIFT_EVENTS, ...SETTINGS_EVENTS], handleSSERefresh);
    useSSERefresh(USER_EVENTS, () => {
        refreshUser();
        loadData();
    });

    const availableShiftsForBulk = useMemo(() => {
        if (selectedDates.length === 0) return shifts;
        const map = new Map<string, Shift>();
        for (const dateStr of selectedDates) {
            const info = availableDates.find((d) => d.date === dateStr);
            if (info) {
                for (const s of info.shifts) {
                    if (s.canOrder && !map.has(s.id)) {
                        map.set(s.id, s);
                    }
                }
            }
        }
        return Array.from(map.values());
    }, [selectedDates, availableDates, shifts]);

    // Auto-select first valid shift if current selection is empty or unavailable
    useEffect(() => {
        const list = availableShiftsForBulk;
        if (list.length > 0 && !list.some((s) => s.id === selectedShift)) {
            const first = list.find((s) => s.canOrder) || list[0];
            if (first) setSelectedShift(first.id);
        }
    }, [availableShiftsForBulk, selectedShift]);

    const toggleDateSelection = (dateStr: string) => {
        setSelectedDates((prev) =>
            prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr].sort()
        );
    };

    const isDateBlacklistedFor = (dateStr: string) => {
        if (!user?.isBlacklisted) return false;
        if (!user.blacklistEndDate) return true;
        return dateStr <= formatOrderDate(user.blacklistEndDate);
    };

    const selectAllAvailableDates = () => {
        const selectable = availableDates
            .filter((d) => !d.hasOrder && d.shifts.some((s) => s.canOrder) && !isDateBlacklistedFor(d.date))
            .map((d) => d.date);
        setSelectedDates(selectable);
    };

    const clearSelection = () => setSelectedDates([]);

    const isCanteenDisabled = useCallback(
        (canteen: Canteen): { disabled: boolean; note: string } => {
            if (user?.preferredCanteenId && user.preferredCanteenId !== canteen.id) {
                return { disabled: true, note: 'Terkunci sesuai lokasi kerja' };
            }
            if (
                selectedShift &&
                canteen.canteenShifts &&
                canteen.canteenShifts.length > 0 &&
                !canteen.canteenShifts.some((cs) => cs.shift.id === selectedShift)
            ) {
                return { disabled: true, note: 'Tidak melayani shift ini' };
            }
            if (canteen.capacity) {
                return { disabled: false, note: `Kuota ${canteen.capacity} porsi` };
            }
            return { disabled: false, note: canteen.location || 'Tersedia' };
        },
        [selectedShift, user?.preferredCanteenId]
    );

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
            const orders = selectedDates.map((date) => ({ date, shiftId: selectedShift }));
            const res = await api.post('/api/orders/bulk', {
                orders,
                canteenId: selectedCanteen || null,
            });
            setBulkResult(res.data);
            if (res.data.summary.successCount > 0) {
                toast.success(`Berhasil membuat ${res.data.summary.successCount} pesanan!`);
            }
            if (res.data.summary.failedCount > 0) {
                toast.error(`${res.data.summary.failedCount} pesanan gagal dibuat`);
            }
            loadData();
            loadBulkData();
            setSelectedDates([]);
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string } } };
            toast.error(err.response?.data?.error || 'Gagal membuat pesanan');
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
            setShowQrModal(false);
            setCancelReason('');
            loadBulkData();
            toast.success('Pesanan dibatalkan');
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string } } };
            toast.error(err.response?.data?.error || 'Gagal membatalkan pesanan');
        } finally {
            setIsCancelling(false);
        }
    };

    const downloadBarcode = () => {
        if (!todayOrder) return;
        const svg = document.getElementById('order-barcode-svg');
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
            link.download = `catering-barcode-${todayOrder.qrCode}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    };

    const isCancelLocked = useCallback((order: Order) => {
        const now = new Date();
        const orderKey = formatOrderDate(order.orderDate);
        const todayKey = getLocalDateString(now);
        if (orderKey === todayKey) {
            const [startHour, startMin] = order.shift.startTime.split(':').map(Number);
            const shiftStartObj = new Date(now);
            shiftStartObj.setHours(startHour, startMin, 0, 0);
            return now.getTime() >= shiftStartObj.getTime();
        }
        return false;
    }, []);

    const activeShiftObj = useMemo(
        () => availableShiftsForBulk.find((s) => s.id === selectedShift) || shifts.find((s) => s.id === selectedShift),
        [availableShiftsForBulk, shifts, selectedShift]
    );
    const activeCanteenObj = useMemo(
        () => canteens.find((c) => c.id === selectedCanteen),
        [canteens, selectedCanteen]
    );
    const canteenValidation = activeCanteenObj ? isCanteenDisabled(activeCanteenObj) : { disabled: true, note: '' };
    const cantOrder =
        selectedDates.length === 0 ||
        !selectedShift ||
        isOrdering ||
        (canteens.length > 0 && (!selectedCanteen || canteenValidation.disabled));

    if (isLoading) {
        return (
            <div className="max-w-[1240px] space-y-4">
                <SkeletonCard lines={3} />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                        <SkeletonCard lines={4} />
                        <SkeletonCard lines={4} />
                    </div>
                    <SkeletonCard lines={5} />
                </div>
            </div>
        );
    }

    if (bulkResult) {
        return (
            <div className="max-w-[820px] space-y-5">
                <PageHeader
                    title="Hasil pemesanan"
                    subtitle={`${bulkResult.summary.successCount} berhasil, ${bulkResult.summary.failedCount} gagal`}
                />
                <Card className="space-y-5">
                    {bulkResult.success.length > 0 && (
                        <div>
                            <h2 className="m-0 mb-3 text-[14px] font-bold text-[#15803d] flex items-center gap-2">
                                <Check className="w-4 h-4" aria-hidden="true" /> Berhasil ({bulkResult.success.length})
                            </h2>
                            <div className="space-y-2">
                                {bulkResult.success.map((item) => {
                                    const p = parseDateParts(formatOrderDate(item.date));
                                    return (
                                        <div
                                            key={item.date}
                                            className="flex items-center justify-between px-3.5 py-2.5 rounded-[10px] bg-[#dcfce7] text-[#166534] text-[13.5px]"
                                        >
                                            <span className="font-semibold">
                                                {p.dayName}, {p.formatted}
                                            </span>
                                            <span className="font-bold">{item.order.shift.name}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {bulkResult.failed.length > 0 && (
                        <div>
                            <h2 className="m-0 mb-3 text-[14px] font-bold text-[#b91c1c] flex items-center gap-2">
                                <X className="w-4 h-4" aria-hidden="true" /> Gagal ({bulkResult.failed.length})
                            </h2>
                            <div className="space-y-2">
                                {bulkResult.failed.map((item, idx) => {
                                    const p = parseDateParts(formatOrderDate(item.date));
                                    return (
                                        <div
                                            key={idx}
                                            className="px-3.5 py-2.5 rounded-[10px] bg-[#fee2e2] text-[#991b1b] text-[13.5px]"
                                        >
                                            <div className="font-semibold">
                                                {p.dayName}, {p.formatted}
                                            </div>
                                            <div className="text-[12.5px] mt-0.5">{item.reason}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <Button
                        variant="primary"
                        size="lg"
                        className="w-full"
                        onClick={() => setBulkResult(null)}
                    >
                        Kembali ke Pemesanan
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-[1240px] w-full">
            {/* MOBILE HEADER BANNER (< 768px) — PesanMobile.dc.html */}
            <div className="md:hidden -mx-4 -mt-4 mb-4 bg-[#0f172a] text-[#fff] px-[18px] pt-[18px] pb-[22px]">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[12px] text-[#94a3b8]">{getGreeting()}</div>
                        <div className="text-[18px] font-extrabold">{user?.name}</div>
                    </div>
                    <div className="w-[38px] h-[38px] rounded-full bg-[#f59e0b] text-[#1c1917] flex items-center justify-center font-extrabold text-[14px]">
                        {getInitials(user?.name)}
                    </div>
                </div>

                {todayOrder && (
                    <div className="mt-3.5 bg-[rgba(255,255,255,0.08)] rounded-[12px] px-3.5 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="text-[12px] text-[#94a3b8] truncate">
                                Makan hari ini · {todayOrder.shift.name}
                            </div>
                            <div className="text-[15px] font-bold mt-0.5 truncate">
                                {todayOrder.shift.breakStartTime && todayOrder.shift.breakEndTime
                                    ? `${todayOrder.shift.breakStartTime}–${todayOrder.shift.breakEndTime}`
                                    : `${todayOrder.shift.startTime}–${todayOrder.shift.endTime}`}
                                {todayOrder.canteen ? ` · Kantin ${todayOrder.canteen.name}` : ''}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowQrModal(true)}
                            className="text-[12px] font-bold text-[#1c1917] bg-[#f59e0b] rounded-full px-3 py-[7px] border-0 cursor-pointer whitespace-nowrap"
                        >
                            Lihat QR
                        </button>
                    </div>
                )}
            </div>

            {/* Strike / Blacklist Warning Banner */}
            {user && (user.noShowCount > 0 || user.isBlacklisted) && (
                <div
                    role="alert"
                    className="mb-4 bg-[#fff7ed] border border-[#fed7aa] rounded-[14px] px-[18px] py-4 flex gap-3.5 items-start"
                >
                    <AlertTriangle className="w-[22px] h-[22px] text-[#b45309] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="text-[13.5px] leading-relaxed text-[#1c1917]">
                        {user.isBlacklisted ? (
                            <>
                                <b>Akun sedang dibatasi.</b> Anda tidak dapat memesan untuk tanggal selama masa blokir, namun masih dapat memesan untuk tanggal setelah masa blokir berakhir.
                            </>
                        ) : (
                            <>
                                <b>Peringatan: {user.noShowCount} strike aktif.</b> Pastikan mengambil makanan yang dipesan pada jam istirahat. Akun akan diblokir otomatis setelah mencapai batas strike.
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Desktop Today Order Card */}
            {todayOrder && (
                <Card className="hidden md:block mb-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            {todayOrder.status === 'ORDERED' ? (
                                <div className="bg-[#fff] border border-[#e7e5e4] rounded-[10px] p-2">
                                    <OrderBarcode id="order-barcode-svg" value={todayOrder.qrCode} />
                                </div>
                            ) : (
                                <div className="w-12 h-12 rounded-[12px] bg-[#dcfce7] text-[#166534] flex items-center justify-center">
                                    <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
                                </div>
                            )}
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="m-0 text-[15px] font-bold text-[#1c1917]">
                                        Pesanan hari ini · {todayOrder.shift.name}
                                    </h2>
                                    <Badge variant={todayOrder.status === 'PICKED_UP' ? 'success' : 'info'}>
                                        {todayOrder.status === 'PICKED_UP' ? 'Sudah diambil' : 'Menunggu'}
                                    </Badge>
                                </div>
                                <p className="m-0 mt-1 text-[13px] text-[#78716c]">
                                    Jam kerja {todayOrder.shift.startTime}–{todayOrder.shift.endTime}
                                    {todayOrder.shift.breakStartTime && todayOrder.shift.breakEndTime
                                        ? ` · istirahat ${todayOrder.shift.breakStartTime}–${todayOrder.shift.breakEndTime}`
                                        : ''}
                                    {todayOrder.canteen ? ` · Kantin ${todayOrder.canteen.name}` : ''}
                                </p>
                            </div>
                        </div>

                        {todayOrder.status === 'ORDERED' && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={downloadBarcode}
                                    leftIcon={<Download className="w-4 h-4" aria-hidden="true" />}
                                >
                                    Simpan barcode
                                </Button>
                                {!isCancelLocked(todayOrder) ? (
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={() => {
                                            setCancelReason('');
                                            setShowCancelModal(true);
                                        }}
                                        leftIcon={<XCircle className="w-4 h-4" aria-hidden="true" />}
                                    >
                                        Batalkan
                                    </Button>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 text-[12px] text-[#78716c] bg-[#f5f5f4] rounded-[8px] px-3 py-1.5">
                                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                        Shift sedang berjalan
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {/* Main 2-column layout (Desktop) / Single stream (Mobile) */}
            <div className="flex flex-wrap gap-6 items-start">
                <div className="flex-[999_1_520px] min-w-0 flex flex-col gap-[18px]">
                    <div className="hidden md:block">
                        <PageHeader
                            title="Pesan makanan"
                            subtitle={`Pilih tanggal, shift, dan kantin. Anda bisa memesan hingga ${maxOrderDaysAhead + 1} hari ke depan.`}
                        />
                    </div>

                    {/* Step 1: Date Selection */}
                    <Card className="p-4 md:p-5">
                        <div className="flex items-center justify-between mb-3.5">
                            <h2 className="m-0 text-[15px] font-bold text-[#1c1917]">
                                <span className="text-[#b45309] mr-1">1 ·</span>Pilih tanggal
                            </h2>
                            <div className="flex items-center gap-3.5 text-[13px]">
                                <button
                                    type="button"
                                    onClick={selectAllAvailableDates}
                                    className="border-0 bg-transparent text-[#b45309] font-semibold cursor-pointer p-0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] rounded"
                                >
                                    Pilih semua
                                </button>
                                <button
                                    type="button"
                                    onClick={clearSelection}
                                    className="border-0 bg-transparent text-[#78716c] font-medium cursor-pointer p-0 hover:text-[#1c1917] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] rounded"
                                >
                                    Hapus pilihan
                                </button>
                            </div>
                        </div>

                        {/* Mobile horizontal date swipe (< 768px) */}
                        <div className="flex md:hidden gap-2 overflow-x-auto pb-1">
                            {availableDates.map((d) => {
                                const hasAvail = d.shifts.some((s) => s.canOrder);
                                const blocked = isDateBlacklistedFor(d.date);
                                const disabled = d.hasOrder || !hasAvail || blocked;
                                const on = selectedDates.includes(d.date);
                                const note = on
                                    ? 'Dipilih'
                                    : d.hasOrder
                                        ? 'Dipesan'
                                        : blocked
                                            ? 'Diblokir'
                                            : d.shifts[0]?.holiday
                                                ? 'Libur'
                                                : !hasAvail
                                                    ? 'Lewat'
                                                    : 'Tersedia';

                                return (
                                    <button
                                        key={d.date}
                                        type="button"
                                        disabled={disabled}
                                        aria-pressed={on}
                                        onClick={() => !disabled && toggleDateSelection(d.date)}
                                        className={[
                                            'flex-[0_0_64px] h-[78px] rounded-[12px] flex flex-col items-center justify-center gap-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]',
                                            on
                                                ? 'border-2 border-[#f59e0b] bg-[#fffbeb] text-[#1c1917]'
                                                : disabled
                                                    ? 'border border-[#f0efed] bg-[#fafaf9] text-[#a8a29e] cursor-not-allowed'
                                                    : 'border border-[#e7e5e4] bg-[#fff] text-[#1c1917] cursor-pointer',
                                        ].join(' ')}
                                    >
                                        <span className="text-[11px] font-semibold">{d.dowShort}</span>
                                        <span className="text-[20px] font-extrabold leading-none tabular-nums">
                                            {d.dayNum}
                                        </span>
                                        <span
                                            className={`text-[10px] ${
                                                on
                                                    ? 'text-[#b45309] font-semibold'
                                                    : d.hasOrder
                                                        ? 'text-[#15803d] font-semibold'
                                                        : ''
                                            }`}
                                        >
                                            {note}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Desktop 5-col grid (>= 768px) */}
                        <div className="hidden md:grid md:grid-cols-5 gap-2.5">
                            {availableDates.map((d) => {
                                const hasAvail = d.shifts.some((s) => s.canOrder);
                                const blocked = isDateBlacklistedFor(d.date);
                                const disabled = d.hasOrder || !hasAvail || blocked;
                                const on = selectedDates.includes(d.date);
                                const note = on
                                    ? 'Dipilih'
                                    : d.hasOrder
                                        ? 'Sudah dipesan'
                                        : blocked
                                            ? 'Diblokir'
                                            : d.shifts[0]?.holiday
                                                ? `Libur: ${d.shifts[0].holiday.name}`
                                                : !hasAvail
                                                    ? 'Lewat batas'
                                                    : 'Tersedia';

                                return (
                                    <button
                                        key={d.date}
                                        type="button"
                                        disabled={disabled}
                                        aria-pressed={on}
                                        onClick={() => !disabled && toggleDateSelection(d.date)}
                                        className={[
                                            'flex flex-col items-start gap-0.5 px-3.5 py-3 rounded-[12px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]',
                                            on
                                                ? 'border-2 border-[#f59e0b] bg-[#fffbeb] text-[#1c1917] cursor-pointer'
                                                : disabled
                                                    ? 'border border-[#f0efed] bg-[#fafaf9] text-[#a8a29e] cursor-not-allowed'
                                                    : 'border border-[#e7e5e4] bg-[#fff] text-[#1c1917] hover:border-[#d6d3d1] cursor-pointer',
                                        ].join(' ')}
                                    >
                                        <span
                                            className={`text-[12px] font-semibold ${
                                                disabled ? 'text-[#a8a29e]' : 'text-[#78716c]'
                                            }`}
                                        >
                                            {d.dowShort} {d.isToday ? '· Hari ini' : ''}
                                        </span>
                                        <span className="text-[22px] font-extrabold leading-[1.15] tabular-nums">
                                            {d.dayNum}
                                        </span>
                                        <span
                                            className={`text-[11px] truncate w-full ${
                                                on
                                                    ? 'text-[#b45309] font-semibold'
                                                    : d.hasOrder
                                                        ? 'text-[#15803d] font-semibold'
                                                        : 'text-[#a8a29e]'
                                            }`}
                                        >
                                            {note}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </Card>

                    {/* Step 2: Shift Selection */}
                    <Card className="p-4 md:p-5">
                        <h2 className="m-0 mb-3.5 text-[15px] font-bold text-[#1c1917]">
                            <span className="text-[#b45309] mr-1">2 ·</span>Pilih shift
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {availableShiftsForBulk.map((s) => {
                                const on = selectedShift === s.id;
                                const disabled = !s.canOrder && selectedDates.length === 0;
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        aria-pressed={on}
                                        disabled={disabled}
                                        onClick={() => setSelectedShift(s.id)}
                                        className={[
                                            'flex items-center gap-3 p-3.5 rounded-[12px] text-left transition-colors min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]',
                                            on
                                                ? 'border-2 border-[#f59e0b] bg-[#fffbeb] text-[#1c1917] cursor-pointer'
                                                : disabled
                                                    ? 'border border-[#f0efed] bg-[#fafaf9] text-[#a8a29e] cursor-not-allowed'
                                                    : 'border border-[#e7e5e4] bg-[#fff] text-[#1c1917] hover:border-[#d6d3d1] cursor-pointer',
                                        ].join(' ')}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={`w-4 h-4 rounded-full flex-shrink-0 box-border ${
                                                on
                                                    ? 'border-[5px] border-[#f59e0b] bg-[#fff]'
                                                    : 'border-2 border-[#d6d3d1] bg-transparent'
                                            }`}
                                        />
                                        <span className="flex-1 min-w-0">
                                            <span className="block font-bold text-[14px] truncate">{s.name}</span>
                                            <span className="block text-[12px] text-[#78716c] mt-0.5 tabular-nums">
                                                Kerja {s.startTime}–{s.endTime}
                                                {s.breakStartTime && s.breakEndTime
                                                    ? ` · istirahat ${s.breakStartTime}–${s.breakEndTime}`
                                                    : ''}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </Card>

                    {/* Step 3: Canteen Selection */}
                    {canteens.length > 0 && (
                        <Card className="p-4 md:p-5">
                            <h2 className="m-0 mb-3.5 text-[15px] font-bold text-[#1c1917]">
                                <span className="text-[#b45309] mr-1">3 ·</span>Pilih kantin
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {canteens.map((c) => {
                                    const { disabled, note } = isCanteenDisabled(c);
                                    const on = selectedCanteen === c.id && !disabled;
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            disabled={disabled}
                                            aria-pressed={on}
                                            onClick={() => !disabled && setSelectedCanteen(c.id)}
                                            className={[
                                                'flex flex-col items-start gap-0.5 p-3.5 rounded-[12px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]',
                                                on
                                                    ? 'border-2 border-[#f59e0b] bg-[#fffbeb] text-[#1c1917] cursor-pointer'
                                                    : disabled
                                                        ? 'border border-[#f0efed] bg-[#fafaf9] text-[#a8a29e] cursor-not-allowed'
                                                        : 'border border-[#e7e5e4] bg-[#fff] text-[#1c1917] hover:border-[#d6d3d1] cursor-pointer',
                                            ].join(' ')}
                                        >
                                            <span className="font-bold text-[14px] flex items-center gap-1.5">
                                                {disabled && user?.preferredCanteenId && user.preferredCanteenId !== c.id && (
                                                    <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                                                )}
                                                {c.name}
                                            </span>
                                            <span className="text-[12px] text-[#78716c]">{note}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </Card>
                    )}
                </div>

                {/* Desktop Right Summary Card */}
                <aside className="hidden md:flex flex-[1_1_300px] max-w-[360px] w-full bg-[#fff] border border-[#e7e5e4] rounded-[14px] p-5 flex-col gap-3.5 sticky top-20">
                    <h2 className="m-0 text-[15px] font-bold text-[#1c1917]">Ringkasan pesanan</h2>
                    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 text-[13px]">
                        <dt className="text-[#78716c]">Tanggal</dt>
                        <dd className="m-0 text-right font-semibold text-[#1c1917] tabular-nums">
                            {selectedDates.length ? `${selectedDates.length} hari` : 'Belum dipilih'}
                        </dd>
                        <dt className="text-[#78716c]">Shift</dt>
                        <dd className="m-0 text-right font-semibold text-[#1c1917]">
                            {activeShiftObj?.name || 'Belum dipilih'}
                        </dd>
                        <dt className="text-[#78716c]">Kantin</dt>
                        <dd className="m-0 text-right font-semibold text-[#1c1917]">
                            {activeCanteenObj?.name || 'Belum dipilih'}
                        </dd>
                    </dl>

                    {selectedDates.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {selectedDates.map((d) => (
                                <span
                                    key={d}
                                    className="inline-block text-[12px] font-semibold bg-[#fef3c7] text-[#92400e] rounded-full px-2.5 py-1"
                                >
                                    {parseDateParts(d).chipLabel}
                                </span>
                            ))}
                        </div>
                    )}

                    <Button
                        variant="primary"
                        size="lg"
                        className="w-full"
                        disabled={cantOrder}
                        loading={isOrdering}
                        loadingText="Memproses…"
                        onClick={handleBulkOrder}
                    >
                        {selectedDates.length === 0
                            ? 'Pilih tanggal dulu'
                            : `Pesan ${selectedDates.length} hari`}
                    </Button>

                    <p className="m-0 text-[12px] text-[#78716c] leading-relaxed">
                        Tidak mengambil makanan yang dipesan dihitung sebagai pelanggaran. Batalkan paling lambat sebelum batas waktu shift.
                    </p>
                </aside>
            </div>

            {/* Mobile Fixed CTA Bar above bottom nav */}
            <div className="md:hidden mt-4 -mx-4 px-4 py-3 bg-[#fff] border-t border-[#e7e5e4]">
                <Button
                    variant="primary"
                    size="lg"
                    className="w-full h-[50px]"
                    disabled={cantOrder}
                    loading={isOrdering}
                    loadingText="Memproses…"
                    onClick={handleBulkOrder}
                >
                    {selectedDates.length > 0
                        ? `Pesan ${selectedDates.length} hari · ${activeShiftObj?.name || ''}`
                        : 'Pilih tanggal dulu'}
                </Button>
            </div>

            {/* Mobile QR / Today's Order Modal */}
            <Modal
                open={showQrModal && !!todayOrder}
                onClose={() => setShowQrModal(false)}
                title="Barcode pesanan hari ini"
                description={todayOrder ? `${todayOrder.shift.name} · ${todayOrder.shift.startTime}–${todayOrder.shift.endTime}` : undefined}
                size="sm"
            >
                {todayOrder && (
                    <div className="space-y-4 text-center">
                        <div className="flex justify-center">
                            <Badge variant={todayOrder.status === 'PICKED_UP' ? 'success' : 'info'}>
                                {todayOrder.status === 'PICKED_UP' ? 'Sudah diambil' : 'Menunggu pengambilan'}
                            </Badge>
                        </div>
                        {todayOrder.status === 'ORDERED' ? (
                            <div className="bg-[#fff] border border-[#e7e5e4] rounded-[12px] p-3">
                                <OrderBarcode id="order-barcode-svg" value={todayOrder.qrCode} />
                            </div>
                        ) : (
                            <div className="py-4 text-[#15803d] flex flex-col items-center gap-2">
                                <QrCode className="w-10 h-10" aria-hidden="true" />
                                <p className="m-0 text-[13px] text-[#78716c]">Makanan sudah diambil hari ini.</p>
                            </div>
                        )}
                        {todayOrder.status === 'ORDERED' && (
                            <div className="flex gap-2">
                                <Button variant="secondary" className="flex-1" onClick={downloadBarcode}>
                                    Simpan barcode
                                </Button>
                                {!isCancelLocked(todayOrder) && (
                                    <Button
                                        variant="danger"
                                        className="flex-1"
                                        onClick={() => {
                                            setShowQrModal(false);
                                            setCancelReason('');
                                            setShowCancelModal(true);
                                        }}
                                    >
                                        Batalkan
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Cancel Modal */}
            <Modal
                open={showCancelModal}
                onClose={() => setShowCancelModal(false)}
                title="Batalkan pesanan"
                description="Masukkan alasan pembatalan pesanan hari ini"
                size="sm"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setShowCancelModal(false)}
                            disabled={isCancelling}
                        >
                            Tutup
                        </Button>
                        <Button
                            variant="danger"
                            loading={isCancelling}
                            loadingText="Membatalkan…"
                            disabled={!cancelReason.trim()}
                            onClick={handleCancel}
                        >
                            Batalkan pesanan
                        </Button>
                    </>
                }
            >
                <Textarea
                    label="Alasan pembatalan"
                    required
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Contoh: Ada rapat mendadak di luar kantor"
                    hint="Alasan ini dicatat dan dapat dilihat oleh admin."
                />
            </Modal>
        </div>
    );
}
