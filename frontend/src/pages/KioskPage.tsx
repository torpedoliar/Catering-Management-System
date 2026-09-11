import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, api } from '../contexts/AuthContext';
import ForcePasswordChange from '../components/ForcePasswordChange';
import { getLocalDateString, addDays } from '../utils/dateHelpers';
import { handleApiError, showSuccess } from '../utils/errorHandler';
import toast from 'react-hot-toast';
import {
    UtensilsCrossed,
    User,
    Lock,
    Loader2,
    LogOut,
    CheckCircle2,
    Clock,
    MapPin,
    Calendar,
    ZoomIn,
    X,
    Eye,
    EyeOff,
    Sparkles,
    CheckSquare,
    Square,
    AlertCircle,
    Trash2,
    ShieldAlert,
    Info,
    CalendarCheck,
} from 'lucide-react';

// Kiosk mode — shared PC in the canteen for ordering meals.
// Features:
// - Left: Menu catalog ALWAYS visible (both pre-login and post-login).
// - Multi-day menu browsing (today, tomorrow, and upcoming days).
// - Click any menu card/image to view enlarged photo and details modal.
// - Right:
//   - Pre-login: ID & Password login form.
//   - Post-login:
//     * Today is EXCLUDED from ordering (past cutoff). An info badge shows today's order status if any.
//     * Order section ONLY allows ordering for upcoming days (Besok, Lusa, dst.).
//     * Canteen location is STRICTLY LOCKED based on user account's preferredCanteenId.
//     * Cancel Order feature: User can cancel active upcoming/today orders directly from kiosk.
//     * Session end: Instant transition back to clean login without page refresh (F5).
// - Forced password change supported in-kiosk.
// - Anti-abandon: 60s idle (15s countdown) auto-logout.

const IDLE_TIMEOUT_MS = 60_000;
const COUNTDOWN_SECONDS = 15;

interface MenuItemInfo {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    category: string | null;
    vendor: { id: string; name: string; logoUrl: string | null } | null;
}

interface DayMenu {
    id: string;
    menuMode: string;
    shiftId: string | null;
    shiftName: string | null;
    notes: string | null;
    menuItem: MenuItemInfo;
}

interface DayMenuResponse {
    date: string;
    dayName: string;
    menus: DayMenu[];
}

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    canOrder: boolean;
    cutoffTime: string;
    minutesUntilCutoff: number;
}

interface Canteen {
    id: string;
    name: string;
    location: string | null;
}

interface ExistingOrder {
    id: string;
    orderDate: string;
    status: string;
    qrCode: string;
    shift: {
        id: string;
        name: string;
        startTime: string;
        endTime: string;
    };
    canteen?: {
        id: string;
        name: string;
        location?: string | null;
    } | null;
}

export default function KioskPage() {
    const { user, login, logout, refreshUser } = useAuth();

    // --- Upcoming Menus & Date Selection ---
    const [upcomingDays, setUpcomingDays] = useState<DayMenuResponse[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
    const [menusLoading, setMenusLoading] = useState(true);

    // --- Image Preview Modal ---
    const [previewMenu, setPreviewMenu] = useState<DayMenu | null>(null);

    // --- Login Form States ---
    const [externalId, setExternalId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);

    // --- User Existing Orders (Duplicate Prevention & Cancellation) ---
    const [existingOrders, setExistingOrders] = useState<Record<string, ExistingOrder>>({});
    const [ordersLoading, setOrdersLoading] = useState(false);

    // --- Cancel Modal States ---
    const [cancelModalOrder, setCancelModalOrder] = useState<ExistingOrder | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);

    // --- Multi-Date Order Selection (Tomorrow & Future Only) ---
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [selectedShift, setSelectedShift] = useState('');
    const [canteens, setCanteens] = useState<Canteen[]>([]);
    const [shiftsLoading, setShiftsLoading] = useState(false);
    const [isOrdering, setIsOrdering] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(false);

    // --- Idle Timeout States ---
    const [countdown, setCountdown] = useState<number | null>(null);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const apiUrl = (import.meta as any).env?.VITE_API_URL || '';
    const todayKey = getLocalDateString();
    const tomorrowKey = addDays(todayKey, 1);

    // Load upcoming menus (public endpoint — no auth required)
    const loadMenus = useCallback(async () => {
        setMenusLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/weekly-menu/upcoming`).then(r => r.json());
            if (res && Array.isArray(res.days) && res.days.length > 0) {
                setUpcomingDays(res.days);
                const today = getLocalDateString();
                const exists = res.days.some((d: DayMenuResponse) => d.date === selectedDate);
                if (!exists) {
                    setSelectedDate(res.days[0]?.date || today);
                }
            } else {
                const todayRes = await fetch(`${apiUrl}/api/weekly-menu/today`).then(r => r.json());
                if (todayRes?.date) {
                    setUpcomingDays([todayRes]);
                    setSelectedDate(todayRes.date);
                }
            }
        } catch {
            // Best effort
        } finally {
            setMenusLoading(false);
        }
    }, [apiUrl, selectedDate]);

    useEffect(() => {
        loadMenus();
    }, [loadMenus]);

    // Load user's active orders to prevent double ordering and allow cancellation
    const loadUserOrders = useCallback(async () => {
        if (!user || user.mustChangePassword) return;
        setOrdersLoading(true);
        try {
            const today = getLocalDateString();
            const futureEnd = addDays(today, 14);
            const res = await api.get('/api/orders/my-orders', {
                params: {
                    startDate: today,
                    endDate: futureEnd,
                    limit: 50,
                },
            });

            const map: Record<string, ExistingOrder> = {};
            if (res.data?.orders && Array.isArray(res.data.orders)) {
                res.data.orders.forEach((o: any) => {
                    if (o.status !== 'CANCELLED') {
                        const key = o.orderDate.slice(0, 10);
                        map[key] = o;
                    }
                });
            }
            setExistingOrders(map);

            // Default selection: tomorrow if available and not yet ordered
            setSelectedDates(prev => {
                const filtered = prev.filter(d => !map[d] && d > today);
                if (filtered.length > 0) return filtered;
                const tmr = addDays(today, 1);
                if (!map[tmr]) return [tmr];
                return [];
            });
        } catch (error) {
            console.error('Failed to load user orders:', error);
        } finally {
            setOrdersLoading(false);
        }
    }, [user]);

    // Load shifts and canteens
    const loadShiftsAndCanteens = useCallback(async () => {
        if (!user || user.mustChangePassword) return;
        setShiftsLoading(true);
        try {
            const targetDate = selectedDates[0] || tomorrowKey;
            const [shiftsRes, canteensRes] = await Promise.all([
                api.get(`/api/shifts/for-user?date=${targetDate}`),
                api.get('/api/canteens'),
            ]);

            const loadedShifts: Shift[] = shiftsRes.data.shifts || [];
            setShifts(loadedShifts);

            // Auto-select first orderable shift if none is selected
            if (!loadedShifts.some(s => s.id === selectedShift && s.canOrder)) {
                const firstAvailable = loadedShifts.find(s => s.canOrder);
                setSelectedShift(firstAvailable?.id || '');
            }

            const list: Canteen[] = canteensRes.data.canteens || [];
            setCanteens(list);
        } catch (error: any) {
            handleApiError(error);
        } finally {
            setShiftsLoading(false);
        }
    }, [user, selectedDates, tomorrowKey, selectedShift]);

    useEffect(() => {
        if (user && !user.mustChangePassword) {
            void loadUserOrders();
        }
    }, [user, loadUserOrders]);

    useEffect(() => {
        if (user && !user.mustChangePassword) {
            void loadShiftsAndCanteens();
        }
    }, [user, loadShiftsAndCanteens]);

    // Determine the locked canteen for this user based on account preference
    const userPreferredCanteen = canteens.find(c => c.id === user?.preferredCanteenId) || canteens[0] || null;
    const lockedCanteenId = user?.preferredCanteenId || userPreferredCanteen?.id || null;

    // Toggle a future date selection for ordering
    const toggleDate = (dateKey: string) => {
        if (dateKey <= todayKey) {
            toast.error('Pemesanan untuk hari ini sudah ditutup (cutoff)');
            return;
        }
        if (existingOrders[dateKey]) {
            toast.error(`Anda sudah memesan untuk tanggal ${dateKey}`);
            return;
        }
        setSelectedDates(prev =>
            prev.includes(dateKey)
                ? prev.filter(d => d !== dateKey)
                : [...prev, dateKey].sort()
        );
    };

    // Quick select all future un-ordered days
    const selectAllAvailable = () => {
        const available = upcomingDays
            .map(d => d.date)
            .filter(d => d > todayKey && !existingOrders[d]);
        if (available.length === 0) {
            toast('Semua tanggal mendatang sudah dipesan!');
            return;
        }
        setSelectedDates(available);
    };

    const clearSelections = () => {
        setSelectedDates([]);
    };

    // Handle Login
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!externalId || !password) {
            toast.error('Mohon isi ID karyawan dan password');
            return;
        }
        setLoginLoading(true);
        try {
            await login(externalId, password);
            setExternalId('');
            setPassword('');
        } catch (error: any) {
            if (error.response?.status === 401) {
                toast.error('Kredensial salah');
                return;
            }
            if (error.response?.status === 429) {
                toast.error('Terlalu banyak percobaan login. Silakan tunggu beberapa saat.');
                return;
            }
            handleApiError(error);
        } finally {
            setLoginLoading(false);
        }
    };

    // Handle Order Submission for Upcoming Days
    const handleOrder = async () => {
        if (selectedDates.length === 0) {
            toast.error('Pilih minimal satu tanggal yang ingin dipesan');
            return;
        }
        if (!selectedShift) {
            toast.error('Pilih shift terlebih dahulu');
            return;
        }

        // Strict validation: no past or today dates allowed
        const invalidDates = selectedDates.filter(d => d <= todayKey);
        if (invalidDates.length > 0) {
            toast.error('Pemesanan hari ini sudah ditutup. Hanya bisa memesan mulai besok.');
            return;
        }

        // Strict duplicate check before submitting
        const alreadyOrdered = selectedDates.filter(d => existingOrders[d]);
        if (alreadyOrdered.length > 0) {
            toast.error(`Tanggal ${alreadyOrdered.join(', ')} sudah memiliki pesanan aktif!`);
            return;
        }

        setIsOrdering(true);
        try {
            const ordersPayload = selectedDates.map(date => ({
                date,
                shiftId: selectedShift,
            }));

            // Canteen is locked to account preference
            const res = await api.post('/api/orders/bulk', {
                orders: ordersPayload,
                canteenId: lockedCanteenId,
            });

            const summary = res.data?.summary;
            if (summary && summary.successCount > 0) {
                showSuccess(`Berhasil membuat pesanan untuk ${summary.successCount} hari!`);
                setOrderSuccess(true);
                void loadUserOrders();
                // Auto logout after 2.5s (transitions smoothly without browser reload)
                setTimeout(() => { void finishSession(); }, 2500);
            } else if (summary && summary.failedCount > 0) {
                const firstReason = res.data?.failed?.[0]?.reason || 'Gagal membuat pesanan';
                toast.error(firstReason);
            } else {
                toast.error('Gagal membuat pesanan');
            }
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal membuat pesanan');
        } finally {
            setIsOrdering(false);
        }
    };

    // Handle Order Cancellation
    const handleCancelOrder = async () => {
        if (!cancelModalOrder) return;
        setIsCancelling(true);
        try {
            await api.post(`/api/orders/${cancelModalOrder.id}/cancel`, {
                reason: 'Dibatalkan melalui Kiosk',
            });
            showSuccess(`Pesanan untuk ${cancelModalOrder.orderDate.slice(0, 10)} berhasil dibatalkan`);
            setCancelModalOrder(null);
            await loadUserOrders();
        } catch (error: any) {
            toast.error(error.response?.data?.error || error.response?.data?.message || 'Gagal membatalkan pesanan');
        } finally {
            setIsCancelling(false);
        }
    };

    // Instant session finish & clean reset without page reload (F5)
    const finishSession = useCallback(async () => {
        clearIdleTimers();
        setCountdown(null);
        setSelectedDates([]);
        setSelectedShift('');
        setExistingOrders({});
        setOrderSuccess(false);
        setPassword('');
        setExternalId('');
        setPreviewMenu(null);
        setCancelModalOrder(null);

        try {
            await logout();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            void loadMenus();
        }
    }, [logout, loadMenus]);

    // Idle Timers Management
    const clearIdleTimers = () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        idleTimerRef.current = null;
        countdownTimerRef.current = null;
    };

    const armIdleTimer = useCallback(() => {
        if (!user) return;
        clearIdleTimers();
        setCountdown(null);
        idleTimerRef.current = setTimeout(() => {
            let remaining = COUNTDOWN_SECONDS;
            setCountdown(remaining);
            countdownTimerRef.current = setInterval(() => {
                remaining -= 1;
                if (remaining <= 0) {
                    void finishSession();
                } else {
                    setCountdown(remaining);
                }
            }, 1000);
        }, IDLE_TIMEOUT_MS);
    }, [user, finishSession]);

    useEffect(() => {
        if (user) {
            armIdleTimer();
            const reset = () => {
                if (countdownTimerRef.current) return;
                armIdleTimer();
            };
            window.addEventListener('pointerdown', reset);
            window.addEventListener('keydown', reset);
            return () => {
                clearIdleTimers();
                window.removeEventListener('pointerdown', reset);
                window.removeEventListener('keydown', reset);
            };
        }
    }, [user, armIdleTimer]);

    // Date formatting helpers
    const getDateTabLabel = (d: DayMenuResponse) => {
        if (d.date === todayKey) return 'Hari Ini';
        if (d.date === tomorrowKey) return 'Besok';
        return d.dayName;
    };

    const getDateSubLabel = (dateStr: string) => {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
            const dayNum = parseInt(parts[2], 10);
            const monthName = months[parseInt(parts[1], 10) - 1];
            return `${dayNum} ${monthName}`;
        }
        return dateStr;
    };

    // Find the currently viewed day's menu on the left
    const activeDayData = upcomingDays.find(d => d.date === selectedDate) || upcomingDays[0] || null;

    // Filter upcoming days list for ordering (ONLY FUTURE DAYS: date > todayKey)
    const futureUpcomingDays = upcomingDays.filter(d => d.date > todayKey);

    // Check user's active orders list (for display & cancellation)
    const activeOrdersList = Object.values(existingOrders).filter(o => o.status === 'ORDERED');
    const todayOrder = existingOrders[todayKey];

    // Idle countdown overlay
    const countdownOverlay = countdown !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl border border-slate-100">
                <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-8 h-8 text-amber-600 animate-pulse" />
                </div>
                <h2 className="text-2xl font-bold mb-2 text-slate-800">Masih di sana?</h2>
                <p className="text-slate-500 mb-6">
                    Sesi akan ditutup otomatis dalam{' '}
                    <span className="font-bold text-amber-600 text-lg">{countdown} detik</span> demi keamanan akun Anda.
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={() => armIdleTimer()}
                        className="btn-primary flex-1 py-3 text-base shadow-lg shadow-orange-500/20"
                    >
                        Saya Masih Di Sini
                    </button>
                    <button
                        onClick={() => void finishSession()}
                        className="btn-secondary flex-1 py-3 text-base"
                    >
                        Selesai
                    </button>
                </div>
            </div>
        </div>
    );

    // Modal Cancel Order Confirmation
    const cancelConfirmationModal = cancelModalOrder && (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setCancelModalOrder(null)}
        >
            <div
                className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 text-center"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                    <ShieldAlert className="w-7 h-7" />
                </div>

                <h3 className="text-xl font-extrabold text-slate-900 mb-2">
                    Batalkan Pesanan?
                </h3>

                <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                    Apakah Anda yakin ingin membatalkan pesanan untuk tanggal{' '}
                    <strong>{cancelModalOrder.orderDate.slice(0, 10)}</strong>?
                </p>

                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 text-left text-xs space-y-1 mb-6">
                    <div className="flex justify-between">
                        <span className="text-slate-500">Shift:</span>
                        <span className="font-bold text-slate-800">{cancelModalOrder.shift?.name}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500">Jam Shift:</span>
                        <span className="text-slate-700">{cancelModalOrder.shift?.startTime} – {cancelModalOrder.shift?.endTime}</span>
                    </div>
                    {cancelModalOrder.canteen && (
                        <div className="flex justify-between">
                            <span className="text-slate-500">Kantin:</span>
                            <span className="text-slate-700">{cancelModalOrder.canteen.name}</span>
                        </div>
                    )}
                </div>

                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={() => setCancelModalOrder(null)}
                        disabled={isCancelling}
                        className="btn-secondary flex-1 py-3 text-sm font-semibold"
                    >
                        Kembali
                    </button>
                    <button
                        type="button"
                        onClick={handleCancelOrder}
                        disabled={isCancelling}
                        className="bg-red-600 hover:bg-red-700 text-white rounded-xl flex-1 py-3 text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
                    >
                        {isCancelling ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Membatalkan...</span>
                            </>
                        ) : (
                            'Ya, Batalkan'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );

    // Modal Image Preview
    const imagePreviewModal = previewMenu && (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setPreviewMenu(null)}
        >
            <div
                className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="relative bg-slate-950 max-h-[380px] flex items-center justify-center overflow-hidden">
                    {previewMenu.menuItem.imageUrl ? (
                        <img
                            src={previewMenu.menuItem.imageUrl}
                            alt={previewMenu.menuItem.name}
                            className="w-full h-full max-h-[380px] object-cover"
                        />
                    ) : (
                        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                            <UtensilsCrossed className="w-16 h-16 mb-2 opacity-50 text-amber-400" />
                            <span className="text-sm font-medium">Foto menu tidak tersedia</span>
                        </div>
                    )}
                    <button
                        onClick={() => setPreviewMenu(null)}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition shadow-lg"
                        title="Tutup"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    <h3 className="text-2xl font-extrabold text-slate-900 leading-tight mb-2">
                        {previewMenu.menuItem.name}
                    </h3>

                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        {previewMenu.shiftName && (
                            <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">
                                {previewMenu.shiftName}
                            </span>
                        )}
                        {previewMenu.menuItem.category && (
                            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                                {previewMenu.menuItem.category}
                            </span>
                        )}
                        {previewMenu.menuItem.vendor && (
                            <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold">
                                Vendor: {previewMenu.menuItem.vendor.name}
                            </span>
                        )}
                    </div>

                    {previewMenu.menuItem.description ? (
                        <p className="text-slate-600 text-sm leading-relaxed mb-4">
                            {previewMenu.menuItem.description}
                        </p>
                    ) : (
                        <p className="text-slate-400 text-sm italic mb-4">Tidak ada deskripsi tambahan.</p>
                    )}

                    {previewMenu.notes && (
                        <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-xs text-amber-900 mb-4">
                            <span className="font-semibold">Catatan Katering: </span>
                            {previewMenu.notes}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        {user && previewMenu.shiftId && (
                            <button
                                onClick={() => {
                                    setSelectedShift(previewMenu.shiftId!);
                                    setPreviewMenu(null);
                                    toast.success(`Shift ${previewMenu.shiftName || ''} dipilih!`);
                                }}
                                className="btn-primary flex-1 py-3 text-sm font-semibold"
                            >
                                Pilih Shift Ini
                            </button>
                        )}
                        <button
                            onClick={() => setPreviewMenu(null)}
                            className="btn-secondary flex-1 py-3 text-sm font-semibold"
                        >
                            Tutup
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: 'var(--color-bg-secondary)' }}>
            {countdownOverlay}
            {cancelConfirmationModal}
            {imagePreviewModal}

            {/* =====================================================================
                LEFT COLUMN: MENU DISPLAY (ALWAYS VISIBLE PRE-LOGIN & POST-LOGIN)
               ===================================================================== */}
            <div className="flex-1 p-4 md:p-6 lg:p-8 flex flex-col overflow-y-auto">
                {/* Header Branding */}
                <div className="flex items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3.5">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-md shadow-amber-500/20 flex-shrink-0">
                            <UtensilsCrossed className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                                    Kiosk Pemesanan Makan
                                </h1>
                                <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                                    Kantin
                                </span>
                            </div>
                            <p className="text-sm text-slate-500">
                                Lihat menu makanan harian katering & jadwal shift
                            </p>
                        </div>
                    </div>
                </div>

                {/* Date Selection Bar (Horizontal Scrollable Tabs) */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300">
                        {upcomingDays.length > 0 ? (
                            upcomingDays.map((dayData) => {
                                const isSelected = dayData.date === selectedDate;
                                const isToday = dayData.date === todayKey;
                                const hasOrder = !!existingOrders[dayData.date];
                                const count = dayData.menus.length;

                                return (
                                    <button
                                        key={dayData.date}
                                        onClick={() => setSelectedDate(dayData.date)}
                                        className={`flex-shrink-0 px-4 py-2.5 rounded-2xl border text-left transition-all duration-200 ${
                                            isSelected
                                                ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/25 scale-[1.02]'
                                                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-bold text-sm">
                                                {getDateTabLabel(dayData)}
                                            </span>
                                            {isToday && (
                                                <span
                                                    className={`w-1.5 h-1.5 rounded-full ${
                                                        isSelected ? 'bg-white' : 'bg-orange-500'
                                                    }`}
                                                />
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between gap-3 mt-0.5">
                                            <span
                                                className={`text-xs ${
                                                    isSelected ? 'text-white/80' : 'text-slate-400'
                                                }`}
                                            >
                                                {getDateSubLabel(dayData.date)}
                                            </span>
                                            {hasOrder ? (
                                                <span
                                                    className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                                                        isSelected
                                                            ? 'bg-emerald-400 text-slate-900'
                                                            : 'bg-emerald-100 text-emerald-700'
                                                    }`}
                                                >
                                                    ✓ Dipesan
                                                </span>
                                            ) : (
                                                <span
                                                    className={`text-[11px] px-1.5 py-0.2 rounded-md font-semibold ${
                                                        isSelected
                                                            ? 'bg-white/20 text-white'
                                                            : count > 0
                                                            ? 'bg-orange-50 text-orange-600'
                                                            : 'bg-slate-100 text-slate-400'
                                                    }`}
                                                >
                                                    {count > 0 ? `${count} Menu` : 'Kosong'}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSelectedDate(todayKey)}
                                    className="px-4 py-2.5 rounded-2xl bg-orange-500 text-white font-bold text-sm"
                                >
                                    Hari Ini
                                </button>
                                <button
                                    onClick={() => setSelectedDate(tomorrowKey)}
                                    className="px-4 py-2.5 rounded-2xl bg-white border border-slate-200 font-bold text-sm text-slate-700"
                                >
                                    Besok
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Menu Catalog Grid */}
                <div className="flex-1">
                    {menusLoading ? (
                        <div className="flex flex-col items-center justify-center py-24">
                            <Loader2 className="w-10 h-10 animate-spin text-orange-500 mb-3" />
                            <p className="text-slate-500 text-sm font-medium">Memuat menu makanan...</p>
                        </div>
                    ) : !activeDayData || activeDayData.menus.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center my-6">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                                <Calendar className="w-7 h-7" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">
                                Belum ada menu dibagikan
                            </h3>
                            <p className="text-sm text-slate-400 max-w-sm mx-auto">
                                Menu untuk tanggal{' '}
                                <span className="font-semibold text-slate-600">
                                    {selectedDate} ({activeDayData?.dayName || ''})
                                </span>{' '}
                                belum diatur oleh admin katering.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pb-6">
                            {activeDayData.menus.map((m) => (
                                <div
                                    key={m.id}
                                    onClick={() => setPreviewMenu(m)}
                                    className="group bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:border-orange-300 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                                >
                                    <div>
                                        {/* Image Box */}
                                        <div className="relative w-full h-44 bg-slate-100 overflow-hidden">
                                            {m.menuItem.imageUrl ? (
                                                <img
                                                    src={m.menuItem.imageUrl}
                                                    alt={m.menuItem.name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                                                    <UtensilsCrossed className="w-10 h-10 mb-1" />
                                                    <span className="text-xs font-medium">Tanpa Foto</span>
                                                </div>
                                            )}

                                            {/* Hover Zoom Hint */}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-bold backdrop-blur-[2px]">
                                                <ZoomIn className="w-4 h-4" />
                                                <span>Klik untuk perbesar</span>
                                            </div>

                                            {/* Shift Tag */}
                                            {m.shiftName && (
                                                <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/95 backdrop-blur-md shadow-sm text-xs font-bold text-orange-600">
                                                    {m.shiftName}
                                                </div>
                                            )}
                                        </div>

                                        {/* Content Box */}
                                        <div className="p-4">
                                            <h4 className="font-bold text-base text-slate-900 line-clamp-1 group-hover:text-orange-600 transition-colors">
                                                {m.menuItem.name}
                                            </h4>

                                            {m.menuItem.description && (
                                                <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                                                    {m.menuItem.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Footer Info */}
                                    <div className="px-4 pb-4 pt-1 flex items-center justify-between border-t border-slate-100 text-[11px] text-slate-500">
                                        <span className="font-medium truncate max-w-[150px]">
                                            {m.menuItem.vendor?.name || 'Katering'}
                                        </span>
                                        {m.menuItem.category && (
                                            <span className="text-slate-400 truncate">
                                                {m.menuItem.category}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* =====================================================================
                RIGHT COLUMN: LOGIN PANEL (PRE-LOGIN) OR ORDER FORM (POST-LOGIN)
               ===================================================================== */}
            <div
                className="w-full lg:w-[450px] xl:w-[490px] p-4 md:p-6 lg:p-8 lg:border-l bg-white/70 lg:bg-white flex flex-col justify-between overflow-y-auto"
                style={{ borderColor: 'var(--color-border)' }}
            >
                {/* CASE 1: FORCED PASSWORD CHANGE */}
                {user && user.mustChangePassword ? (
                    <div className="my-auto">
                        <ForcePasswordChange onPasswordChanged={refreshUser} />
                    </div>
                ) : user ? (
                    /* CASE 2: LOGGED IN — MULTI-DATE ORDER & CANCEL PANEL */
                    <div className="flex flex-col h-full justify-between">
                        <div>
                            {/* User Greeting & Logout Header */}
                            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-lg shadow-sm">
                                        {user.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 className="font-extrabold text-base text-slate-900 leading-tight">
                                            {user.name}
                                        </h2>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            {user.company || 'Karyawan'} • ID: {user.externalId}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => void finishSession()}
                                    className="btn-secondary text-xs font-semibold py-2 px-3 flex items-center gap-1.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
                                    title="Selesai dan keluar dari sesi kiosk"
                                >
                                    <LogOut className="w-3.5 h-3.5" />
                                    <span>Selesai</span>
                                </button>
                            </div>

                            {/* SUCCESS SCREEN OVERLAY */}
                            {orderSuccess ? (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-8 text-center my-6 animate-in zoom-in-95 duration-200">
                                    <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
                                        <CheckCircle2 className="w-10 h-10" />
                                    </div>
                                    <h3 className="text-2xl font-black text-emerald-900 mb-2">
                                        Pesanan Berhasil!
                                    </h3>
                                    <p className="text-sm text-emerald-700 leading-relaxed mb-6">
                                        Pesanan makan Anda untuk tanggal yang dipilih telah tersimpan.
                                        QR Code check-in dapat dilihat di aplikasi HP Anda.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => void finishSession()}
                                        className="btn-primary w-full py-3 rounded-xl text-sm font-bold shadow-md shadow-orange-500/20"
                                    >
                                        Selesai / Keluar Sekarang
                                    </button>
                                </div>
                            ) : ordersLoading ? (
                                <div className="py-20 flex flex-col items-center justify-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-orange-500 mb-2" />
                                    <p className="text-xs text-slate-400 font-medium">Memeriksa status pesanan Anda...</p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {/* -------------------------------------------------
                                        SECTION 1: STATUS PESANAN HARI INI (INFO & CANCEL ONLY)
                                       ------------------------------------------------- */}
                                    {todayOrder ? (
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                                                    <CalendarCheck className="w-4 h-4 text-emerald-600" />
                                                    <span>Pesanan Makan Hari Ini</span>
                                                </div>
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 text-[10px] font-extrabold">
                                                    {todayOrder.shift?.name}
                                                </span>
                                            </div>
                                            <p className="text-xs text-emerald-700 leading-relaxed">
                                                Jam: {todayOrder.shift?.startTime} – {todayOrder.shift?.endTime} • {todayOrder.canteen?.name || 'Kantin Utama'}
                                            </p>
                                            <div className="mt-3 pt-2.5 border-t border-emerald-200 flex items-center justify-between">
                                                <span className="text-[11px] text-emerald-600 italic">
                                                    QR Code tersimpan di HP Anda
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setCancelModalOrder(todayOrder)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold transition"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                    <span>Batal Pesanan</span>
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-500 flex items-center gap-2">
                                            <Info className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                            <span>Pemesanan hari ini telah melewati cutoff. Silakan pesan untuk hari-hari berikutnya.</span>
                                        </div>
                                    )}

                                    {/* -------------------------------------------------
                                        SECTION 2: DAFTAR PESANAN AKTIF MENDATANG (CANCEL MODE)
                                       ------------------------------------------------- */}
                                    {activeOrdersList.filter(o => o.orderDate.slice(0, 10) > todayKey).length > 0 && (
                                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-bold text-xs text-amber-900 uppercase tracking-wider">
                                                    Pesanan Mendatang Anda
                                                </span>
                                                <span className="text-[11px] font-semibold text-amber-700">
                                                    {activeOrdersList.filter(o => o.orderDate.slice(0, 10) > todayKey).length} Hari
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                {activeOrdersList
                                                    .filter(o => o.orderDate.slice(0, 10) > todayKey)
                                                    .map(order => (
                                                        <div
                                                            key={order.id}
                                                            className="bg-white rounded-xl p-2.5 border border-amber-200/60 flex items-center justify-between shadow-2xs"
                                                        >
                                                            <div>
                                                                <div className="font-bold text-xs text-slate-800">
                                                                    {getDateSubLabel(order.orderDate.slice(0, 10))}
                                                                </div>
                                                                <div className="text-[11px] text-slate-500">
                                                                    {order.shift?.name} ({order.shift?.startTime} – {order.shift?.endTime})
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setCancelModalOrder(order)}
                                                                className="px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 text-[11px] font-bold border border-red-200 transition"
                                                            >
                                                                Batalkan
                                                            </button>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* -------------------------------------------------
                                        SECTION 3: PESAN BEBERAPA HARI KEDEPAN (STARTING TOMORROW)
                                       ------------------------------------------------- */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                    Pesan Makanan (Mulai Besok)
                                                </label>
                                                <p className="text-[11px] text-slate-400">
                                                    Pilih hari yang ingin dipesan (bisa beberapa hari sekaligus):
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={selectAllAvailable}
                                                    className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 underline px-1"
                                                >
                                                    Pilih Semua
                                                </button>
                                                <span className="text-slate-300">•</span>
                                                <button
                                                    type="button"
                                                    onClick={clearSelections}
                                                    className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 underline px-1"
                                                >
                                                    Hapus
                                                </button>
                                            </div>
                                        </div>

                                        {futureUpcomingDays.length === 0 ? (
                                            <div className="bg-slate-50 rounded-2xl p-4 text-center text-xs text-slate-400">
                                                Belum ada jadwal hari mendatang yang dibuka.
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                                {futureUpcomingDays.map((dayData) => {
                                                    const dateStr = dayData.date;
                                                    const alreadyHasOrder = !!existingOrders[dateStr];
                                                    const isChecked = selectedDates.includes(dateStr);

                                                    if (alreadyHasOrder) {
                                                        const existing = existingOrders[dateStr];
                                                        return (
                                                            <div
                                                                key={dateStr}
                                                                className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 text-emerald-800 text-left flex items-center justify-between opacity-85"
                                                            >
                                                                <div>
                                                                    <div className="font-bold text-xs">
                                                                        {getDateTabLabel(dayData)}
                                                                    </div>
                                                                    <div className="text-[11px] text-emerald-600">
                                                                        {getDateSubLabel(dateStr)}
                                                                    </div>
                                                                </div>
                                                                <span className="text-[10px] font-extrabold bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-md">
                                                                    ✓ Dipesan ({existing?.shift?.name || ''})
                                                                </span>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <button
                                                            key={dateStr}
                                                            type="button"
                                                            onClick={() => toggleDate(dateStr)}
                                                            className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                                                                isChecked
                                                                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                                                                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {isChecked ? (
                                                                    <CheckSquare className="w-4 h-4 text-white flex-shrink-0" />
                                                                ) : (
                                                                    <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                                                )}
                                                                <div>
                                                                    <div className="font-bold text-xs">
                                                                        {getDateTabLabel(dayData)}
                                                                    </div>
                                                                    <div
                                                                        className={`text-[11px] ${
                                                                            isChecked ? 'text-white/80' : 'text-slate-400'
                                                                        }`}
                                                                    >
                                                                        {getDateSubLabel(dateStr)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <span
                                                                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                                                    isChecked
                                                                        ? 'bg-white/20 text-white'
                                                                        : 'bg-slate-100 text-slate-500'
                                                                }`}
                                                            >
                                                                {dayData.menus.length} Menu
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* -------------------------------------------------
                                        SECTION 4: PILIH SHIFT
                                       ------------------------------------------------- */}
                                    <div className="pt-2 border-t border-slate-100 space-y-4">
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                    Pilih Shift Makan
                                                </label>
                                                {selectedDates.length > 0 && (
                                                    <span className="text-[11px] text-orange-600 font-semibold">
                                                        Untuk {selectedDates.length} hari terpilih
                                                    </span>
                                                )}
                                            </div>

                                            {shiftsLoading ? (
                                                <div className="py-4 text-center text-xs text-slate-400">
                                                    <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-orange-500" />
                                                    Memuat shift...
                                                </div>
                                            ) : shifts.length === 0 ? (
                                                <div className="bg-slate-50 rounded-xl p-3 text-center text-xs text-slate-400">
                                                    Tidak ada shift yang aktif
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {shifts.map((s) => {
                                                        const isSelected = selectedShift === s.id;
                                                        return (
                                                            <button
                                                                key={s.id}
                                                                type="button"
                                                                disabled={!s.canOrder}
                                                                onClick={() => setSelectedShift(s.id)}
                                                                className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                                                                    isSelected
                                                                        ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                                                                        : s.canOrder
                                                                        ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                                                                        : 'bg-slate-50 border-slate-100 text-slate-400 opacity-60 cursor-not-allowed'
                                                                }`}
                                                            >
                                                                <div>
                                                                    <div className="font-bold text-xs">
                                                                        {s.name}
                                                                    </div>
                                                                    <div
                                                                        className={`text-[11px] ${
                                                                            isSelected ? 'text-white/80' : 'text-slate-400'
                                                                        }`}
                                                                    >
                                                                        Jam: {s.startTime} – {s.endTime}
                                                                    </div>
                                                                    {!s.canOrder && (
                                                                        <div className="text-[10px] text-red-500 mt-0.5 font-semibold">
                                                                            Melewati batas cutoff
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div
                                                                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                                                        isSelected
                                                                            ? 'border-white bg-white'
                                                                            : 'border-slate-300'
                                                                    }`}
                                                                >
                                                                    {isSelected && (
                                                                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                                                                    )}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* -------------------------------------------------
                                            SECTION 5: LOKASI KANTIN (LOCKED TO ACCOUNT PREFERENCE)
                                           ------------------------------------------------- */}
                                        <div>
                                            <div className="text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5 text-orange-500" />
                                                <span>Lokasi Kantin Pengambilan</span>
                                            </div>
                                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between">
                                                <div>
                                                    <div className="font-extrabold text-sm text-slate-800">
                                                        {userPreferredCanteen?.name || 'Kantin Utama'}
                                                    </div>
                                                    <div className="text-[11px] text-slate-400">
                                                        {userPreferredCanteen?.location || 'Sesuai lokasi kerja Anda'}
                                                    </div>
                                                </div>
                                                <span className="text-[10px] px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 font-bold tracking-wide">
                                                    Terkunci di Akun
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* -------------------------------------------------
                                        SECTION 6: RINGKASAN & TOMBOL PESAN
                                       ------------------------------------------------- */}
                                    <div className="pt-2">
                                        {selectedDates.length > 0 ? (
                                            <div className="bg-orange-50/70 border border-orange-200 rounded-xl p-3 text-xs text-orange-900 mb-3">
                                                <span className="font-bold">Total Pesanan: </span>
                                                <span>{selectedDates.length} Hari ({selectedDates.map(d => getDateSubLabel(d)).join(', ')})</span>
                                            </div>
                                        ) : (
                                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500 mb-3 flex items-center gap-2">
                                                <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                                <span>Pilih tanggal di atas untuk memesan makanan</span>
                                            </div>
                                        )}

                                        <button
                                            type="button"
                                            onClick={handleOrder}
                                            disabled={selectedDates.length === 0 || !selectedShift || isOrdering}
                                            className="btn-primary w-full py-3.5 rounded-2xl text-base font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none"
                                        >
                                            {isOrdering ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    <span>Memproses {selectedDates.length} Pesanan...</span>
                                                </>
                                            ) : selectedDates.length > 0 ? (
                                                <>
                                                    <Sparkles className="w-5 h-5" />
                                                    <span>Pesan Sekarang ({selectedDates.length} Hari)</span>
                                                </>
                                            ) : (
                                                <span>Pilih Tanggal Pesanan</span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 text-center text-[11px] text-slate-400">
                            Pilihan menu harian dapat dilihat pada katalog di sebelah kiri.
                        </div>
                    </div>
                ) : (
                    /* CASE 3: LOGGED OUT — LOGIN PANEL */
                    <div className="flex flex-col h-full justify-between">
                        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 shadow-sm">
                            <div className="text-center mb-6">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 mb-3">
                                    <Lock className="w-6 h-6" />
                                </div>
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                                    Masuk untuk Memesan
                                </h2>
                                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                                    Masukkan ID karyawan dan password untuk memesan makanan di kiosk ini
                                </p>
                            </div>

                            <form onSubmit={handleLogin} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                                        ID Karyawan (HRIS)
                                    </label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={externalId}
                                            onChange={(e) => setExternalId(e.target.value)}
                                            placeholder="Contoh: EMP1234"
                                            className="input-field pl-11 py-3 text-sm rounded-xl"
                                            autoComplete="username"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                                        Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Masukkan password"
                                            className="input-field pl-11 pr-11 py-3 text-sm rounded-xl"
                                            autoComplete="current-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                            title={showPassword ? 'Sembunyikan' : 'Tampilkan'}
                                        >
                                            {showPassword ? (
                                                <EyeOff className="w-4 h-4" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loginLoading}
                                    className="btn-primary w-full py-3.5 rounded-xl text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 mt-2"
                                >
                                    {loginLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Memproses...</span>
                                        </>
                                    ) : (
                                        'Masuk & Pesan'
                                    )}
                                </button>
                            </form>
                        </div>

                        <div className="pt-6 pb-2 text-center">
                            <p className="text-xs text-slate-400 leading-relaxed">
                                <strong>Perangkat Bersama (Kiosk):</strong> Sesi Anda akan otomatis ditutup
                                setelah pesanan selesai dibuat atau setelah 60 detik tanpa interaksi.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
