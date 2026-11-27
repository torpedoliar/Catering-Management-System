import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, ORDER_EVENTS } from '../../contexts/SSEContext';
import { formatOrderDate } from '../../utils/dateHelpers';
import { Card, Badge, BarChart, SkeletonCard, EmptyState } from '../../components/ui';

interface Canteen {
    id: string;
    name: string;
    location: string | null;
}

interface CanteenLiveResponse {
    date: string;
    serverTime: string;
    activeBreak: {
        status: 'active' | 'upcoming' | 'finished';
        time: string;
        /** "Dini hari tadi" | "Hari ini" | "Besok dini hari" | "Besok" (older servers: absent) */
        dayLabel?: string;
        shiftNames: string[];
        remainingMinutes: number;
        total: number;
        pickedUp: number;
        pending: number;
        ratePerMinute: number;
        buckets: Array<{ label: string; count: number | null }>;
        posts: Array<{ name: string; count: number; lastScanAt: string; idleMinutes: number }>;
    } | null;
    todayBreaks: Array<{
        time: string;
        dayLabel?: string;
        shiftNames: string[];
        total: number;
        pickedUp: number;
        state: 'Berjalan' | 'Nanti' | 'Selesai';
    }>;
}

const CANTEEN_KEY = 'checkin:selectedCanteenId';
const MONTH_LONG = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const DOW_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function formatHeaderDate(dateStr: string): string {
    const key = formatOrderDate(dateStr);
    const [y, m, d] = key.split('-').map(Number);
    if (!y || !m || !d) return key;
    const dt = new Date(y, m - 1, d);
    return `${DOW_LONG[dt.getDay()]}, ${d} ${MONTH_LONG[m - 1]} ${y}`;
}

export default function CanteenDashboardPage() {
    const [canteens, setCanteens] = useState<Canteen[]>([]);
    const [selectedCanteenId, setSelectedCanteenId] = useState<string>(() => {
        try {
            return localStorage.getItem(CANTEEN_KEY) || '';
        } catch {
            return '';
        }
    });
    const [data, setData] = useState<CanteenLiveResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/api/canteens?active=true')
            .then((res) => {
                const list: Canteen[] = res.data.canteens || [];
                setCanteens(list);
                if (!selectedCanteenId && list.length > 0) {
                    setSelectedCanteenId(list[0].id);
                }
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadLive = useCallback(async () => {
        try {
            const params = selectedCanteenId ? `?canteenId=${encodeURIComponent(selectedCanteenId)}` : '';
            const res = await api.get(`/api/orders/stats/canteen-live${params}`);
            setData(res.data);
        } catch (err) {
            console.error('Failed to load canteen live stats:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedCanteenId]);

    useEffect(() => {
        loadLive();
        const timer = setInterval(loadLive, 15_000);
        return () => clearInterval(timer);
    }, [loadLive]);

    useSSERefresh(ORDER_EVENTS, loadLive);

    const handleCanteenChange = (id: string) => {
        setSelectedCanteenId(id);
        try {
            if (id) localStorage.setItem(CANTEEN_KEY, id);
            else localStorage.removeItem(CANTEEN_KEY);
        } catch {
            /* ignore */
        }
    };

    const selectedCanteen = canteens.find((c) => c.id === selectedCanteenId);
    const ab = data?.activeBreak;
    const pct = ab && ab.total > 0 ? Math.min(100, Math.round((ab.pickedUp / ab.total) * 100)) : 0;

    // Highlight max bucket for amber bar chart
    const maxBucket = ab
        ? Math.max(0, ...ab.buckets.map((b) => (typeof b.count === 'number' ? b.count : 0)))
        : 0;

    if (loading && !data) {
        return (
            <div className="max-w-[1240px] space-y-4">
                <SkeletonCard lines={4} />
                <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3.5">
                    <SkeletonCard lines={4} />
                    <SkeletonCard lines={4} />
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1240px] w-full flex flex-col gap-[18px]">
            {/* Canteen selector bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-[13px] text-[#78716c]">
                    <span>Kantin</span>
                    <select
                        aria-label="Pilih kantin"
                        value={selectedCanteenId}
                        onChange={(e) => handleCanteenChange(e.target.value)}
                        className="h-9 border border-[#e7e5e4] rounded-[9px] px-2.5 text-[14px] font-bold text-[#1c1917] bg-[#fff] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
                    >
                        <option value="">Semua kantin</option>
                        {canteens.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </label>

                <span className="text-[12.5px] text-[#78716c]">
                    {data?.date ? formatHeaderDate(data.date) : ''}
                </span>
            </div>

            {/* Hero dark card — DashOperator.dc.html */}
            <section className="bg-[#1c1917] text-[#fff] rounded-[16px] p-6 flex flex-wrap gap-6 items-center">
                <div className="flex-1 min-w-[280px]">
                    {ab ? (
                        <>
                            <span className="inline-flex items-center gap-2 text-[12px] font-bold bg-[#f59e0b] text-[#1c1917] rounded-full px-2.5 py-1">
                                {ab.status === 'active'
                                    ? `Istirahat berjalan · sisa ${ab.remainingMinutes} menit`
                                    : ab.status === 'upcoming'
                                        ? `Istirahat berikutnya · mulai ${ab.remainingMinutes} menit lagi`
                                        : 'Istirahat hari ini selesai'}
                            </span>
                            <h1 className="m-0 mt-3 mb-1 text-[24px] md:text-[28px] font-extrabold tracking-[-0.02em] text-[#fff]">
                                {ab.dayLabel && ab.dayLabel !== 'Hari ini' ? `${ab.dayLabel}, ` : ''}{ab.time} · {ab.shiftNames.join(', ')}
                            </h1>
                            <p className="m-0 text-[#a8a29e] text-[14px]">
                                Kantin {selectedCanteen?.name || 'Semua'} · {data?.date ? formatHeaderDate(data.date) : ''}
                            </p>

                            <div className="mt-4 flex items-baseline gap-2">
                                <span className="text-[40px] md:text-[44px] font-extrabold tabular-nums leading-none">
                                    {ab.pickedUp.toLocaleString('id-ID')}
                                </span>
                                <span className="text-[#d6d3d1] text-[15px]">
                                    dari {ab.total.toLocaleString('id-ID')} sudah diambil
                                </span>
                            </div>

                            <div className="h-2.5 bg-[rgba(255,255,255,0.12)] rounded-full mt-2.5 overflow-hidden max-w-[560px]">
                                <div
                                    className="h-full bg-[#22c55e] rounded-full transition-[width] duration-300"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>

                            <div className="flex flex-wrap gap-5 mt-2.5 text-[13px] text-[#d6d3d1]">
                                <span>
                                    Belum diambil <b className="text-[#fff] tabular-nums">{ab.pending.toLocaleString('id-ID')}</b>
                                </span>
                                <span>
                                    Rata-rata{' '}
                                    <b className="text-[#fff] tabular-nums">
                                        {ab.ratePerMinute.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </b>{' '}
                                    orang/menit
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <span className="inline-flex items-center text-[12px] font-bold bg-[#f59e0b] text-[#1c1917] rounded-full px-2.5 py-1">
                                Siap melayani
                            </span>
                            <h1 className="m-0 mt-3 mb-1 text-[24px] font-extrabold text-[#fff]">
                                Belum ada jadwal istirahat aktif
                            </h1>
                            <p className="m-0 text-[#a8a29e] text-[14px]">
                                Kantin {selectedCanteen?.name || 'Semua'} · {data?.date ? formatHeaderDate(data.date) : ''}
                            </p>
                        </>
                    )}
                </div>

                <Link
                    to="/canteen/checkin"
                    className="inline-flex items-center gap-2.5 h-14 px-[22px] rounded-[14px] bg-[#f59e0b] text-[#1c1917] text-[16px] font-extrabold no-underline hover:bg-[#d97706] transition-colors flex-shrink-0"
                >
                    <ScanLine className="w-[22px] h-[22px]" aria-hidden="true" />
                    <span>Buka Check-in</span>
                </Link>
            </section>

            {/* 10-minute pickup chart & per pos */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3.5">
                <Card>
                    <div className="flex items-baseline justify-between mb-3.5">
                        <h2 className="m-0 text-[16px] font-bold text-[#1c1917]">Pengambilan per 10 menit</h2>
                        <span className="text-[12px] text-[#78716c]">Diperbarui langsung</span>
                    </div>
                    {ab && ab.buckets.length > 0 ? (
                        <BarChart
                            height={130}
                            barMaxWidth={40}
                            data={ab.buckets.map((b) => ({
                                label: b.label,
                                value: b.count,
                                color:
                                    b.count === null
                                        ? '#f0efed'
                                        : maxBucket > 0 && b.count === maxBucket
                                            ? '#f59e0b'
                                            : '#fcd34d',
                            }))}
                        />
                    ) : (
                        <EmptyState
                            title="Belum ada data interval"
                            description="Grafik pengambilan muncul saat jam istirahat memiliki jendela waktu."
                        />
                    )}
                </Card>

                <Card>
                    <h2 className="m-0 mb-1 text-[16px] font-bold text-[#1c1917]">Per pos check-in</h2>
                    <p className="m-0 mb-2.5 text-[12px] text-[#78716c]">
                        Istirahat ini · {selectedCanteen?.name || 'Semua kantin'}
                    </p>
                    {ab && ab.posts.length > 0 ? (
                        <div className="divide-y divide-[#f5f5f4]">
                            {ab.posts.map((pos) => {
                                const isIdle = ab.status === 'active' && pos.idleMinutes > 15;
                                return (
                                    <div key={pos.name} className="py-2.5">
                                        <div className="flex justify-between text-[13.5px]">
                                            <span className="font-semibold text-[#1c1917]">{pos.name}</span>
                                            <span className="font-extrabold tabular-nums text-[#1c1917]">
                                                {pos.count.toLocaleString('id-ID')}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-[12px] text-[#78716c] mt-0.5">
                                            <span>Terakhir scan {pos.lastScanAt}</span>
                                            <span
                                                className={`font-semibold ${
                                                    isIdle ? 'text-[#b45309]' : 'text-[#15803d]'
                                                }`}
                                            >
                                                {isIdle ? `Diam ${pos.idleMinutes} mnt` : 'Aktif'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState
                            title="Belum ada scan"
                            description="Pos check-in muncul setelah ada karyawan yang melakukan scan."
                        />
                    )}
                </Card>
            </div>

            {/* Today's breaks schedule */}
            <Card>
                <h2 className="m-0 mb-1 text-[16px] font-bold text-[#1c1917]">Jadwal istirahat hari ini</h2>
                <p className="m-0 mb-3.5 text-[12px] text-[#78716c]">
                    Termasuk istirahat shift malam: yang dini hari tadi (pesanan kemarin) dan yang besok dini hari (pesanan hari ini).
                </p>
                {data && data.todayBreaks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {data.todayBreaks.map((brk) => {
                            const active = brk.state === 'Berjalan';
                            return (
                                <div
                                    key={`${brk.dayLabel ?? ''}-${brk.time}`}
                                    className={`rounded-[12px] p-3.5 ${
                                        active
                                            ? 'border-2 border-[#f59e0b] bg-[#fffbeb]'
                                            : 'border border-[#e7e5e4] bg-[#fff]'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            {brk.dayLabel && (
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#78716c]">
                                                    {brk.dayLabel}
                                                </div>
                                            )}
                                            <b className="text-[15px] text-[#1c1917] tabular-nums">{brk.time}</b>
                                        </div>
                                        {active ? (
                                            <span className="text-[11px] font-bold rounded-full px-2 py-[3px] bg-[#f59e0b] text-[#1c1917]">
                                                Berjalan
                                            </span>
                                        ) : (
                                            <Badge variant={brk.state === 'Selesai' ? 'success' : 'neutral'}>
                                                {brk.state}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="text-[12px] text-[#78716c] mt-1">
                                        {brk.shiftNames.join(' · ')}
                                    </div>
                                    <div className="text-[13px] mt-2.5 text-[#1c1917]">
                                        <b className="tabular-nums">{brk.total.toLocaleString('id-ID')}</b> porsi dipesan
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState
                        title="Tidak ada jadwal istirahat"
                        description="Belum ada shift dengan jam istirahat aktif."
                    />
                )}
            </Card>
        </div>
    );
}
