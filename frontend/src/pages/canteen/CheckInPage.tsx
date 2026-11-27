import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { api } from '../../contexts/AuthContext';
import { useSSE, useSSERefresh, ORDER_EVENTS, SETTINGS_EVENTS } from '../../contexts/SSEContext';
import {
    ScanLine, Search, CheckCircle2, AlertTriangle, XCircle, Loader2, X, MapPin, Camera,
    User as UserIcon, Volume2, VolumeX, Wifi, WifiOff, UserCheck, History as HistoryIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Webcam from 'react-webcam';
import { formatTimeWIB } from '../../utils/timezone';
import { Html5Qrcode } from 'html5-qrcode';

/*
 * Check-in counter page.
 *
 * Built for 14-inch operator laptops running a USB barcode scanner (keyboard
 * wedge: types the code, then Enter). Several PCs may share one login, so
 * everything shown here — popup, history, sound — comes only from scans made
 * on THIS browser. Other counters' activity never appears on this screen.
 */

type CheckInOrder = {
    id: string;
    status: string;
    checkInTime?: Date | string;
    user: {
        name: string;
        externalId: string;
        company?: string;
        department?: string | null;
        photo?: string | null;
    };
    shift?: { name: string };
    canteen?: { id: string; name: string; location: string | null } | null;
    canteenId?: string | null;
    checkedInBy?: string | null;
};

type Tone = 'success' | 'warning' | 'error';

interface ScanResult {
    id: number;
    tone: Tone;
    /** Short status, shown huge: BERHASIL, SUDAH DIAMBIL, GAGAL, ... */
    title: string;
    /** One sentence telling the operator what happened. */
    reason?: string;
    /** What to do next, for warnings and failures. */
    hint?: string;
    /** The code exactly as scanned/typed. */
    code: string;
    order?: CheckInOrder;
    checkInBy?: string | null;
    checkInTime?: Date | string | null;
    note?: string;
    at: Date;
}

const TONE = {
    success: { band: '#15803d', soft: '#dcfce7', ring: '#16a34a', Icon: CheckCircle2, ms: 4000 },
    warning: { band: '#b45309', soft: '#fef3c7', ring: '#d97706', Icon: AlertTriangle, ms: 7000 },
    error: { band: '#b91c1c', soft: '#fee2e2', ring: '#dc2626', Icon: XCircle, ms: 7000 },
} as const;

const API_BASE = (import.meta as any).env?.VITE_API_URL || '';
const MAX_QUEUE = 5;
// A USB scanner sometimes reads the same barcode twice; a repeat of a code
// that just succeeded on this PC is ignored instead of flashing "sudah diambil".
const REPEAT_READ_MS = 4000;
const OPERATOR_KEY = 'checkin:operatorName';
const SOUND_KEY = 'checkin:sound';
const CANTEEN_STORAGE_KEY = 'checkin:selectedCanteenId';

const readStorage = (key: string, fallback = '') => {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};
const writeStorage = (key: string, value: string) => {
    try {
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
    } catch { /* private mode / storage disabled */ }
};

// Short audible cue so the operator does not have to look at the screen for
// every scan: one high beep = OK, two beeps = warning, low buzz = failed.
let audioCtx: AudioContext | null = null;
function playCue(tone: Tone) {
    try {
        audioCtx ??= new AudioContext();
        const ctx = audioCtx;
        if (ctx.state === 'suspended') void ctx.resume();
        const steps: [number, number][] = tone === 'success' ? [[1046, 0.12]] : tone === 'warning' ? [[740, 0.12], [740, 0.12]] : [[196, 0.45]];
        let t = ctx.currentTime;
        for (const [freq, dur] of steps) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = tone === 'error' ? 'square' : 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + dur + 0.02);
            t += dur + 0.08;
        }
    } catch { /* audio unavailable: popup still shows */ }
}

const timeOf = (r: ScanResult) => (r.checkInTime ? formatTimeWIB(r.checkInTime) : format(r.at, 'HH:mm:ss'));

/** Large result popup. Never takes keyboard focus, so the scanner keeps typing into the input. */
function ResultPopup({ result, operator, onClose }: { result: ScanResult | null; operator: string; onClose: () => void }) {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!result) return;
        const timer = setTimeout(() => onCloseRef.current(), TONE[result.tone].ms);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
        window.addEventListener('keydown', onKey);
        return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey); };
    }, [result]);

    if (!result) return null;
    const tone = TONE[result.tone];
    const { Icon } = tone;
    const order = result.order;
    const photo = order?.user.photo;
    const isRepeat = result.title === 'SUDAH DIAMBIL';

    const details: [string, string][] = order ? [
        ['Shift', order.shift?.name || '—'],
        ['Kantin', order.canteen?.name || '—'],
        [isRepeat ? 'Diambil pukul' : 'Waktu', timeOf(result)],
        [isRepeat ? 'Dicatat oleh' : 'Petugas', result.checkInBy || '—'],
    ] : [];

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(12,10,9,0.55)] p-3"
            onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <style>{'@keyframes ck-shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}@keyframes ck-pop{from{transform:scale(.96);opacity:.4}to{transform:scale(1);opacity:1}}'}</style>
            <div
                key={result.id}
                role={result.tone === 'success' ? 'status' : 'alert'}
                aria-live="assertive"
                className="flex max-h-[calc(100dvh-24px)] w-[min(94vw,900px)] flex-col overflow-hidden rounded-3xl bg-[#ffffff] shadow-2xl"
                style={{ animation: 'ck-pop 140ms ease-out', outline: `6px solid ${tone.ring}` }}
            >
                {/* Status band: colour + icon + word, so it reads from across the counter. */}
                <div className="flex items-center gap-5 px-8 py-5" style={{ background: tone.band, color: '#ffffff' }}>
                    <Icon className="h-[72px] w-[72px] flex-shrink-0" strokeWidth={2.5} />
                    <div className="min-w-0">
                        <p className="text-[44px] font-black uppercase leading-none tracking-tight">{result.title}</p>
                        {result.reason && <p className="mt-2 text-xl font-semibold leading-snug opacity-95">{result.reason}</p>}
                    </div>
                </div>

                <div className="min-h-0 overflow-y-auto px-8 py-6">
                    {order ? (
                        <div className="flex items-center gap-6">
                            <div className="h-36 w-36 flex-shrink-0 overflow-hidden rounded-2xl bg-stone-100" style={{ boxShadow: `0 0 0 4px ${tone.soft}` }}>
                                {photo ? (
                                    <img src={`${API_BASE}${photo}`} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center"><UserIcon className="h-16 w-16 text-stone-400" /></div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="line-clamp-2 break-words text-[40px] font-black leading-[1.1] text-stone-900">{order.user.name}</p>
                                <p className="mt-2 font-mono text-2xl font-semibold text-stone-600">{order.user.externalId}</p>
                                {order.user.department && <p className="mt-1 truncate text-lg text-stone-500">{order.user.department}</p>}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <p className="text-lg font-medium text-stone-500">Kode yang dipindai</p>
                            <p className="mt-1 break-all font-mono text-[34px] font-bold leading-tight text-stone-900">{result.code || '—'}</p>
                        </div>
                    )}

                    {details.length > 0 && (
                        <div className="mt-5 grid grid-cols-4 gap-3">
                            {details.map(([label, value]) => (
                                <div key={label} className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                                    <p className="text-sm font-medium text-stone-500">{label}</p>
                                    <p className="mt-0.5 truncate text-xl font-bold text-stone-900" title={value}>{value}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {result.hint && (
                        <p className="mt-5 rounded-xl px-5 py-3 text-xl font-semibold" style={{ background: tone.soft, color: tone.band }}>
                            {result.hint}
                        </p>
                    )}
                    {result.note && <p className="mt-3 text-base text-stone-500">{result.note}</p>}
                </div>

                <div className="border-t border-stone-200">
                    <div className="h-1.5 origin-left" style={{ background: tone.ring, animation: `ck-shrink ${tone.ms}ms linear forwards` }} />
                    <div className="flex items-center justify-between gap-4 px-8 py-3">
                        <p className="truncate text-base text-stone-500">
                            {operator ? `Operator: ${operator} · ` : ''}Scan berikutnya bisa langsung dipindai
                        </p>
                        <button
                            type="button"
                            tabIndex={-1}
                            onClick={onClose}
                            className="flex-shrink-0 rounded-xl px-6 py-2.5 text-lg font-bold"
                            style={{ background: tone.band, color: '#ffffff' }}
                        >
                            Tutup (Esc)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Clock in its own component so the page does not re-render every second. */
function LiveClock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    return <span className="tabular-nums">{format(now, 'EEEE, dd MMM yyyy · HH:mm:ss', { locale: idLocale })}</span>;
}

export default function CheckInPage() {
    const { isConnected } = useSSE();
    const [searchInput, setSearchInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [queued, setQueued] = useState(0);
    const [popup, setPopup] = useState<ScanResult | null>(null);
    const [history, setHistory] = useState<ScanResult[]>([]);
    const resultSeq = useRef(0);
    const [todayStats, setTodayStats] = useState<{ total: number; checkedIn: number; pending: number; noShow: number; cancelled: number } | null>(null);
    const [statsError, setStatsError] = useState(false);
    const statsRequest = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const webcamRef = useRef<Webcam>(null);
    const [photoEnabled, setPhotoEnabled] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    const [enforceCanteenCheckin, setEnforceCanteenCheckin] = useState(false);
    const [soundOn, setSoundOn] = useState(() => readStorage(SOUND_KEY, '1') === '1');
    const soundRef = useRef(soundOn);
    soundRef.current = soundOn;
    // Shared logins: the operator types their name once on this PC so the
    // popup and the audit log show who recorded a pickup. Remembered per browser.
    const [operator, setOperatorState] = useState(() => readStorage(OPERATOR_KEY));
    const setOperator = (value: string) => { setOperatorState(value); writeStorage(OPERATOR_KEY, value.trim()); };
    // The counter is remembered per device (browser), not per account.
    const [selectedCanteenId, setSelectedCanteenIdState] = useState<string>(() => readStorage(CANTEEN_STORAGE_KEY));
    const setSelectedCanteenId = useCallback((id: string) => {
        setSelectedCanteenIdState(id);
        writeStorage(CANTEEN_STORAGE_KEY, id);
    }, []);
    const [canteens, setCanteens] = useState<{ id: string; name: string; location: string | null }[]>([]);
    const [showQRScanner, setShowQRScanner] = useState(false);
    const qrScannerRef = useRef<Html5Qrcode | null>(null);
    const qrContainerRef = useRef<HTMLDivElement>(null);

    // ---------- Statistics ----------
    const [focusInfo, setFocusInfo] = useState<{
        scope: 'break' | 'all';
        shiftNames: string[];
        breakStart?: string;
        breakEnd?: string;
        nextBreak?: { breakStart: string; shiftNames: string[] };
        nextRefreshAt?: string;
        upcoming?: boolean;
    } | null>(null);

    const loadStats = useCallback(async () => {
        const request = ++statsRequest.current;
        try {
            const params: Record<string, string> = { fresh: '1' };
            if (selectedCanteenId) params.canteenId = selectedCanteenId;
            const res = await api.get('/api/orders/stats/today', { params });
            if (request !== statsRequest.current) return;
            setStatsError(false);
            setTodayStats({
                total: res.data.focusCards?.total ?? res.data.total,
                checkedIn: res.data.focusCards?.pickedUp ?? res.data.pickedUp,
                pending: res.data.focusCards?.pending ?? res.data.pending,
                noShow: res.data.focusCards?.noShow ?? (res.data.noShow || 0),
                cancelled: res.data.focusCards?.cancelled ?? (res.data.cancelled || 0),
            });
            setFocusInfo(res.data.focus ?? null);
        } catch (error) {
            if (request === statsRequest.current) setStatsError(true);
            console.error('Failed to load stats:', error);
        }
    }, [selectedCanteenId]);

    // Every pickup at any of the counters fires an SSE event on every
    // screen; coalesce bursts into one request per ~1.5s per screen.
    const statsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadStatsRef = useRef(loadStats);
    loadStatsRef.current = loadStats;
    const scheduleStats = useCallback(() => {
        if (statsTimer.current) return;
        statsTimer.current = setTimeout(() => {
            statsTimer.current = null;
            void loadStatsRef.current();
        }, 1500);
    }, []);
    useEffect(() => () => { if (statsTimer.current) clearTimeout(statsTimer.current); }, []);

    useEffect(() => {
        setTodayStats(null);
        setFocusInfo(null);
        setStatsError(false);
        void loadStats();
        return () => { ++statsRequest.current; };
    }, [loadStats]);
    useEffect(() => {
        if (isConnected) void loadStats();
        const timer = setInterval(loadStats, 30000);
        return () => clearInterval(timer);
    }, [loadStats, isConnected]);
    useEffect(() => {
        const boundary = Date.parse(focusInfo?.nextRefreshAt || '');
        if (!Number.isFinite(boundary) || boundary <= Date.now()) return;
        const timeout = setTimeout(loadStats, boundary - Date.now());
        return () => clearTimeout(timeout);
    }, [focusInfo?.nextRefreshAt, loadStats]);
    useSSERefresh(ORDER_EVENTS, scheduleStats);

    // ---------- Settings & counter ----------
    const fetchSettings = useCallback(async () => {
        try {
            const [settingsRes, canteensRes] = await Promise.all([
                api.get('/api/settings'),
                api.get('/api/canteens'),
            ]);
            setPhotoEnabled(settingsRes.data.checkinPhotoEnabled || false);
            setEnforceCanteenCheckin(settingsRes.data.enforceCanteenCheckin || false);
            setCanteens(canteensRes.data.canteens || []);
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }, []);
    useEffect(() => { void fetchSettings(); }, [fetchSettings]);
    useSSERefresh(SETTINGS_EVENTS, fetchSettings);

    // Resolve the counter this device works for:
    // 1. a counter this device already chose (shared login, several counters)
    // 2. otherwise the account's preferred canteen
    // 3. otherwise nothing, so the operator must pick one
    useEffect(() => {
        if (canteens.length === 0) return;
        if (selectedCanteenId && !canteens.some(c => c.id === selectedCanteenId)) {
            setSelectedCanteenId('');
            return;
        }
        if (selectedCanteenId) return;
        api.get('/api/auth/me')
            .then(({ data }) => {
                const preferred = data?.preferredCanteenId;
                if (data?.role === 'CANTEEN' && preferred && canteens.some(c => c.id === preferred)) {
                    setSelectedCanteenId(preferred);
                }
            })
            .catch(() => { /* operator can still pick manually */ });
    }, [canteens, selectedCanteenId, setSelectedCanteenId]);

    // ---------- Results ----------
    const focusInput = () => requestAnimationFrame(() => inputRef.current?.focus());
    const showResult = (r: Omit<ScanResult, 'id' | 'at'>) => {
        const result: ScanResult = { ...r, id: ++resultSeq.current, at: new Date() };
        setHistory(prev => [result, ...prev].slice(0, 12));
        setPopup(result);
        if (soundRef.current) playCue(result.tone);
    };
    const closePopup = () => { setPopup(null); focusInput(); };

    // ---------- Pickup photo ----------
    const pendingPhotoAction = useRef<((photo?: Blob, cancelled?: boolean) => void) | null>(null);
    const photoAnswer = () => new Promise<Blob | null>(resolve => {
        pendingPhotoAction.current = (blob, cancelled) => resolve(cancelled ? null : blob ?? new Blob());
        setShowCamera(true);
    });
    const finishPhoto = (photo?: Blob, cancelled = false) => {
        pendingPhotoAction.current?.(photo, cancelled);
        pendingPhotoAction.current = null;
        setShowCamera(false);
    };
    const capturePhoto = async () => {
        const action = pendingPhotoAction.current;
        const image = webcamRef.current?.getScreenshot();
        if (!image) { toast.error('Kamera belum siap. Coba lagi atau lanjut tanpa foto.'); return; }
        try {
            const blob = await (await fetch(image)).blob();
            if (pendingPhotoAction.current === action) finishPhoto(blob);
        } catch { toast.error('Foto gagal dibaca. Coba lagi atau lanjut tanpa foto.'); }
    };

    // ---------- Camera barcode scanner ----------
    const scannerSession = useRef(0);
    const cameraBusy = useRef(false);
    const closeQRScanner = useCallback(() => {
        ++scannerSession.current;
        setShowQRScanner(false);
        requestAnimationFrame(() => inputRef.current?.focus());
        const scanner = qrScannerRef.current;
        if (!scanner || cameraBusy.current) return;
        qrScannerRef.current = null;
        cameraBusy.current = true;
        void scanner.stop().catch(console.error).finally(() => {
            cameraBusy.current = false;
        });
    }, []);
    useEffect(() => () => {
        ++scannerSession.current;
        const scanner = qrScannerRef.current;
        if (scanner?.isScanning && !cameraBusy.current) void scanner.stop().catch(console.error);
        pendingPhotoAction.current?.(undefined, true);
    }, []);

    const openQRScanner = async () => {
        if (enforceCanteenCheckin && !selectedCanteenId) { toast.error('Pilih kantin terlebih dahulu'); return; }
        if (cameraBusy.current || qrScannerRef.current) { toast.error('Kamera belum siap. Coba lagi.'); return; }
        const session = ++scannerSession.current;
        cameraBusy.current = true;
        setShowQRScanner(true);
        let scanner: Html5Qrcode | undefined;
        let acceptedCode: string | undefined;
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (scannerSession.current !== session || !qrContainerRef.current) return;
            scanner = new Html5Qrcode('qr-reader');
            qrScannerRef.current = scanner;
            await scanner.start({ facingMode: 'environment' }, { fps: 10 }, text => {
                if (scannerSession.current !== session || acceptedCode) return;
                if (!cameraBusy.current && scanner?.isScanning) {
                    const acceptedSession = ++scannerSession.current;
                    cameraBusy.current = true;
                    void scanner.stop().catch(console.error).finally(() => {
                        cameraBusy.current = false;
                        qrScannerRef.current = null;
                        if (scannerSession.current !== acceptedSession) return;
                        setShowQRScanner(false);
                        void handleRef.current('qr', text);
                    });
                } else acceptedCode = text;
            }, () => {});
        } catch (error) {
            if (scannerSession.current === session) {
                console.error(error);
                toast.error('Kamera tidak dapat dibuka. Periksa izin lalu coba lagi.');
                closeQRScanner();
            }
        } finally {
            if (scannerSession.current !== session || acceptedCode) {
                if (scanner?.isScanning) await scanner.stop().catch(console.error);
                qrScannerRef.current = null;
                if (scannerSession.current === session && acceptedCode) {
                    setShowQRScanner(false);
                    void handleRef.current('qr', acceptedCode);
                }
            }
            cameraBusy.current = false;
        }
    };

    // ---------- Check-in ----------
    const [candidates, setCandidates] = useState<{ userId: string; externalId: string; name: string; department: string | null }[]>([]);
    const inFlight = useRef(false);
    const activeCode = useRef<string | null>(null);
    // Scans that arrive while one is being processed wait here (FIFO) so a
    // fast line of people is not dropped. Disabled when photos are on,
    // because each pickup then needs the operator at the camera.
    const queue = useRef<string[]>([]);
    const recentSuccess = useRef<Map<string, number>>(new Map());

    const clearInput = () => {
        if (inputRef.current) inputRef.current.value = '';
        setSearchInput('');
    };

    const describeFailure = (error: any, code: string): Omit<ScanResult, 'id' | 'at'> => {
        const res = error?.response;
        const data = res?.data || {};
        const status: number | undefined = res?.status;
        const serverText: string = data.message || data.error || '';

        if (!res || (status ?? 0) >= 500) {
            return {
                tone: 'error', code, title: 'Hasil belum pasti',
                reason: 'Server tidak merespons dengan benar.',
                hint: 'Cek pesanan karyawan ini sebelum memindai ulang.',
            };
        }
        if (data.code === 'ALREADY_PICKED_UP' || /sudah di-check in sebelumnya/i.test(data.error || '')) {
            return {
                tone: 'warning', code, title: 'SUDAH DIAMBIL',
                reason: 'Makanan untuk pesanan ini sudah diambil sebelumnya.',
                hint: 'Jangan berikan makanan lagi.',
                order: data.order,
                checkInBy: data.checkedInBy || data.order?.checkedInBy,
                checkInTime: data.checkInTime || data.order?.checkInTime,
            };
        }
        if (status === 403 && (data.orderCanteen !== undefined || /kantin/i.test(data.error || ''))) {
            return {
                tone: 'warning', code, title: 'Salah kantin',
                reason: serverText || 'Pesanan ini untuk kantin lain.',
                hint: data.orderCanteen ? `Arahkan ke kantin ${data.orderCanteen}.` : 'Arahkan ke kantin yang benar.',
            };
        }
        if (status === 409) {
            return { tone: 'warning', code, title: 'Perlu dicek', reason: serverText, hint: 'Cari dengan nama lalu pilih karyawan yang benar.' };
        }
        if (status === 404) {
            const noOrder = /pesanan/i.test(data.error || '');
            return {
                tone: 'error', code,
                title: noOrder ? 'Tidak ada pesanan' : 'Tidak ditemukan',
                reason: data.error || 'Data tidak ditemukan.',
                hint: noOrder ? 'Karyawan ini tidak memesan makan untuk shift ini.' : 'Periksa kartu/barcode, atau cari dengan nama.',
            };
        }
        if (/dibatalkan/i.test(data.error || '')) {
            return { tone: 'warning', code, title: 'Pesanan dibatalkan', reason: serverText, hint: 'Makanan tidak boleh diberikan.' };
        }
        if (status === 400 && data.message) {
            // Outside the shift's pickup window (server gives the details).
            return { tone: 'warning', code, title: 'Belum bisa diambil', reason: data.message, hint: data.error && data.error !== data.message ? data.error : undefined };
        }
        return { tone: 'error', code, title: 'Gagal', reason: serverText || 'Check-in tidak dapat diproses.' };
    };

    const handleCheckIn = async (method: 'manual' | 'qr', scannedCode?: string, userId?: string) => {
        // Read the DOM directly: rapid scans outrun React state updates.
        const codeToUse = (scannedCode ?? inputRef.current?.value ?? searchInput).trim();
        if (scannedCode === undefined) clearInput();

        if (!codeToUse) {
            if (method === 'qr') void openQRScanner();
            return;
        }

        if (enforceCanteenCheckin && !selectedCanteenId) {
            showResult({ tone: 'warning', code: codeToUse, title: 'Pilih kantin dulu', reason: 'Pos check-in PC ini belum dipilih.', hint: 'Pilih kantin di bagian atas, lalu pindai ulang.' });
            return;
        }

        // USB scanners arrive as 'manual'; order codes (ORDER-...) go to the
        // QR endpoint. Camera scans of ID cards go to the manual endpoint.
        const isOrderCode = !userId && /^ORDER-/i.test(codeToUse);
        if (isOrderCode) method = 'qr';
        else if (method === 'qr') method = 'manual';

        const key = codeToUse.toUpperCase();
        if (!userId) {
            const last = recentSuccess.current.get(key);
            if (last && Date.now() - last < REPEAT_READ_MS) return; // scanner double-read
        }

        if (inFlight.current) {
            if (!userId && (key === activeCode.current || queue.current.some(q => q.toUpperCase() === key))) return;
            if (!userId && !photoEnabled && queue.current.length < MAX_QUEUE) {
                queue.current.push(codeToUse);
                setQueued(queue.current.length);
            } else {
                showResult({
                    tone: 'warning', code: codeToUse, title: 'Scan belum diterima',
                    reason: photoEnabled ? 'Selesaikan foto pengambilan sebelumnya dulu.' : 'Antrean scan penuh.',
                    hint: 'Pindai ulang kode ini setelah pos siap.',
                });
            }
            return;
        }

        inFlight.current = true;
        activeCode.current = key;
        setCandidates([]);
        setIsProcessing(true);

        try {
            if (method === 'manual' && !userId) {
                const { data } = await api.get('/api/orders/checkin/lookup', { params: { query: codeToUse } });
                if (data.match === 'selection') {
                    setCandidates(data.candidates);
                    setPopup(null);
                    if (queue.current.length) {
                        queue.current = [];
                        setQueued(0);
                        toast.error('Antrean dihentikan. Pilih karyawan, lalu pindai ulang kode berikutnya.');
                    }
                    return;
                }
                userId = data.candidates?.[0]?.userId;
                if (!userId) {
                    showResult({ tone: 'error', code: codeToUse, title: 'Tidak ditemukan', reason: 'ID / kode ini tidak terdaftar.', hint: 'Periksa kartu/barcode, atau cari dengan nama.' });
                    return;
                }
            }
            const photo = photoEnabled ? await photoAnswer() : undefined;
            if (photo === null) return; // operator cancelled the photo dialog
            const formData = new FormData();
            formData.append(method === 'qr' ? 'qrCode' : 'userId', userId || codeToUse);
            if (selectedCanteenId) formData.append('operatorCanteenId', selectedCanteenId);
            if (operator.trim()) formData.append('operatorName', operator.trim());
            if (photo?.size) formData.append('photo', photo, 'checkin.webp');
            const res = await api.post(`/api/orders/checkin/${method}`, formData);

            recentSuccess.current.set(key, Date.now());
            if (recentSuccess.current.size > 50) {
                const cutoff = Date.now() - REPEAT_READ_MS;
                recentSuccess.current.forEach((t, k) => { if (t < cutoff) recentSuccess.current.delete(k); });
            }
            showResult({
                tone: 'success', code: codeToUse, title: 'BERHASIL',
                reason: 'Silakan berikan makanan.',
                order: res.data.order,
                checkInBy: operator.trim() || res.data.checkInBy || res.data.checkedInBy,
                checkInTime: res.data.checkInTime,
                note: res.data.photoStatus === 'saved' ? 'Foto bukti tersimpan.' : res.data.photoStatus === 'failed' ? 'Foto bukti gagal disimpan (check-in tetap tercatat).' : undefined,
            });
            scheduleStats();
        } catch (error: any) {
            showResult(describeFailure(error, codeToUse));
        } finally {
            inFlight.current = false;
            activeCode.current = null;
            setIsProcessing(false);
            const next = queue.current.shift();
            setQueued(queue.current.length);
            if (next) void handleRef.current('manual', next);
            else focusInput();
        }
    };
    const handleRef = useRef(handleCheckIn);
    handleRef.current = handleCheckIn;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== 'Enter' || e.repeat || e.nativeEvent.isComposing) return;
        e.preventDefault();
        void handleCheckIn('manual');
    };

    // Keep the scanner working even if the operator clicked elsewhere: any
    // keystroke that lands outside a form field is sent to the scan input.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
            if (document.querySelector('dialog[open]')) return;
            const el = document.activeElement as HTMLElement | null;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
            const input = inputRef.current;
            if (!input) return;
            if (e.key.length === 1) {
                e.preventDefault();
                input.focus();
                input.value += e.key;
                setSearchInput(input.value);
            } else if (e.key === 'Enter' && input.value.trim()) {
                e.preventDefault();
                input.focus();
                void handleRef.current('manual');
            }
        };
        const onFocus = () => { if (!document.querySelector('dialog[open]')) inputRef.current?.focus(); };
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('focus', onFocus);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    const selectedCanteen = canteens.find(c => c.id === selectedCanteenId);
    const statTile = (label: string, value: number | undefined, color: string, big = false) => (
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
            <p className={`${big ? 'text-4xl' : 'text-2xl'} font-black tabular-nums leading-tight`} style={{ color }}>{value ?? '—'}</p>
        </div>
    );

    return (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
            {/* Top bar: which counter and which PC this screen is. */}
            <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#e7e5e4] bg-[#fff] px-4 py-3">
                <div className="flex min-w-[15rem] flex-1 items-center gap-2">
                    <MapPin className="h-5 w-5 flex-shrink-0 text-amber-600" />
                    <label htmlFor="checkin-canteen" className="whitespace-nowrap text-sm font-semibold text-stone-600">Pos</label>
                    <select
                        id="checkin-canteen"
                        disabled={isProcessing || showQRScanner}
                        value={selectedCanteenId}
                        onChange={(e) => { setSelectedCanteenId(e.target.value); focusInput(); }}
                        className={`h-10 w-full max-w-xs rounded-lg border px-3 text-base font-semibold ${selectedCanteenId ? 'border-stone-300 bg-[#ffffff] text-stone-900' : 'border-amber-500 bg-amber-50 text-amber-800'}`}
                    >
                        <option value="">-- Pilih Kantin --</option>
                        {canteens.map(c => (
                            <option key={c.id} value={c.id}>{c.name}{c.location ? ` (${c.location})` : ''}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 flex-shrink-0 text-stone-500" />
                    <label htmlFor="checkin-operator" className="whitespace-nowrap text-sm font-semibold text-stone-600">Nama Operator</label>
                    <input
                        id="checkin-operator"
                        value={operator}
                        maxLength={40}
                        placeholder="Nama Anda"
                        onChange={e => setOperator(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusInput(); } }}
                        className="h-10 w-48 rounded-lg border border-stone-300 bg-[#ffffff] px-3 text-sm text-stone-900"
                    />
                </div>
                <span
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold"
                    style={isConnected ? { background: '#dcfce7', color: '#166534' } : { background: '#fee2e2', color: '#991b1b' }}
                >
                    {isConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                    {isConnected ? 'Online' : 'Sinkronisasi terputus'}
                </span>
                <button
                    type="button"
                    onClick={() => { const next = !soundOn; setSoundOn(next); writeStorage(SOUND_KEY, next ? '1' : '0'); focusInput(); }}
                    aria-pressed={soundOn}
                    title={soundOn ? 'Matikan suara' : 'Nyalakan suara'}
                    className="flex h-10 items-center gap-1.5 rounded-lg border border-stone-300 px-3 text-sm font-semibold text-stone-700"
                >
                    {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    {soundOn ? 'Suara on' : 'Suara off'}
                </button>
                <span className="text-sm text-stone-500"><LiveClock /></span>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                {/* Scan area */}
                <section className="flex flex-col rounded-[14px] border border-[#e7e5e4] bg-[#fff] p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <h2 className="text-2xl font-black text-stone-900">Check-in Ambil Makan</h2>
                        <span
                            role="status"
                            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold"
                            style={isProcessing ? { background: '#fef3c7', color: '#92400e' } : { background: '#dcfce7', color: '#166534' }}
                        >
                            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#16a34a' }} />}
                            {isProcessing ? `Memproses${queued ? ` · ${queued} antre` : ''}` : 'Siap scan'}
                        </span>
                    </div>

                    <div className="relative">
                        <Search className="pointer-events-none absolute left-5 top-1/2 h-7 w-7 -translate-y-1/2 text-stone-400" />
                        <input
                            aria-label="ID karyawan, nama, atau barcode"
                            ref={inputRef}
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="Scan barcode / ketik ID atau nama"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="h-20 w-full rounded-2xl border-2 border-stone-300 bg-[#ffffff] pl-16 pr-5 text-2xl font-semibold tracking-wide text-stone-900 outline-none transition-colors placeholder:font-normal placeholder:text-stone-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                        />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <button onClick={() => handleCheckIn('manual')} disabled={!searchInput.trim()} className="flex h-14 items-center justify-center gap-2 rounded-[10px] bg-[#15803d] text-[#fff] hover:bg-[#166534] disabled:opacity-50 disabled:cursor-not-allowed text-lg font-bold transition-colors">
                            <CheckCircle2 className="h-6 w-6" />Ambil Makan
                        </button>
                        <button onClick={openQRScanner} disabled={isProcessing} className="flex h-14 items-center justify-center gap-2 rounded-[10px] bg-[#f59e0b] text-[#1c1917] hover:bg-[#d97706] disabled:opacity-50 disabled:cursor-not-allowed text-lg font-bold transition-colors">
                            <Camera className="h-6 w-6" />Scan pakai kamera
                        </button>
                    </div>

                    {candidates.length > 0 && (
                        <section className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3" aria-label="Hasil pencarian karyawan">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-base font-bold text-amber-900">Beberapa karyawan cocok. Pilih satu:</p>
                                <button type="button" onClick={() => { setCandidates([]); focusInput(); }} className="text-sm font-semibold text-amber-800 underline">Batal</button>
                            </div>
                            <div className="grid max-h-48 gap-2 overflow-y-auto">
                                {candidates.map(candidate => (
                                    <button key={candidate.userId} type="button" className="rounded-lg border border-amber-300 bg-[#ffffff] px-4 py-2.5 text-left text-base font-semibold text-stone-900 hover:bg-amber-100" onClick={() => handleCheckIn('manual', candidate.externalId, candidate.userId)}>
                                        {candidate.name} <span className="font-mono text-stone-500">· {candidate.externalId}</span>{candidate.department && <span className="text-stone-500"> · {candidate.department}</span>}
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    <p className="mt-auto pt-3 text-sm text-stone-500">
                        Scanner USB langsung memproses setiap scan (Enter otomatis). Jika kursor pindah, ketikan scanner tetap masuk ke kolom ini.
                        {photoEnabled && ' Foto bukti aktif: antrean scan dimatikan.'}
                    </p>
                </section>

                {/* Stats + this PC's history */}
                <div className="flex min-h-0 flex-col gap-3">
                    <section className="rounded-[14px] border border-[#e7e5e4] bg-[#fff] p-4">
                        <p className="mb-2 truncate text-sm text-stone-600">
                            {focusInfo?.scope === 'break' && focusInfo.breakStart && focusInfo.breakEnd ? (
                                <>{focusInfo.upcoming ? 'Istirahat berikutnya' : 'Istirahat'} {focusInfo.breakStart}–{focusInfo.breakEnd} · <span className="font-bold text-amber-700">{focusInfo.shiftNames.join(', ')}</span></>
                            ) : focusInfo?.nextBreak ? (
                                <>Semua shift · berikutnya {focusInfo.nextBreak.breakStart} ({focusInfo.nextBreak.shiftNames.join(', ')})</>
                            ) : (
                                <>Semua shift · sepanjang hari</>
                            )}
                            {' · '}<span className="font-semibold">{selectedCanteen ? selectedCanteen.name : 'Semua kantin'}</span>
                            {statsError && <span className="font-semibold text-red-700"> · data belum diperbarui</span>}
                            {!todayStats && !statsError && <span> · memuat…</span>}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {statTile('Diambil', todayStats?.checkedIn, '#15803d', true)}
                            {statTile('Belum diambil', todayStats?.pending, '#b45309', true)}
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            {statTile('Total', todayStats?.total, '#1c1917')}
                            {statTile('Dibatalkan', todayStats?.cancelled, '#57534e')}
                            {statTile('Tidak diambil', todayStats?.noShow, '#b91c1c')}
                        </div>
                    </section>

                    <section className="flex min-h-0 flex-1 flex-col rounded-[14px] border border-[#e7e5e4] bg-[#fff] p-4">
                        <div className="mb-2 flex items-center gap-2">
                            <HistoryIcon className="h-4 w-4 text-stone-500" />
                            <h3 className="text-sm font-bold uppercase tracking-wide text-stone-600">Scan terakhir di PC ini</h3>
                        </div>
                        {history.length === 0 ? (
                            <p className="py-4 text-center text-sm text-stone-400">Belum ada scan.</p>
                        ) : (
                            <ol className="-mr-1 max-h-[11rem] space-y-1 overflow-y-auto pr-1">
                                {history.map(r => {
                                    const tone = TONE[r.tone];
                                    return (
                                        <li key={r.id}>
                                            <button
                                                type="button"
                                                tabIndex={-1}
                                                onClick={() => setPopup(r)}
                                                className="flex w-full items-center gap-2.5 rounded-lg border-l-[6px] bg-stone-50 px-3 py-1.5 text-left hover:bg-stone-100"
                                                style={{ borderLeftColor: tone.ring }}
                                            >
                                                <tone.Icon className="h-5 w-5 flex-shrink-0" style={{ color: tone.band }} />
                                                <span className="min-w-0 flex-1 truncate text-base font-bold text-stone-900">{r.order?.user.name || r.code}</span>
                                                <span className="flex-shrink-0 text-xs font-bold uppercase" style={{ color: tone.band }}>{r.title}</span>
                                                <span className="flex-shrink-0 font-mono text-sm tabular-nums text-stone-500">{format(r.at, 'HH:mm:ss')}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                    </section>
                </div>
            </div>

            {showCamera && (
                <dialog ref={node => { if (node && !node.open) node.showModal(); }} aria-labelledby="pickup-photo-title" onCancel={e => { e.preventDefault(); finishPhoto(undefined, true); }} className="m-auto max-h-[90dvh] w-[min(92vw,32rem)] overflow-auto rounded-xl bg-[#ffffff] p-4 text-stone-900 backdrop:bg-black/60">
                    <h2 id="pickup-photo-title" className="mb-3 text-lg font-bold">Foto bukti pengambilan</h2>
                    <Webcam audio={false} ref={webcamRef} screenshotFormat="image/webp" className="max-h-[55dvh] w-full object-contain" onUserMediaError={() => toast.error('Kamera tidak tersedia. Lanjut tanpa foto.')} />
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button className="h-10 rounded-[10px] border border-[#e7e5e4] bg-[#fff] px-4 text-sm font-semibold text-[#44403c] hover:bg-[#fafaf9]" onClick={() => finishPhoto(undefined, true)}>Batal</button>
                        <button className="h-10 rounded-[10px] border border-[#e7e5e4] bg-[#fff] px-4 text-sm font-semibold text-[#44403c] hover:bg-[#fafaf9]" onClick={() => finishPhoto()}>Lanjut tanpa foto</button>
                        <button className="h-10 rounded-[10px] bg-[#f59e0b] px-4 text-sm font-bold text-[#1c1917] hover:bg-[#d97706]" onClick={capturePhoto}>Ambil foto</button>
                    </div>
                </dialog>
            )}

            <ResultPopup result={popup} operator={operator.trim()} onClose={closePopup} />

            {showQRScanner && (
                <dialog ref={node => { if (node && !node.open) node.showModal(); }} aria-labelledby="barcode-scanner-title" onCancel={event => { event.preventDefault(); closeQRScanner(); }} className="m-auto max-h-[90dvh] w-[min(92vw,32rem)] overflow-auto rounded-xl bg-transparent backdrop:bg-black/60">
                    <div className="w-full max-w-lg space-y-4 rounded-[14px] border border-[#e7e5e4] bg-[#fff] p-6 text-[#1c1917] shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#fef3c7]">
                                    <ScanLine className="h-6 w-6 text-[#b45309]" />
                                </div>
                                <div>
                                    <h3 id="barcode-scanner-title" className="text-xl font-bold">Pindai barcode / QR</h3>
                                    <p className="text-sm text-[#78716c]">Arahkan kamera ke kode pesanan atau kartu karyawan</p>
                                </div>
                            </div>
                            <button onClick={closeQRScanner} aria-label="Tutup kamera" className="rounded-[8px] p-2 hover:bg-[#f5f5f4]">
                                <X className="h-6 w-6" />
                            </button>
                        </div>
                        <div ref={qrContainerRef} id="qr-reader" className="aspect-video w-full overflow-hidden rounded-[12px] bg-[#0f172a]" />
                        <button onClick={closeQRScanner} className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-[#e7e5e4] bg-[#fff] font-semibold text-[#44403c] hover:bg-[#fafaf9]">
                            <X className="h-5 w-5" />Batal
                        </button>
                    </div>
                </dialog>
            )}
        </div>
    );
}
