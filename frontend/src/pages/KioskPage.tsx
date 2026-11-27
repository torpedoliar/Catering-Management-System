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
    LogOut,
    CheckCircle2,
    Clock,
    MapPin,
    ZoomIn,
    Eye,
    EyeOff,
    Trash2,
    Info,
    CalendarCheck,
    Check,
} from 'lucide-react';
import { Button, Badge, Card, Modal, SkeletonCard, EmptyState } from '../components/ui';

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

    const [upcomingDays, setUpcomingDays] = useState<DayMenuResponse[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
    const [menusLoading, setMenusLoading] = useState(true);
    const [previewMenu, setPreviewMenu] = useState<DayMenu | null>(null);

    const [externalId, setExternalId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);

    const [existingOrders, setExistingOrders] = useState<Record<string, ExistingOrder>>({});
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [cancelModalOrder, setCancelModalOrder] = useState<ExistingOrder | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);

    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [selectedShift, setSelectedShift] = useState('');
    const [canteens, setCanteens] = useState<Canteen[]>([]);
    const [shiftsLoading, setShiftsLoading] = useState(false);
    const [isOrdering, setIsOrdering] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(false);

    const [countdown, setCountdown] = useState<number | null>(null);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const apiUrl = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || '';
    const todayKey = getLocalDateString();
    const tomorrowKey = addDays(todayKey, 1);

    const loadMenus = useCallback(async () => {
        setMenusLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/weekly-menu/upcoming`).then((r) => r.json());
            if (res && Array.isArray(res.days) && res.days.length > 0) {
                setUpcomingDays(res.days);
                const exists = res.days.some((d: DayMenuResponse) => d.date === selectedDate);
                if (!exists) setSelectedDate(res.days[0]?.date || getLocalDateString());
            } else {
                const todayRes = await fetch(`${apiUrl}/api/weekly-menu/today`).then((r) => r.json());
                if (todayRes?.date) {
                    setUpcomingDays([todayRes]);
                    setSelectedDate(todayRes.date);
                }
            }
        } catch {
            // best effort
        } finally {
            setMenusLoading(false);
        }
    }, [apiUrl, selectedDate]);

    useEffect(() => {
        loadMenus();
    }, [loadMenus]);

    const loadUserOrders = useCallback(async () => {
        if (!user || user.mustChangePassword) return;
        setOrdersLoading(true);
        try {
            const today = getLocalDateString();
            const futureEnd = addDays(today, 14);
            const res = await api.get('/api/orders/my-orders', {
                params: { startDate: today, endDate: futureEnd, limit: 50 },
            });
            const map: Record<string, ExistingOrder> = {};
            if (Array.isArray(res.data?.orders)) {
                res.data.orders.forEach((o: ExistingOrder) => {
                    if (o.status !== 'CANCELLED') {
                        map[o.orderDate.slice(0, 10)] = o;
                    }
                });
            }
            setExistingOrders(map);
            setSelectedDates((prev) => {
                const filtered = prev.filter((d) => !map[d] && d > today);
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
            if (!loadedShifts.some((s) => s.id === selectedShift && s.canOrder)) {
                const first = loadedShifts.find((s) => s.canOrder);
                setSelectedShift(first?.id || '');
            }
            setCanteens(canteensRes.data.canteens || []);
        } catch (error) {
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

    const userPreferredCanteen =
        canteens.find((c) => c.id === user?.preferredCanteenId) || canteens[0] || null;
    const lockedCanteenId = user?.preferredCanteenId || userPreferredCanteen?.id || null;

    const clearIdleTimers = () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        idleTimerRef.current = null;
        countdownTimerRef.current = null;
    };

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
        if (!user) return;
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
    }, [user, armIdleTimer]);

    const toggleDate = (dateKey: string) => {
        if (dateKey <= todayKey) {
            toast.error('Pemesanan untuk hari ini sudah ditutup (cutoff)');
            return;
        }
        if (existingOrders[dateKey]) {
            toast.error(`Anda sudah memesan untuk tanggal ${dateKey}`);
            return;
        }
        setSelectedDates((prev) =>
            prev.includes(dateKey) ? prev.filter((d) => d !== dateKey) : [...prev, dateKey].sort()
        );
    };

    const selectAllAvailable = () => {
        const available = upcomingDays
            .map((d) => d.date)
            .filter((d) => d > todayKey && !existingOrders[d]);
        if (available.length === 0) {
            toast('Semua tanggal mendatang sudah dipesan!');
            return;
        }
        setSelectedDates(available);
    };

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
        } catch (error: unknown) {
            const err = error as { response?: { status?: number } };
            if (err.response?.status === 401) {
                toast.error('Kredensial salah');
                return;
            }
            if (err.response?.status === 429) {
                toast.error('Terlalu banyak percobaan login. Silakan tunggu beberapa saat.');
                return;
            }
            handleApiError(error);
        } finally {
            setLoginLoading(false);
        }
    };

    const handleOrder = async () => {
        if (selectedDates.length === 0) {
            toast.error('Pilih minimal satu tanggal yang ingin dipesan');
            return;
        }
        if (!selectedShift) {
            toast.error('Pilih shift terlebih dahulu');
            return;
        }
        const invalidDates = selectedDates.filter((d) => d <= todayKey);
        if (invalidDates.length > 0) {
            toast.error('Pemesanan hari ini sudah ditutup. Hanya bisa memesan mulai besok.');
            return;
        }
        setIsOrdering(true);
        try {
            const res = await api.post('/api/orders/bulk', {
                orders: selectedDates.map((date) => ({ date, shiftId: selectedShift })),
                canteenId: lockedCanteenId,
            });
            const summary = res.data?.summary;
            if (summary && summary.successCount > 0) {
                showSuccess(`Berhasil membuat pesanan untuk ${summary.successCount} hari!`);
                setOrderSuccess(true);
                void loadUserOrders();
                setTimeout(() => {
                    void finishSession();
                }, 2500);
            } else {
                toast.error(res.data?.failed?.[0]?.reason || 'Gagal membuat pesanan');
            }
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string } } };
            toast.error(err.response?.data?.error || 'Gagal membuat pesanan');
        } finally {
            setIsOrdering(false);
        }
    };

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
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string; message?: string } } };
            toast.error(err.response?.data?.error || err.response?.data?.message || 'Gagal membatalkan pesanan');
        } finally {
            setIsCancelling(false);
        }
    };

    const getDateTabLabel = (d: DayMenuResponse) => {
        if (d.date === todayKey) return 'Hari Ini';
        if (d.date === tomorrowKey) return 'Besok';
        return d.dayName;
    };

    const getDateSubLabel = (dateStr: string) => {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
            return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]}`;
        }
        return dateStr;
    };

    const activeDayData = upcomingDays.find((d) => d.date === selectedDate) || upcomingDays[0] || null;
    const futureUpcomingDays = upcomingDays.filter((d) => d.date > todayKey);
    const activeOrdersList = Object.values(existingOrders).filter((o) => o.status === 'ORDERED');
    const todayOrder = existingOrders[todayKey];

    return (
        <div className="min-h-screen flex flex-col lg:flex-row bg-[#f7f7f5] text-[#1c1917]">
            {/* Left: Menu Catalog */}
            <div className="flex-1 p-5 md:p-7 flex flex-col overflow-y-auto">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-11 h-11 rounded-[10px] bg-[#f59e0b] text-[#1c1917] flex items-center justify-center flex-shrink-0">
                        <UtensilsCrossed className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-[#1c1917]">
                                Kiosk pemesanan makan
                            </h1>
                            <Badge variant="warning">Kantin</Badge>
                        </div>
                        <p className="m-0 text-[13px] text-[#78716c]">
                            Lihat menu katering &amp; jadwal shift
                        </p>
                    </div>
                </div>

                {/* Date tabs */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-5">
                    {upcomingDays.map((dayData) => {
                        const isSelected = dayData.date === selectedDate;
                        const hasOrder = !!existingOrders[dayData.date];
                        const count = dayData.menus.length;
                        return (
                            <button
                                key={dayData.date}
                                type="button"
                                onClick={() => setSelectedDate(dayData.date)}
                                className={`flex-shrink-0 px-3.5 py-2.5 rounded-[12px] text-left transition-colors cursor-pointer ${
                                    isSelected
                                        ? 'border-2 border-[#f59e0b] bg-[#fffbeb] text-[#1c1917]'
                                        : 'border border-[#e7e5e4] bg-[#fff] text-[#44403c] hover:bg-[#fafaf9]'
                                }`}
                            >
                                <div className="font-bold text-[13px]">{getDateTabLabel(dayData)}</div>
                                <div className="flex items-center gap-2 mt-0.5 text-[11.5px]">
                                    <span className="text-[#78716c]">{getDateSubLabel(dayData.date)}</span>
                                    {hasOrder ? (
                                        <span className="text-[#15803d] font-bold">Dipesan</span>
                                    ) : (
                                        <span className="text-[#b45309] font-semibold">
                                            {count > 0 ? `${count} menu` : 'Kosong'}
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="flex-1">
                    {menusLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            <SkeletonCard lines={3} />
                            <SkeletonCard lines={3} />
                            <SkeletonCard lines={3} />
                        </div>
                    ) : !activeDayData || activeDayData.menus.length === 0 ? (
                        <Card>
                            <EmptyState
                                title="Belum ada menu dibagikan"
                                description={`Menu untuk tanggal ${selectedDate} belum diatur oleh admin.`}
                            />
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pb-6">
                            {activeDayData.menus.map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setPreviewMenu(m)}
                                    className="group bg-[#fff] rounded-[14px] border border-[#e7e5e4] overflow-hidden text-left cursor-pointer hover:border-[#f59e0b] transition-colors flex flex-col justify-between p-0"
                                >
                                    <div>
                                        <div className="relative w-full h-40 bg-[#f5f5f4] overflow-hidden">
                                            {m.menuItem.imageUrl ? (
                                                <img
                                                    src={m.menuItem.imageUrl}
                                                    alt={m.menuItem.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-[#a8a29e]">
                                                    <UtensilsCrossed className="w-8 h-8 mb-1" aria-hidden="true" />
                                                    <span className="text-[11px]">Tanpa foto</span>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-[rgba(28,25,23,0.4)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-[#fff] text-[12px] font-bold">
                                                <ZoomIn className="w-4 h-4" aria-hidden="true" />
                                                <span>Lihat detail</span>
                                            </div>
                                            {m.shiftName && (
                                                <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-[#fff] text-[#b45309] text-[11px] font-bold">
                                                    {m.shiftName}
                                                </span>
                                            )}
                                        </div>
                                        <div className="p-4">
                                            <h3 className="m-0 font-bold text-[14.5px] text-[#1c1917] line-clamp-1">
                                                {m.menuItem.name}
                                            </h3>
                                            {m.menuItem.description && (
                                                <p className="m-0 text-[12px] text-[#78716c] mt-1 line-clamp-2">
                                                    {m.menuItem.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="px-4 py-2.5 border-t border-[#f0efed] flex items-center justify-between text-[11.5px] text-[#78716c]">
                                        <span className="truncate">{m.menuItem.vendor?.name || 'Katering'}</span>
                                        {m.menuItem.category && <span>{m.menuItem.category}</span>}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Login or Order Panel */}
            <div className="w-full lg:w-[440px] xl:w-[480px] p-5 md:p-7 lg:border-l border-[#e7e5e4] bg-[#fff] flex flex-col justify-between overflow-y-auto">
                {user && user.mustChangePassword ? (
                    <div className="my-auto">
                        <ForcePasswordChange onPasswordChanged={refreshUser} />
                    </div>
                ) : user ? (
                    <div className="flex flex-col h-full justify-between gap-4">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-3.5 border-b border-[#f0efed]">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-full bg-[#fde68a] text-[#92400e] flex items-center justify-center font-bold text-[15px] flex-shrink-0">
                                        {user.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="m-0 font-bold text-[15px] text-[#1c1917] truncate">
                                            {user.name}
                                        </h2>
                                        <p className="m-0 text-[12px] text-[#78716c] truncate">
                                            {user.company || 'Karyawan'} · {user.externalId}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => void finishSession()}
                                    leftIcon={<LogOut className="w-3.5 h-3.5" aria-hidden="true" />}
                                >
                                    Selesai
                                </Button>
                            </div>

                            {orderSuccess ? (
                                <div className="bg-[#dcfce7] border border-[#bbf7d0] rounded-[14px] p-6 text-center space-y-3">
                                    <CheckCircle2 className="w-10 h-10 text-[#15803d] mx-auto" aria-hidden="true" />
                                    <h3 className="m-0 text-[18px] font-extrabold text-[#166534]">
                                        Pesanan berhasil!
                                    </h3>
                                    <p className="m-0 text-[13px] text-[#166534]">
                                        Pesanan tersimpan. Barcode check-in tersedia di aplikasi HP Anda.
                                    </p>
                                    <Button variant="primary" className="w-full" onClick={() => void finishSession()}>
                                        Selesai sekarang
                                    </Button>
                                </div>
                            ) : ordersLoading ? (
                                <SkeletonCard lines={4} />
                            ) : (
                                <>
                                    {todayOrder ? (
                                        <div className="bg-[#dcfce7] border border-[#bbf7d0] rounded-[12px] p-3.5 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#166534]">
                                                    <CalendarCheck className="w-4 h-4" aria-hidden="true" />
                                                    Pesanan hari ini
                                                </span>
                                                <Badge variant="success">{todayOrder.shift?.name}</Badge>
                                            </div>
                                            <div className="text-[12px] text-[#166534]">
                                                Jam {todayOrder.shift?.startTime}–{todayOrder.shift?.endTime} ·{' '}
                                                {todayOrder.canteen?.name || 'Kantin'}
                                            </div>
                                            <div className="pt-2 border-t border-[#bbf7d0] flex justify-end">
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    onClick={() => setCancelModalOrder(todayOrder)}
                                                    leftIcon={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                                                >
                                                    Batal pesanan
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-[#fafaf9] border border-[#e7e5e4] rounded-[12px] p-3 text-[12.5px] text-[#78716c] flex items-center gap-2">
                                            <Info className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                                            <span>Pemesanan hari ini sudah ditutup. Pilih tanggal mulai besok.</span>
                                        </div>
                                    )}

                                    {activeOrdersList.filter((o) => o.orderDate.slice(0, 10) > todayKey).length > 0 && (
                                        <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-[12px] p-3.5 space-y-2">
                                            <div className="text-[12px] font-bold text-[#92400e] uppercase">
                                                Pesanan mendatang
                                            </div>
                                            {activeOrdersList
                                                .filter((o) => o.orderDate.slice(0, 10) > todayKey)
                                                .map((order) => (
                                                    <div
                                                        key={order.id}
                                                        className="bg-[#fff] rounded-[9px] px-3 py-2 border border-[#e7e5e4] flex items-center justify-between gap-2"
                                                    >
                                                        <div>
                                                            <div className="font-bold text-[12.5px] text-[#1c1917]">
                                                                {getDateSubLabel(order.orderDate.slice(0, 10))}
                                                            </div>
                                                            <div className="text-[11.5px] text-[#78716c]">
                                                                {order.shift?.name} ({order.shift?.startTime}–{order.shift?.endTime})
                                                            </div>
                                                        </div>
                                                        <Button
                                                            variant="danger"
                                                            size="sm"
                                                            onClick={() => setCancelModalOrder(order)}
                                                        >
                                                            Batalkan
                                                        </Button>
                                                    </div>
                                                ))}
                                        </div>
                                    )}

                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[13px] font-bold text-[#1c1917]">
                                                Pesan mulai besok
                                            </span>
                                            <div className="flex gap-2 text-[12px]">
                                                <button
                                                    type="button"
                                                    onClick={selectAllAvailable}
                                                    className="border-0 bg-transparent text-[#b45309] font-semibold cursor-pointer p-0"
                                                >
                                                    Pilih semua
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedDates([])}
                                                    className="border-0 bg-transparent text-[#78716c] cursor-pointer p-0"
                                                >
                                                    Hapus
                                                </button>
                                            </div>
                                        </div>

                                        {futureUpcomingDays.length === 0 ? (
                                            <p className="text-[12.5px] text-[#78716c]">
                                                Belum ada jadwal hari mendatang.
                                            </p>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-2">
                                                {futureUpcomingDays.map((dayData) => {
                                                    const dateStr = dayData.date;
                                                    const ordered = !!existingOrders[dateStr];
                                                    const checked = selectedDates.includes(dateStr);
                                                    return (
                                                        <button
                                                            key={dateStr}
                                                            type="button"
                                                            disabled={ordered}
                                                            aria-pressed={checked}
                                                            onClick={() => toggleDate(dateStr)}
                                                            className={`p-2.5 rounded-[10px] text-left flex items-center justify-between transition-colors ${
                                                                ordered
                                                                    ? 'border border-[#bbf7d0] bg-[#dcfce7] text-[#166534] cursor-not-allowed'
                                                                    : checked
                                                                        ? 'border-2 border-[#f59e0b] bg-[#fffbeb] text-[#1c1917] cursor-pointer'
                                                                        : 'border border-[#e7e5e4] bg-[#fff] text-[#1c1917] cursor-pointer'
                                                            }`}
                                                        >
                                                            <div>
                                                                <div className="text-[12.5px] font-bold">
                                                                    {getDateTabLabel(dayData)}
                                                                </div>
                                                                <div className="text-[11px] text-[#78716c]">
                                                                    {getDateSubLabel(dateStr)}
                                                                </div>
                                                            </div>
                                                            {checked && (
                                                                <Check className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <div className="text-[13px] font-bold text-[#1c1917] mb-2">
                                            Pilih shift
                                        </div>
                                        {shiftsLoading ? (
                                            <SkeletonCard lines={2} />
                                        ) : (
                                            <div className="space-y-2">
                                                {shifts.map((s) => {
                                                    const on = selectedShift === s.id;
                                                    return (
                                                        <button
                                                            key={s.id}
                                                            type="button"
                                                            disabled={!s.canOrder}
                                                            aria-pressed={on}
                                                            onClick={() => setSelectedShift(s.id)}
                                                            className={`w-full p-3 rounded-[10px] text-left flex items-center gap-3 transition-colors ${
                                                                on
                                                                    ? 'border-2 border-[#f59e0b] bg-[#fffbeb] text-[#1c1917] cursor-pointer'
                                                                    : !s.canOrder
                                                                        ? 'border border-[#f0efed] bg-[#fafaf9] text-[#a8a29e] cursor-not-allowed'
                                                                        : 'border border-[#e7e5e4] bg-[#fff] text-[#1c1917] cursor-pointer'
                                                            }`}
                                                        >
                                                            <span
                                                                aria-hidden="true"
                                                                className={`w-4 h-4 rounded-full flex-shrink-0 ${
                                                                    on
                                                                        ? 'border-[5px] border-[#f59e0b]'
                                                                        : 'border-2 border-[#d6d3d1]'
                                                                }`}
                                                            />
                                                            <span className="flex-1">
                                                                <span className="block font-bold text-[13px]">{s.name}</span>
                                                                <span className="block text-[11.5px] text-[#78716c]">
                                                                    {s.startTime}–{s.endTime}
                                                                </span>
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-[#fafaf9] border border-[#e7e5e4] rounded-[10px] p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
                                            <div>
                                                <div className="text-[13px] font-bold text-[#1c1917]">
                                                    {userPreferredCanteen?.name || 'Kantin Utama'}
                                                </div>
                                                <div className="text-[11px] text-[#78716c]">Terkunci di akun</div>
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        variant="primary"
                                        size="lg"
                                        className="w-full"
                                        loading={isOrdering}
                                        loadingText="Memproses…"
                                        disabled={selectedDates.length === 0 || !selectedShift}
                                        onClick={handleOrder}
                                    >
                                        {selectedDates.length > 0
                                            ? `Pesan ${selectedDates.length} hari`
                                            : 'Pilih tanggal dulu'}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="my-auto space-y-5">
                        <div>
                            <h2 className="m-0 text-[22px] font-extrabold text-[#1c1917]">
                                Masuk untuk memesan
                            </h2>
                            <p className="m-0 mt-1 text-[13px] text-[#78716c]">
                                Masukkan ID karyawan dan password untuk memesan di kiosk ini.
                            </p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label
                                    htmlFor="kiosk-id"
                                    className="block text-[12px] font-semibold text-[#44403c] mb-1"
                                >
                                    ID Karyawan (HRIS)
                                </label>
                                <div className="relative flex items-center">
                                    <User className="w-4 h-4 text-[#78716c] absolute left-3 pointer-events-none" aria-hidden="true" />
                                    <input
                                        id="kiosk-id"
                                        type="text"
                                        value={externalId}
                                        onChange={(e) => setExternalId(e.target.value)}
                                        placeholder="Contoh: 00046702"
                                        autoComplete="username"
                                        className="w-full h-10 rounded-[10px] border border-[#d6d3d1] bg-[#fff] pl-9 pr-3 text-[14px] text-[#1c1917] focus:outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/25"
                                    />
                                </div>
                            </div>

                            <div>
                                <label
                                    htmlFor="kiosk-pass"
                                    className="block text-[12px] font-semibold text-[#44403c] mb-1"
                                >
                                    Password
                                </label>
                                <div className="relative flex items-center">
                                    <Lock className="w-4 h-4 text-[#78716c] absolute left-3 pointer-events-none" aria-hidden="true" />
                                    <input
                                        id="kiosk-pass"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Masukkan password"
                                        autoComplete="current-password"
                                        className="w-full h-10 rounded-[10px] border border-[#d6d3d1] bg-[#fff] pl-9 pr-10 text-[14px] text-[#1c1917] focus:outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/25"
                                    />
                                    <button
                                        type="button"
                                        aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-2.5 text-[#78716c] bg-transparent border-0 cursor-pointer p-1"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                loading={loginLoading}
                                loadingText="Memproses…"
                                className="w-full"
                            >
                                Masuk
                            </Button>
                        </form>
                    </div>
                )}
            </div>

            {/* Idle Countdown Modal */}
            <Modal
                open={countdown !== null}
                onClose={() => armIdleTimer()}
                title="Masih di sana?"
                size="sm"
                closeOnOverlayClick={false}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => void finishSession()}>
                            Keluar
                        </Button>
                        <Button variant="primary" onClick={() => armIdleTimer()}>
                            Saya masih di sini
                        </Button>
                    </>
                }
            >
                <div className="flex items-center gap-3 text-[14px] text-[#44403c]">
                    <Clock className="w-5 h-5 text-[#b45309] flex-shrink-0" aria-hidden="true" />
                    <span>
                        Sesi kiosk akan ditutup otomatis dalam <b>{countdown} detik</b>.
                    </span>
                </div>
            </Modal>

            {/* Cancel Confirmation Modal */}
            <Modal
                open={!!cancelModalOrder}
                onClose={() => setCancelModalOrder(null)}
                title="Batalkan pesanan?"
                size="sm"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setCancelModalOrder(null)}
                            disabled={isCancelling}
                        >
                            Kembali
                        </Button>
                        <Button
                            variant="danger"
                            loading={isCancelling}
                            loadingText="Membatalkan…"
                            onClick={handleCancelOrder}
                        >
                            Ya, batalkan
                        </Button>
                    </>
                }
            >
                {cancelModalOrder && (
                    <p className="m-0 text-[13.5px] text-[#44403c]">
                        Yakin membatalkan pesanan tanggal <b>{cancelModalOrder.orderDate.slice(0, 10)}</b> ({cancelModalOrder.shift?.name})?
                    </p>
                )}
            </Modal>

            {/* Menu Preview Modal */}
            <Modal
                open={!!previewMenu}
                onClose={() => setPreviewMenu(null)}
                title={previewMenu?.menuItem.name}
                size="md"
                footer={
                    <>
                        {user && previewMenu?.shiftId && (
                            <Button
                                variant="primary"
                                onClick={() => {
                                    setSelectedShift(previewMenu.shiftId!);
                                    setPreviewMenu(null);
                                    toast.success(`Shift ${previewMenu.shiftName || ''} dipilih`);
                                }}
                            >
                                Pilih shift ini
                            </Button>
                        )}
                        <Button variant="secondary" onClick={() => setPreviewMenu(null)}>
                            Tutup
                        </Button>
                    </>
                }
            >
                {previewMenu && (
                    <div className="space-y-3">
                        {previewMenu.menuItem.imageUrl && (
                            <img
                                src={previewMenu.menuItem.imageUrl}
                                alt={previewMenu.menuItem.name}
                                className="w-full max-h-[300px] object-cover rounded-[10px]"
                            />
                        )}
                        <div className="flex flex-wrap gap-2">
                            {previewMenu.shiftName && <Badge variant="warning">{previewMenu.shiftName}</Badge>}
                            {previewMenu.menuItem.vendor && (
                                <Badge variant="neutral">{previewMenu.menuItem.vendor.name}</Badge>
                            )}
                        </div>
                        {previewMenu.menuItem.description && (
                            <p className="m-0 text-[13.5px] text-[#44403c]">
                                {previewMenu.menuItem.description}
                            </p>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}
