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
} from 'lucide-react';

// Kiosk mode — shared PC in the canteen for ordering meals.
// Features:
// - Left: Menu catalog ALWAYS visible (both pre-login and post-login).
// - Browse menus for upcoming days (up to 7-14 days ahead set by admin).
// - Click any menu card/image to view enlarged photo and details modal.
// - Right: Login panel when logged out; switches to simple Order panel when logged in.
// - Forced password change supported in-kiosk.
// - Session end: "Selesai" button + 60s idle (15s countdown) auto-logout.
// - After order success: short confirmation then immediate auto-logout.

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

    // --- Order Form States (When Logged In) ---
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [selectedShift, setSelectedShift] = useState('');
    const [canteens, setCanteens] = useState<Canteen[]>([]);
    const [selectedCanteen, setSelectedCanteen] = useState('');
    const [orderLoading, setOrderLoading] = useState(false);
    const [isOrdering, setIsOrdering] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(false);

    // --- Idle Timeout States ---
    const [countdown, setCountdown] = useState<number | null>(null);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const apiUrl = (import.meta as any).env?.VITE_API_URL || '';

    // Load upcoming menus (public endpoint — no auth required).
    const loadMenus = useCallback(async () => {
        setMenusLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/weekly-menu/upcoming`).then(r => r.json());
            if (res && Array.isArray(res.days) && res.days.length > 0) {
                setUpcomingDays(res.days);
                // Ensure selectedDate defaults to first available date or today
                const today = getLocalDateString();
                const exists = res.days.some((d: DayMenuResponse) => d.date === selectedDate);
                if (!exists) {
                    setSelectedDate(res.days[0]?.date || today);
                }
            } else {
                // Fallback to /today if upcoming is empty
                const todayRes = await fetch(`${apiUrl}/api/weekly-menu/today`).then(r => r.json());
                if (todayRes?.date) {
                    setUpcomingDays([todayRes]);
                    setSelectedDate(todayRes.date);
                }
            }
        } catch {
            // Best effort — kiosk still functions even if menu fetch errors
        } finally {
            setMenusLoading(false);
        }
    }, [apiUrl, selectedDate]);

    useEffect(() => {
        loadMenus();
    }, [loadMenus]);

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

    // Load shift and canteen data for the selected date when logged in
    const loadOrderData = useCallback(async () => {
        if (!user || user.mustChangePassword) return;
        setOrderLoading(true);
        try {
            const [shiftsRes, canteensRes] = await Promise.all([
                api.get(`/api/shifts/for-user?date=${selectedDate}`),
                api.get('/api/canteens'),
            ]);
            const loadedShifts: Shift[] = shiftsRes.data.shifts || [];
            setShifts(loadedShifts);
            // Reset selected shift when date changes if current shift is no longer valid
            if (!loadedShifts.some(s => s.id === selectedShift && s.canOrder)) {
                const firstOrderable = loadedShifts.find(s => s.canOrder);
                setSelectedShift(firstOrderable?.id || '');
            }

            const list: Canteen[] = canteensRes.data.canteens || [];
            setCanteens(list);
            if (user?.preferredCanteenId && list.some(c => c.id === user.preferredCanteenId)) {
                setSelectedCanteen(user.preferredCanteenId);
            } else if (list.length > 0 && !selectedCanteen) {
                setSelectedCanteen(list[0].id);
            }
        } catch (error: any) {
            handleApiError(error);
        } finally {
            setOrderLoading(false);
        }
    }, [user, selectedDate, selectedShift, selectedCanteen]);

    useEffect(() => {
        if (user && !user.mustChangePassword) {
            loadOrderData();
        }
    }, [user, loadOrderData]);

    // Handle Order Submission
    const handleOrder = async () => {
        if (!selectedShift) {
            toast.error('Pilih shift terlebih dahulu');
            return;
        }
        setIsOrdering(true);
        try {
            await api.post('/api/orders', {
                shiftId: selectedShift,
                orderDate: selectedDate,
                canteenId: selectedCanteen || null,
            });
            showSuccess('Pesanan berhasil dibuat!');
            setOrderSuccess(true);
            // Selesai otomatis setelah 2.5 detik
            setTimeout(() => { void finishSession(); }, 2500);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal membuat pesanan');
        } finally {
            setIsOrdering(false);
        }
    };

    // Logout and reset kiosk state
    const finishSession = useCallback(async () => {
        clearIdleTimers();
        setCountdown(null);
        try {
            await logout();
        } finally {
            setSelectedShift('');
            setSelectedCanteen('');
            setOrderSuccess(false);
            setPassword('');
            setExternalId('');
            setPreviewMenu(null);
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

    // Helper: format date label for tabs
    const todayKey = getLocalDateString();
    const tomorrowKey = addDays(todayKey, 1);

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

    // Find the currently active day's menu
    const activeDayData = upcomingDays.find(d => d.date === selectedDate) || upcomingDays[0] || null;

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
                {/* Image Section */}
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

                {/* Content Section */}
                <div className="p-6">
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="text-2xl font-extrabold text-slate-900 leading-tight">
                            {previewMenu.menuItem.name}
                        </h3>
                    </div>

                    {/* Badges */}
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

                    {/* Description */}
                    {previewMenu.menuItem.description ? (
                        <p className="text-slate-600 text-sm leading-relaxed mb-4">
                            {previewMenu.menuItem.description}
                        </p>
                    ) : (
                        <p className="text-slate-400 text-sm italic mb-4">Tidak ada deskripsi tambahan.</p>
                    )}

                    {/* Notes */}
                    {previewMenu.notes && (
                        <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-xs text-amber-900 mb-4">
                            <span className="font-semibold">Catatan Katering: </span>
                            {previewMenu.notes}
                        </div>
                    )}

                    {/* Action buttons */}
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
            {imagePreviewModal}

            {/* =====================================================================
                LEFT COLUMN: MENU DISPLAY (ALWAYS VISIBLE PRE-LOGIN & POST-LOGIN)
               ===================================================================== */}
            <div className="flex-1 p-4 md:p-6 lg:p-8 flex flex-col">
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
                                Pilih tanggal untuk melihat menu makanan yang tersedia
                            </p>
                        </div>
                    </div>
                </div>

                {/* Date Selection Bar (Multi-Day Horizontal Tabs) */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300">
                        {upcomingDays.length > 0 ? (
                            upcomingDays.map((dayData) => {
                                const isSelected = dayData.date === selectedDate;
                                const isToday = dayData.date === todayKey;
                                const count = dayData.menus.length;

                                return (
                                    <button
                                        key={dayData.date}
                                        onClick={() => {
                                            setSelectedDate(dayData.date);
                                        }}
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
                RIGHT COLUMN: LOGIN PANEL (PRE-LOGIN) OR ORDER PANEL (POST-LOGIN)
               ===================================================================== */}
            <div
                className="w-full lg:w-[440px] xl:w-[480px] p-4 md:p-6 lg:p-8 lg:border-l bg-white/60 lg:bg-white flex flex-col justify-between"
                style={{ borderColor: 'var(--color-border)' }}
            >
                {/* CASE 1: FORCED PASSWORD CHANGE */}
                {user && user.mustChangePassword ? (
                    <div className="my-auto">
                        <ForcePasswordChange onPasswordChanged={refreshUser} />
                    </div>
                ) : user ? (
                    /* CASE 2: LOGGED IN — ORDER FORM */
                    <div className="flex flex-col h-full justify-between">
                        <div>
                            {/* User Header with Logout */}
                            <div className="flex items-center justify-between pb-5 mb-5 border-b border-slate-100">
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

                            {/* SUCCESS NOTIFICATION */}
                            {orderSuccess ? (
                                <div className="bg-green-50 border border-green-200 rounded-3xl p-8 text-center my-8 animate-in zoom-in-95 duration-200">
                                    <div className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/30">
                                        <CheckCircle2 className="w-10 h-10" />
                                    </div>
                                    <h3 className="text-2xl font-black text-green-900 mb-2">
                                        Pesanan Berhasil!
                                    </h3>
                                    <p className="text-sm text-green-700 leading-relaxed mb-4">
                                        Pesanan makan Anda untuk tanggal <strong>{selectedDate}</strong> telah tersimpan.
                                        QR Code check-in dapat dilihat di aplikasi HP Anda.
                                    </p>
                                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-green-600 bg-white/80 px-4 py-2 rounded-full border border-green-200">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>Kembali ke layar awal...</span>
                                    </div>
                                </div>
                            ) : orderLoading ? (
                                <div className="py-20 flex flex-col items-center justify-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-orange-500 mb-2" />
                                    <p className="text-xs text-slate-400 font-medium">Memeriksa jadwal shift...</p>
                                </div>
                            ) : (
                                /* ORDER FORM */
                                <div className="space-y-5">
                                    {/* Date Summary */}
                                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                        <div className="text-xs font-semibold text-slate-400 mb-1">
                                            Tanggal Pesanan Dipilih
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="text-base font-bold text-slate-800 flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-orange-500" />
                                                <span>
                                                    {activeDayData?.dayName || ''}, {selectedDate}
                                                </span>
                                            </div>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">
                                                {selectedDate === todayKey
                                                    ? 'Hari Ini'
                                                    : selectedDate === tomorrowKey
                                                    ? 'Besok'
                                                    : 'Mendatang'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Shift Selection */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
                                            Pilih Shift Makan
                                        </label>
                                        {shifts.length === 0 ? (
                                            <div className="bg-slate-50 rounded-2xl p-5 text-center text-xs text-slate-400 border border-slate-200">
                                                Tidak ada shift yang dapat dipesan untuk tanggal ini.
                                            </div>
                                        ) : (
                                            <div className="space-y-2.5">
                                                {shifts.map((s) => {
                                                    const isSelected = selectedShift === s.id;
                                                    return (
                                                        <button
                                                            key={s.id}
                                                            type="button"
                                                            disabled={!s.canOrder}
                                                            onClick={() => setSelectedShift(s.id)}
                                                            className={`w-full p-4 rounded-2xl border text-left transition-all duration-200 flex items-center justify-between ${
                                                                isSelected
                                                                    ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20'
                                                                    : s.canOrder
                                                                    ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                                                                    : 'bg-slate-50 border-slate-100 text-slate-400 opacity-60 cursor-not-allowed'
                                                            }`}
                                                        >
                                                            <div>
                                                                <div className="font-bold text-sm">
                                                                    {s.name}
                                                                </div>
                                                                <div
                                                                    className={`text-xs mt-0.5 ${
                                                                        isSelected
                                                                            ? 'text-white/80'
                                                                            : 'text-slate-400'
                                                                    }`}
                                                                >
                                                                    Jam: {s.startTime} – {s.endTime}
                                                                </div>
                                                                {!s.canOrder && (
                                                                    <div className="text-[11px] text-red-500 mt-1 font-semibold">
                                                                        Melewati batas cutoff / tidak aktif
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div
                                                                className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                                                                    isSelected
                                                                        ? 'border-white bg-white text-orange-500'
                                                                        : 'border-slate-300'
                                                                }`}
                                                            >
                                                                {isSelected && (
                                                                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                                                                )}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Canteen Selection */}
                                    {canteens.length > 0 && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5 text-orange-500" />
                                                <span>Lokasi Pengambilan / Kantin</span>
                                            </label>
                                            <select
                                                value={selectedCanteen}
                                                onChange={(e) => setSelectedCanteen(e.target.value)}
                                                className="input-field w-full py-3 px-4 rounded-xl border border-slate-200 text-sm font-semibold bg-white"
                                            >
                                                {canteens.map((c) => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.name} {c.location ? `(${c.location})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Submit Button */}
                                    <button
                                        type="button"
                                        onClick={handleOrder}
                                        disabled={!selectedShift || isOrdering}
                                        className="btn-primary w-full py-4 rounded-2xl text-base font-extrabold flex items-center justify-center gap-2 shadow-xl shadow-orange-500/25 mt-4"
                                    >
                                        {isOrdering ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                <span>Memproses Pesanan...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-5 h-5" />
                                                <span>Pesan Sekarang</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Helper tip at bottom */}
                        <div className="pt-6 text-center text-xs text-slate-400">
                            Pilih tanggal di sebelah kiri untuk melihat menu & memesan pada hari tersebut.
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
