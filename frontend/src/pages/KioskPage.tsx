import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, api } from '../contexts/AuthContext';
import ForcePasswordChange from '../components/ForcePasswordChange';
import { getLocalDateString, addDays } from '../utils/dateHelpers';
import { handleApiError, showSuccess } from '../utils/errorHandler';
import toast from 'react-hot-toast';
import { UtensilsCrossed, User, Lock, Loader2, LogOut, CheckCircle2, Clock, MapPin } from 'lucide-react';

// Kiosk mode — shared PC in the canteen for ordering meals.
// Grilling decisions (2026-09-11):
// - Pre-login: tabs Hari Ini / Besok with published menus + always-visible login panel.
// - Full username+password login (existing endpoint), no PIN, no DB migration.
// - Forced password change happens in-kiosk, then continues to ordering.
// - Post-login: simple single-date flow (tanggal → shift → kantin → pesan).
// - Session end: "Selesai" button + immediate logout; 60s idle + 15s countdown auto-logout.
// - After successful order: short success message, then immediate logout (QR stays on user's phone).

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

    // --- Pre-login: menu display + login form ---
    const [tab, setTab] = useState<'today' | 'tomorrow'>('today');
    const [todayMenu, setTodayMenu] = useState<DayMenuResponse | null>(null);
    const [tomorrowMenu, setTomorrowMenu] = useState<DayMenuResponse | null>(null);
    const [menusLoading, setMenusLoading] = useState(true);
    const [externalId, setExternalId] = useState('');
    const [password, setPassword] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);

    // --- Post-login: order flow ---
    const todayKey = getLocalDateString();
    const tomorrowKey = addDays(todayKey, 1);
    const [orderDate, setOrderDate] = useState<string>(todayKey);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [selectedShift, setSelectedShift] = useState('');
    const [canteens, setCanteens] = useState<Canteen[]>([]);
    const [selectedCanteen, setSelectedCanteen] = useState('');
    const [orderLoading, setOrderLoading] = useState(false);
    const [isOrdering, setIsOrdering] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(false);

    // --- Idle timeout ---
    const [countdown, setCountdown] = useState<number | null>(null);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const apiUrl = (import.meta as any).env?.VITE_API_URL || '';

    // Public menu endpoints — no auth needed (mirror of /today).
    const loadMenus = useCallback(async () => {
        setMenusLoading(true);
        try {
            const [todayRes, tomorrowRes] = await Promise.all([
                fetch(`${apiUrl}/api/weekly-menu/today`).then(r => r.json()),
                fetch(`${apiUrl}/api/weekly-menu/tomorrow`).then(r => r.json()),
            ]);
            setTodayMenu(todayRes);
            setTomorrowMenu(tomorrowRes);
        } catch {
            // Menu display is best-effort; login still works without it.
        } finally {
            setMenusLoading(false);
        }
    }, [apiUrl]);

    useEffect(() => {
        loadMenus();
    }, [loadMenus]);

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

    // Load order data once logged in.
    const loadOrderData = useCallback(async () => {
        setOrderLoading(true);
        try {
            const [shiftsRes, canteensRes] = await Promise.all([
                api.get(`/api/shifts/for-user?date=${orderDate}`),
                api.get('/api/canteens'),
            ]);
            setShifts(shiftsRes.data.shifts || []);
            const list: Canteen[] = canteensRes.data.canteens || [];
            setCanteens(list);
            if (user?.preferredCanteenId && list.some(c => c.id === user.preferredCanteenId)) {
                setSelectedCanteen(user.preferredCanteenId);
            } else if (list.length > 0) {
                setSelectedCanteen(list[0].id);
            }
        } catch (error: any) {
            handleApiError(error);
        } finally {
            setOrderLoading(false);
        }
    }, [orderDate, user?.preferredCanteenId]);

    useEffect(() => {
        if (user && !user.mustChangePassword) {
            loadOrderData();
        }
    }, [user, loadOrderData]);

    const handleOrder = async () => {
        if (!selectedShift) {
            toast.error('Pilih shift terlebih dahulu');
            return;
        }
        setIsOrdering(true);
        try {
            await api.post('/api/orders', {
                shiftId: selectedShift,
                orderDate,
                canteenId: selectedCanteen || null,
            });
            showSuccess('Pesanan berhasil dibuat! Lihat QR di HP Anda untuk check-in.');
            setOrderSuccess(true);
            // Q8: success message is short — session ends immediately after.
            setTimeout(() => { void finishSession(); }, 2500);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal membuat pesanan');
        } finally {
            setIsOrdering(false);
        }
    };

    const finishSession = useCallback(async () => {
        clearIdleTimers();
        setCountdown(null);
        try {
            await logout();
        } finally {
            setOrderDate(getLocalDateString());
            setSelectedShift('');
            setSelectedCanteen('');
            setOrderSuccess(false);
            setPassword('');
            setExternalId('');
            void loadMenus();
        }
    }, [logout, loadMenus]);

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
            // 15s countdown before auto-logout.
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

    // Arm/reset idle timer on login and on any interaction while logged in.
    useEffect(() => {
        if (user) {
            armIdleTimer();
            const reset = () => {
                if (countdownTimerRef.current) return; // don't extend during final countdown
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

    // Forced password change (in-kiosk, then continue to ordering).
    if (user?.mustChangePassword) {
        return (
            <div className="min-h-screen">
                <ForcePasswordChange onPasswordChanged={refreshUser} />
            </div>
        );
    }

    const visibleMenu = tab === 'today' ? todayMenu : tomorrowMenu;

    // Idle countdown overlay.
    const countdownOverlay = countdown !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
                <Clock className="w-12 h-12 mx-auto text-amber-500 mb-4" />
                <h2 className="text-xl font-bold mb-2">Masih di sana?</h2>
                <p className="text-slate-500 mb-4">
                    Sesi akan berakhir dalam <span className="font-bold text-amber-600">{countdown} detik</span> demi keamanan akun Anda.
                </p>
                <div className="flex gap-3">
                    <button onClick={() => armIdleTimer()} className="btn-primary flex-1">
                        Saya Masih Di Sini
                    </button>
                    <button onClick={() => void finishSession()} className="btn-secondary flex-1">
                        Selesai
                    </button>
                </div>
            </div>
        </div>
    );

    // ---- Post-login: order screen ----
    if (user) {
        return (
            <div className="min-h-screen p-4 md:p-8" style={{ background: 'var(--color-bg-secondary)' }}>
                {countdownOverlay}
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold">Halo, {user.name}</h1>
                            <p className="text-sm text-slate-500">Pilih jadwal makan Anda, lalu tekan Selesai.</p>
                        </div>
                        <button
                            onClick={() => void finishSession()}
                            className="btn-secondary flex items-center gap-2"
                        >
                            <LogOut className="w-4 h-4" /> Selesai
                        </button>
                    </div>

                    {orderSuccess ? (
                        <div className="bg-white rounded-2xl border p-10 text-center">
                            <CheckCircle2 className="w-16 h-16 mx-auto text-green-500 mb-4" />
                            <h2 className="text-2xl font-bold mb-2">Pesanan Berhasil!</h2>
                            <p className="text-slate-500">Lihat QR di HP Anda untuk check-in di kantin.</p>
                        </div>
                    ) : orderLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border p-6 space-y-6">
                            <div>
                                <label className="block text-sm font-semibold mb-2">Tanggal</label>
                                <div className="flex gap-3">
                                    {[
                                        { key: todayKey, label: 'Hari Ini' },
                                        { key: tomorrowKey, label: 'Besok' },
                                    ].map(d => (
                                        <button
                                            key={d.key}
                                            onClick={() => { setOrderDate(d.key); setSelectedShift(''); }}
                                            className={`flex-1 py-3 rounded-xl border font-semibold ${
                                                orderDate === d.key
                                                    ? 'bg-orange-500 text-white border-orange-500'
                                                    : 'bg-white border-slate-200'
                                            }`}
                                        >
                                            {d.label}
                                            <span className="block text-xs font-normal opacity-80">{d.key}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold mb-2">Shift</label>
                                {shifts.length === 0 ? (
                                    <p className="text-slate-500 text-sm">Tidak ada shift yang tersedia untuk tanggal ini.</p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {shifts.map(s => (
                                            <button
                                                key={s.id}
                                                disabled={!s.canOrder}
                                                onClick={() => setSelectedShift(s.id)}
                                                className={`p-4 rounded-xl border text-left ${
                                                    selectedShift === s.id
                                                        ? 'bg-orange-500 text-white border-orange-500'
                                                        : s.canOrder
                                                          ? 'bg-white border-slate-200'
                                                          : 'bg-slate-50 border-slate-100 text-slate-400'
                                                }`}
                                            >
                                                <div className="font-semibold">{s.name}</div>
                                                <div className="text-xs opacity-80">{s.startTime} – {s.endTime}</div>
                                                {!s.canOrder && <div className="text-xs mt-1">Melewati batas pemesanan</div>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {canteens.length > 0 && (
                                <div>
                                    <label className="block text-sm font-semibold mb-2">
                                        <MapPin className="inline w-4 h-4 mr-1" />Kantin
                                    </label>
                                    <select
                                        value={selectedCanteen}
                                        onChange={(e) => setSelectedCanteen(e.target.value)}
                                        className="input-field w-full"
                                    >
                                        {canteens.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <button
                                onClick={handleOrder}
                                disabled={!selectedShift || isOrdering}
                                className="btn-primary w-full flex items-center justify-center gap-2 py-4 text-lg"
                            >
                                {isOrdering ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> Memproses...</>
                                ) : (
                                    'Pesan Sekarang'
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ---- Pre-login: menu tabs + login panel ----
    return (
        <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: 'var(--color-bg-secondary)' }}>
            {/* Menu display */}
            <div className="flex-1 p-4 md:p-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600">
                        <UtensilsCrossed className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold">Kiosk Pemesanan Makan</h1>
                        <p className="text-sm text-slate-500">Lihat menu, masuk, lalu pesan.</p>
                    </div>
                </div>

                <div className="flex gap-3 mb-6 max-w-md">
                    <button
                        onClick={() => setTab('today')}
                        className={`flex-1 py-3 rounded-xl border font-semibold ${
                            tab === 'today' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white border-slate-200'
                        }`}
                    >
                        Hari Ini
                        {todayMenu && <span className="block text-xs font-normal opacity-80">{todayMenu.date} • {todayMenu.dayName}</span>}
                    </button>
                    <button
                        onClick={() => setTab('tomorrow')}
                        className={`flex-1 py-3 rounded-xl border font-semibold ${
                            tab === 'tomorrow' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white border-slate-200'
                        }`}
                    >
                        Besok
                        {tomorrowMenu && <span className="block text-xs font-normal opacity-80">{tomorrowMenu.date} • {tomorrowMenu.dayName}</span>}
                    </button>
                </div>

                {menusLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
                    </div>
                ) : !visibleMenu || visibleMenu.menus.length === 0 ? (
                    <div className="bg-white rounded-2xl border p-10 text-center text-slate-500">
                        Belum ada menu yang dibagikan untuk {tab === 'today' ? 'hari ini' : 'besok'}.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {visibleMenu.menus.map(m => (
                            <div key={m.id} className="bg-white rounded-2xl border overflow-hidden">
                                {m.menuItem.imageUrl && (
                                    <img src={m.menuItem.imageUrl} alt={m.menuItem.name} className="w-full h-40 object-cover" />
                                )}
                                <div className="p-4">
                                    <div className="font-bold text-lg">{m.menuItem.name}</div>
                                    {m.menuItem.description && (
                                        <p className="text-sm text-slate-500 mt-1">{m.menuItem.description}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
                                        {m.shiftName && <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-semibold">{m.shiftName}</span>}
                                        {m.menuItem.vendor && <span>{m.menuItem.vendor.name}</span>}
                                        {m.menuItem.category && <span>• {m.menuItem.category}</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Login panel — always visible beside the menu (Q4/Q9) */}
            <div className="lg:w-[400px] flex items-center justify-center p-6 lg:p-8 lg:border-l" style={{ borderColor: 'var(--color-border)' }}>
                <div className="w-full max-w-[360px]">
                    <div className="bg-white rounded-2xl border p-8">
                        <div className="text-center mb-7">
                            <h2 className="text-xl font-bold">Masuk untuk Memesan</h2>
                            <p className="text-sm mt-1 text-slate-500">Gunakan ID karyawan dan password Anda</p>
                        </div>
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold mb-2">ID Karyawan</label>
                                <div className="relative">
                                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400" />
                                    <input
                                        type="text"
                                        value={externalId}
                                        onChange={(e) => setExternalId(e.target.value)}
                                        placeholder="Masukkan ID karyawan"
                                        className="input-field pl-11"
                                        style={{ padding: '0.75rem 0.875rem 0.75rem 2.75rem' }}
                                        autoComplete="username"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-2">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Masukkan password"
                                        className="input-field pl-11"
                                        style={{ padding: '0.75rem 0.875rem 0.75rem 2.75rem' }}
                                        autoComplete="current-password"
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={loginLoading}
                                className="btn-primary w-full flex items-center justify-center gap-2"
                                style={{ padding: '0.8rem 1.25rem' }}
                            >
                                {loginLoading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</>
                                ) : (
                                    'Masuk'
                                )}
                            </button>
                        </form>
                    </div>
                    <p className="text-center text-xs mt-6 text-slate-400">
                        Perangkat bersama — sesi Anda berakhir otomatis setelah selesai atau 60 detik tanpa aktivitas.
                    </p>
                </div>
            </div>
        </div>
    );
}
