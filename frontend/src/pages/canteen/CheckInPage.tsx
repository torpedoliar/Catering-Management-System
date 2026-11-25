import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { api } from '../../contexts/AuthContext';
import { useSSE, useSSERefresh, ORDER_EVENTS, SETTINGS_EVENTS } from '../../contexts/SSEContext';
import { ScanLine, Search, CheckCircle2, AlertCircle, Loader2, X, Zap, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import Webcam from 'react-webcam';
import { formatTimeWIB } from '../../utils/timezone';
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
        canteenId?: string | null;
        checkedInBy?: string | null;
    };
    checkInBy?: string;
    checkInTime?: Date | string;
}

export default function CheckInPage() {
    const { isConnected, subscribe } = useSSE();
    const [searchInput, setSearchInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [successData, setSuccessData] = useState<CheckInResult | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const [todayStats, setTodayStats] = useState<{ total: number; checkedIn: number; pending: number; noShow: number; cancelled: number } | null>(null);
    const [statsError, setStatsError] = useState(false);
    const statsRequest = useRef(0);
    const [currentTime, setCurrentTime] = useState(new Date());
    const inputRef = useRef<HTMLInputElement>(null);
    const webcamRef = useRef<Webcam>(null);
    const [photoEnabled, setPhotoEnabled] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    // Canteen check-in enforcement
    const [enforceCanteenCheckin, setEnforceCanteenCheckin] = useState(false);
    // One login can be shared by several counters, so the chosen counter is
    // remembered per device (browser), not per account.
    const CANTEEN_STORAGE_KEY = 'checkin:selectedCanteenId';
    const [selectedCanteenId, setSelectedCanteenIdState] = useState<string>(() => {
        try { return localStorage.getItem(CANTEEN_STORAGE_KEY) || ''; } catch { return ''; }
    });
    const setSelectedCanteenId = useCallback((id: string) => {
        setSelectedCanteenIdState(id);
        try {
            if (id) localStorage.setItem(CANTEEN_STORAGE_KEY, id);
            else localStorage.removeItem(CANTEEN_STORAGE_KEY);
        } catch { /* private mode / storage disabled */ }
    }, []);
    const [canteens, setCanteens] = useState<{ id: string; name: string; location: string | null }[]>([]);
    // QR Scanner state
    const [showQRScanner, setShowQRScanner] = useState(false);
    const qrScannerRef = useRef<Html5Qrcode | null>(null);
    const qrContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // The five stat cards show the shift(s) whose meal break is active (or
    // starting within an hour) — server decides via `focusCards`. `null`
    // metadata means the backend predates this and we show all-day totals.
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
            const params: Record<string, string> = {};
            // Q10b: break boundaries must be seen immediately, skip the 60s cache.
            params.fresh = '1';
            // Q4a: scope the numbers to this device's counter when chosen.
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
    useSSERefresh(ORDER_EVENTS, loadStats);

    const [remotePickup, setRemotePickup] = useState<CheckInResult['order']>();
    useEffect(() => subscribe('order:checkin', (data: { order?: CheckInResult['order'] }) => {
        const order = data?.order;
        if (order?.user && (!selectedCanteenId || !order.canteenId || order.canteenId === selectedCanteenId)) setRemotePickup(order);
    }), [subscribe, selectedCanteenId]);

    const fetchSettings = useCallback(async () => {
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
    }, []);
    useEffect(() => { void fetchSettings(); }, [fetchSettings]);
    useSSERefresh(SETTINGS_EVENTS, fetchSettings);

    // Resolve the counter this device should watch:
    // 1. a counter this device already chose (shared login, several counters)
    // 2. otherwise the account's preferred canteen
    // 3. otherwise nothing, so the operator must pick one
    useEffect(() => {
        if (canteens.length === 0) return;

        // Drop a stored counter that no longer exists.
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
        }
        catch { toast.error('Foto gagal dibaca. Coba lagi atau lanjut tanpa foto.'); }
    };

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
                        void handleCheckIn('qr', text);
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
                    void handleCheckIn('qr', acceptedCode);
                }
            }
            cameraBusy.current = false;
        }
    };

    const [candidates, setCandidates] = useState<{ userId: string; externalId: string; name: string; department: string | null }[]>([]);
    const inFlight = useRef(false);
    // One pending scan keeps the pos responsive without accepting an unbounded queue.
    const nextScan = useRef<string | null>(null);
    const activeCode = useRef<string | null>(null);
    const handleCheckIn = async (method: 'manual' | 'qr', qrCodeData?: string, userId?: string) => {
        // Read directly from the DOM to bypass React's async state updates during rapid scans
        let domValue = searchInput;
        if (method === 'manual' && inputRef.current) {
            domValue = inputRef.current.value;
        }
        
        const codeToUse = (qrCodeData || domValue).trim();

        if (!codeToUse) {
            if (method === 'qr') {
                // Open QR scanner instead of showing error
                openQRScanner();
                return;
            } else {
                toast.error('Masukkan ID Karyawan, Nama, atau Barcode');
            }
            return;
        }

        // Validate canteen selection if enforcement is enabled
        if (enforceCanteenCheckin && !selectedCanteenId) {
            toast.error('Pilih kantin terlebih dahulu');
            return;
        }

        // USB barcode scanners type the code then press Enter, which arrives
        // here as 'manual'. Route order codes (ORDER-...) to the QR endpoint so
        // laser scans of the 1D barcode work — otherwise they'd be looked up as
        // an employee name/id and fail with "user not found".
        //
        // The camera scanner always reports 'qr', so the reverse mapping is
        // needed too: an ID card barcode decodes to the employee's externalId
        // or NIK, which only the manual endpoint understands. Without this,
        // scanning an ID card with the phone camera 404s on the order lookup.
        const isOrderCode = !userId && /^ORDER-/i.test(codeToUse);
        if (isOrderCode) method = 'qr';
        else if (method === 'qr') method = 'manual';

        if (inFlight.current) {
            if (!userId && (codeToUse === activeCode.current || codeToUse === nextScan.current)) {
                if (!qrCodeData && inputRef.current) {
                    inputRef.current.value = '';
                    setSearchInput('');
                }
                return;
            }
            if (!nextScan.current && !userId && !photoEnabled) {
                nextScan.current = codeToUse;
                setSearchInput('');
                if (inputRef.current) inputRef.current.value = '';
            } else {
                if (!qrCodeData && inputRef.current) {
                    inputRef.current.value = '';
                    setSearchInput('');
                }
                toast.error('Scan belum diterima. Pindai ulang setelah pos siap.');
            }
            return;
        }
        inFlight.current = true;
        activeCode.current = codeToUse;
        setCandidates([]);
        setIsProcessing(true);
        setLastError(null);

        // Clear input immediately so rapid barcode scanners can buffer the next scan
        // without getting wiped after this API call finishes.
        if (!qrCodeData) {
            if (inputRef.current) inputRef.current.value = '';
            setSearchInput('');
        }

        try {
            if (method === 'manual' && !userId) {
                const { data } = await api.get('/api/orders/checkin/lookup', { params: { query: codeToUse } });
                if (data.match === 'selection') {
                    setCandidates(data.candidates);
                    if (nextScan.current) { nextScan.current = null; toast.error('Pilih karyawan, lalu pindai ulang kode berikutnya.'); }
                    return;
                }
                userId = data.candidates[0]?.userId;
                if (!userId) { setLastError('Karyawan tidak ditemukan'); return; }
            }
            const photo = photoEnabled ? await photoAnswer() : undefined;
            if (photo === null) return;
            const formData = new FormData();
            formData.append(method === 'qr' ? 'qrCode' : 'userId', userId || codeToUse);
            if (selectedCanteenId) formData.append('operatorCanteenId', selectedCanteenId);
            if (photo?.size) formData.append('photo', photo, 'checkin.webp');
            const res = await api.post(`/api/orders/checkin/${method}`, formData);

            const result: CheckInResult = {
                success: true,
                message: res.data.photoStatus === 'saved' ? 'Berhasil diambil · foto tersimpan' : res.data.photoStatus === 'failed' ? 'Berhasil diambil · foto gagal disimpan' : 'Berhasil diambil',
                order: res.data.order,
                checkInBy: res.data.checkInBy || res.data.checkedInBy || 'Admin',
                checkInTime: res.data.checkInTime
            };

            setSuccessData(result);
            loadStats();
        } catch (error: any) {
            const message = error.response?.data?.error || 'Hasil belum dapat dipastikan. Periksa pesanan sebelum memindai ulang.';

            if (message.includes('sudah di-check in sebelumnya') && error.response?.data?.order) {
                const alreadyCheckedOrder = error.response.data.order;
                const warningResult: CheckInResult = {
                    success: false,
                    message: 'Sudah Ambil Makan',
                    order: alreadyCheckedOrder,
                    checkInTime: error.response.data.checkInTime || alreadyCheckedOrder.checkInTime,
                    checkInBy: error.response.data.checkedInBy || alreadyCheckedOrder.checkedInBy || 'Admin'
                };
                setSuccessData(warningResult);
            } else {
                setLastError(!error.response || error.response.status >= 500 ? 'Hasil belum dapat dipastikan. Periksa pesanan sebelum memindai ulang.' : error.response.data?.message || message);
            }
        } finally {
            inFlight.current = false;
            setIsProcessing(false);
            inputRef.current?.focus();
            const queued = nextScan.current;
            nextScan.current = null;
            if (queued) void handleCheckIn('manual', queued);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key !== 'Enter' || e.repeat || e.nativeEvent.isComposing) return;
        e.preventDefault();
        void handleCheckIn('manual');
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-4 motion-safe:animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{format(currentTime, 'EEEE, dd MMMM · HH:mm', { locale: idLocale })}</span>
                <span>{isConnected ? 'Sinkronisasi aktif' : 'Sinkronisasi terputus'}</span>
            </div>

            {/* Counter selection. Always visible: it drives which check-in
                popups this device shows, and is remembered per browser so a
                shared login can serve several counters at once. */}
            <div className="card border-primary-500/30 bg-gradient-to-r from-primary-500/10 to-transparent">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
                        <MapPin className="w-6 h-6 text-primary-400" />
                    </div>
                    <div className="flex-1">
                        <label htmlFor="checkin-canteen" className="block text-sm font-medium text-white/70 mb-1">
                            Pos Check-in Saat Ini
                        </label>
                        <select
                            id="checkin-canteen"
                            disabled={isProcessing || showQRScanner}
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
                        {enforceCanteenCheckin
                            ? '⚠️ Pilih kantin untuk memvalidasi lokasi check-in'
                            : 'Pilih kantin agar popup hanya menampilkan check-in dari counter ini'}
                    </p>
                )}
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
                                <p className="text-white/50">Scan barcode atau masukkan ID karyawan</p>
                            </div>
                        </div>
                        {photoEnabled && <span className="text-sm">Foto opsional</span>}
                    </div>

                    <div className="relative mb-6">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        <input aria-label="ID karyawan, nama, atau barcode" ref={inputRef} type="text" placeholder="ID Karyawan / Nama / Barcode..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={handleKeyPress} autoFocus className="input-search text-lg h-16" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => handleCheckIn('manual')} disabled={isProcessing || !searchInput.trim()} className="btn-success h-14 flex items-center justify-center gap-3 text-base font-semibold">
                            {isProcessing ? (<><Loader2 className="w-5 h-5 animate-spin" />Memproses...</>) : (<><CheckCircle2 className="w-5 h-5" />Ambil Makan</>)}
                        </button>
                        <button onClick={openQRScanner} disabled={isProcessing} className="btn-primary h-14 flex items-center justify-center gap-3 text-base font-semibold">
                            {isProcessing ? (<><Loader2 className="w-5 h-5 animate-spin" />Memproses...</>) : (<><ScanLine className="w-5 h-5" />Scan Barcode</>)}
                        </button>
                    </div>

                    {candidates.length > 0 && (
                        <section className="mt-4" aria-label="Hasil pencarian karyawan">
                            <p>Pilih karyawan untuk mencatat pengambilan.</p>
                            {candidates.map(candidate => (
                                <button key={candidate.userId} type="button" className="btn-secondary mt-2 w-full" onClick={() => handleCheckIn('manual', candidate.externalId, candidate.userId)}>
                                    {candidate.name} · {candidate.externalId}{candidate.department && ` · ${candidate.department}`}
                                </button>
                            ))}
                        </section>
                    )}

                    {successData?.order?.user && <div role="status" className="mt-4 rounded-xl border border-white/20 p-4">
                        <p className="font-bold">{successData.message}</p>
                        <p className="break-words">{successData.order.user.name} · {successData.order.user.externalId}</p>
                        <p>{[formatTimeWIB(successData.checkInTime), successData.checkInBy].filter(Boolean).join(' · ')}</p>
                    </div>}
                    {remotePickup && remotePickup.id !== successData?.order?.id && <p className="mt-2 text-sm">Aktivitas terbaru · {remotePickup.user.name}</p>}

                    {lastError && (
                        <div className="mt-6 p-4 rounded-2xl bg-danger/10 border border-danger/30">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-6 h-6 text-danger flex-shrink-0" />
                                <div>
                                    <p role="alert" className="font-medium text-danger">{lastError}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-6 p-4 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-sm text-white/60">
                            <strong className="text-white">Petunjuk:</strong><br />
                            • Ketik ID atau nama untuk <span className="text-success">check-in manual</span><br />
                            • Scan atau ketik kode untuk <span className="text-primary-400">barcode check-in</span><br />
                            • Tekan <kbd className="px-2 py-0.5 bg-white/10 rounded text-xs">Enter</kbd> untuk check-in cepat
                        </p>
                    </div>
                </div>
            </div>



            {statsError && <p role="status">Data belum diperbarui</p>}
            {!todayStats && !statsError && <p role="status">Memuat statistik…</p>}
            {/* Q9a: one small line telling the operator which shift the cards describe. */}
            <p className="text-sm text-white/60">
                {focusInfo?.scope === 'break' && focusInfo.breakStart && focusInfo.breakEnd ? (
                    <>{focusInfo.upcoming ? 'Istirahat berikutnya' : 'Istirahat'} {focusInfo.breakStart}–{focusInfo.breakEnd} · <span className="text-primary-400 font-medium">{focusInfo.shiftNames.join(', ')}</span></>
                ) : focusInfo?.nextBreak ? (
                    <>Semua Shift · Sepanjang Hari · Istirahat berikutnya {focusInfo.nextBreak.breakStart} ({focusInfo.nextBreak.shiftNames.join(', ')})</>
                ) : (
                    <>Semua Shift · Sepanjang Hari</>
                )}
                {!selectedCanteenId && <span className="text-white/30"> · Semua Kantin</span>}
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div className="stat-card text-center">
                    <p className="text-xs text-white/40 uppercase tracking-wider">Total</p>
                    <p className="text-3xl font-bold text-gradient mt-1">{todayStats?.total ?? '—'}</p>
                </div>
                <div className="stat-card text-center">
                    <p className="text-xs text-white/40 uppercase tracking-wider">Diambil</p>
                    <p className="text-3xl font-bold text-success mt-1">{todayStats?.checkedIn ?? '—'}</p>
                </div>
                <div className="stat-card text-center">
                    <p className="text-xs text-white/40 uppercase tracking-wider">Belum diambil</p>
                    <p className="text-3xl font-bold text-warning mt-1">{todayStats?.pending ?? '—'}</p>
                </div>
                <div className="stat-card text-center">
                    <p className="text-xs text-white/40 uppercase tracking-wider">Dibatalkan</p>
                    <p className="text-3xl font-bold text-slate-400 mt-1">{todayStats?.cancelled ?? '—'}</p>
                </div>
                <div className="stat-card text-center">
                    <p className="text-xs text-white/40 uppercase tracking-wider">Tidak Diambil</p>
                    <p className="text-3xl font-bold text-danger mt-1">{todayStats?.noShow ?? '—'}</p>
                </div>
            </div>

            {showCamera && (
                <dialog ref={node => { if (node && !node.open) node.showModal(); }} aria-labelledby="pickup-photo-title" onCancel={e => { e.preventDefault(); finishPhoto(undefined, true); }} className="m-auto max-h-[90dvh] w-[min(92vw,32rem)] overflow-auto rounded-xl bg-dark-900 p-4 text-white backdrop:bg-black/60">
                    <h2 id="pickup-photo-title" className="mb-3 text-lg font-bold">Foto bukti pengambilan</h2>
                    <Webcam audio={false} ref={webcamRef} screenshotFormat="image/webp" className="max-h-[55dvh] w-full object-contain" onUserMediaError={() => toast.error('Kamera tidak tersedia. Lanjut tanpa foto.')} />
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button className="btn-secondary" onClick={() => finishPhoto(undefined, true)}>Batal</button>
                        <button className="btn-secondary" onClick={() => finishPhoto()}>Lanjut tanpa foto</button>
                        <button className="btn-primary" onClick={capturePhoto}>Ambil foto</button>
                    </div>
                </dialog>
            )}

            {/* QR Scanner Modal */}
            {showQRScanner && (
                <dialog ref={node => { if (node && !node.open) node.showModal(); }} aria-labelledby="barcode-scanner-title" onCancel={event => { event.preventDefault(); closeQRScanner(); }} className="m-auto max-h-[90dvh] w-[min(92vw,32rem)] overflow-auto rounded-xl bg-transparent text-white backdrop:bg-black/60">
                    <div className="w-full max-w-lg space-y-4 bg-dark-900/90 rounded-2xl p-6 border border-white/10 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
                                    <ScanLine className="w-6 h-6 text-primary-400" />
                                </div>
                                <div>
                                    <h3 id="barcode-scanner-title" className="text-xl font-bold text-white">Pindai barcode / QR</h3>
                                    <p className="text-white/50 text-sm">Arahkan kamera ke kode pesanan atau kartu karyawan</p>
                                </div>
                            </div>
                            <button
                                onClick={closeQRScanner}
                                aria-label="Tutup kamera"
                                className="btn-icon bg-white/10 hover:bg-white/20"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div
                            ref={qrContainerRef}
                            id="qr-reader"
                            className="w-full aspect-video bg-black rounded-2xl overflow-hidden"
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
                                Pastikan kode terlihat jelas di kamera
                            </p>
                        </div>
                    </div>
                </dialog>
            )}
        </div>
    );
}
