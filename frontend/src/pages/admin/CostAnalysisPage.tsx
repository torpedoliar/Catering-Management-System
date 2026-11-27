import { useState, useCallback, useEffect } from 'react';
import { FileDown, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, ORDER_EVENTS } from '../../contexts/SSEContext';
import { getLocalDateString, addDays, formatOrderDate } from '../../utils/dateHelpers';
import {
    PageHeader,
    SegmentedControl,
    Button,
    StatTile,
    Card,
    ProgressBar,
    BarChart,
    EmptyState,
    Skeleton,
    SkeletonCard,
    Badge,
} from '../../components/ui';
import type { BarChartItem } from '../../components/ui';

interface CostStats {
    total: number;
    pickedUp: number;
    pending: number;
    noShow: number;
    cancelled: number;
    totalCost: number;
    actualCost: number;
    wasteCost: number;
    wasteRate: number;
    pickupRate: number;
}

interface ShiftCost {
    shiftId: string;
    shiftName: string;
    mealPrice: number;
    orders: number;
    pickedUp: number;
    noShow: number;
    totalCost: number;
    wasteCost: number;
    wasteRate: number;
}

interface CompanyCost {
    company: string;
    orders: number;
    pickedUp: number;
    noShow: number;
    totalCost: number;
    wasteCost: number;
    wasteRate: number;
}

type PeriodKey = 'today' | 'week' | 'month' | 'custom';

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
}

function formatShortDate(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    if (!y || !m || !d) return dateKey;
    return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
    });
}

function getDayShortLabel(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    if (!y || !m || !d) return dateKey;
    return new Date(y, m - 1, d).toLocaleDateString('id-ID', { weekday: 'short' });
}

export default function CostAnalysisPage() {
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('month');
    const [startDate, setStartDate] = useState(() => `${getLocalDateString().slice(0, 7)}-01`);
    const [endDate, setEndDate] = useState(() => getLocalDateString());
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    const [stats, setStats] = useState<CostStats | null>(null);
    const [shiftCosts, setShiftCosts] = useState<ShiftCost[]>([]);
    const [companyCosts, setCompanyCosts] = useState<CompanyCost[]>([]);
    const [dailyBars, setDailyBars] = useState<BarChartItem[]>([]);

    const applyPeriod = (period: PeriodKey) => {
        setSelectedPeriod(period);
        const today = getLocalDateString();
        if (period === 'today') {
            setStartDate(today);
            setEndDate(today);
        } else if (period === 'week') {
            setStartDate(addDays(today, -6));
            setEndDate(today);
        } else if (period === 'month') {
            setStartDate(`${today.slice(0, 7)}-01`);
            setEndDate(today);
        }
    };

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [res, shiftsRes, ordersRes] = await Promise.all([
                api.get(`/api/orders/stats/range?startDate=${startDate}&endDate=${endDate}`),
                api.get('/api/shifts'),
                api.get(`/api/orders?startDate=${startDate}&endDate=${endDate}&limit=10000`),
            ]);

            const data = res.data;
            const shiftPrices: Record<string, number> = {};
            (shiftsRes.data.shifts || []).forEach((s: { id: string; mealPrice?: number | string }) => {
                shiftPrices[s.id] = Number(s.mealPrice) || 25000;
            });

            const orders = ordersRes.data.orders || [];
            let totalCost = 0;
            let actualCost = 0;
            let wasteCost = 0;

            const shiftStats: Record<string, ShiftCost> = {};
            const companyStats: Record<string, CompanyCost> = {};
            const dayCounts = new Map<string, number>();

            orders.forEach(
                (order: {
                    shiftId: string;
                    status: string;
                    orderDate: string;
                    shift?: { name?: string };
                    user?: { company?: string };
                }) => {
                    const price = shiftPrices[order.shiftId] || 25000;
                    const dayKey = formatOrderDate(order.orderDate);

                    if (order.status !== 'CANCELLED') {
                        totalCost += price;
                        if (dayKey !== '-') {
                            dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
                        }

                        if (!shiftStats[order.shiftId]) {
                            shiftStats[order.shiftId] = {
                                shiftId: order.shiftId,
                                shiftName: order.shift?.name || 'Unknown',
                                mealPrice: price,
                                orders: 0,
                                pickedUp: 0,
                                noShow: 0,
                                totalCost: 0,
                                wasteCost: 0,
                                wasteRate: 0,
                            };
                        }
                        shiftStats[order.shiftId].orders++;
                        shiftStats[order.shiftId].totalCost += price;

                        const company = order.user?.company || 'Lainnya';
                        if (!companyStats[company]) {
                            companyStats[company] = {
                                company,
                                orders: 0,
                                pickedUp: 0,
                                noShow: 0,
                                totalCost: 0,
                                wasteCost: 0,
                                wasteRate: 0,
                            };
                        }
                        companyStats[company].orders++;
                        companyStats[company].totalCost += price;
                    }

                    if (order.status === 'PICKED_UP') {
                        actualCost += price;
                        if (shiftStats[order.shiftId]) shiftStats[order.shiftId].pickedUp++;
                        const company = order.user?.company || 'Lainnya';
                        if (companyStats[company]) companyStats[company].pickedUp++;
                    } else if (order.status === 'NO_SHOW') {
                        wasteCost += price;
                        if (shiftStats[order.shiftId]) {
                            shiftStats[order.shiftId].noShow++;
                            shiftStats[order.shiftId].wasteCost += price;
                        }
                        const company = order.user?.company || 'Lainnya';
                        if (companyStats[company]) {
                            companyStats[company].noShow++;
                            companyStats[company].wasteCost += price;
                        }
                    }
                }
            );

            Object.values(shiftStats).forEach((s) => {
                s.wasteRate = s.orders > 0 ? Math.round((s.noShow / s.orders) * 100) : 0;
            });
            Object.values(companyStats).forEach((c) => {
                c.wasteRate = c.orders > 0 ? Math.round((c.noShow / c.orders) * 100) : 0;
            });

            // Build 7-day bar chart anchored on endDate (or range days up to 10 days)
            const today = getLocalDateString();
            const bars: BarChartItem[] = [];
            for (let offset = 6; offset >= 0; offset--) {
                const key = addDays(endDate, -offset);
                bars.push({
                    label: getDayShortLabel(key),
                    value: dayCounts.get(key) || 0,
                    highlight: key === today,
                });
            }
            setDailyBars(bars);

            const total = data.total || 0;
            const wasteRate = total > 0 ? Math.round((data.noShow / total) * 100) : 0;
            const pickupRate = total > 0 ? Math.round((data.pickedUp / total) * 100) : 0;

            setStats({
                total,
                pickedUp: data.pickedUp || 0,
                pending: data.pending || 0,
                noShow: data.noShow || 0,
                cancelled: data.cancelled || 0,
                totalCost,
                actualCost,
                wasteCost,
                wasteRate,
                pickupRate,
            });

            setShiftCosts(Object.values(shiftStats).sort((a, b) => b.wasteCost - a.wasteCost || b.totalCost - a.totalCost));
            setCompanyCosts(Object.values(companyStats).sort((a, b) => b.totalCost - a.totalCost));
        } catch (error) {
            console.error('Failed to load cost data:', error);
            toast.error('Gagal memuat data biaya');
        } finally {
            setIsLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useSSERefresh(ORDER_EVENTS, loadData);

    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            const response = await api.get(
                `/api/orders/export?startDate=${startDate}&endDate=${endDate}`,
                { responseType: 'blob' }
            );
            const url = URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Laporan_Biaya_Catering_${startDate}_${endDate}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Laporan berhasil diexport');
        } catch {
            toast.error('Gagal export laporan');
        } finally {
            setIsExporting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-8 w-52" />
                    <Skeleton className="h-9 w-64" />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Skeleton className="h-64" />
                    <Skeleton className="h-64" />
                </div>
            </div>
        );
    }

    const topLossShift = shiftCosts.find((s) => s.wasteRate > 15 || s.noShow > 0);
    const showHighWasteAlert = (stats?.wasteRate || 0) > 15;

    return (
        <div className="space-y-4">
            <PageHeader
                title="Biaya & pemborosan"
                subtitle={`${formatShortDate(startDate)} – ${formatShortDate(endDate)}`}
                actions={
                    <>
                        <SegmentedControl
                            ariaLabel="Periode analisis biaya"
                            layoutId="cost-period"
                            value={selectedPeriod}
                            onChange={(v) => applyPeriod(v as PeriodKey)}
                            options={[
                                { value: 'today', label: 'Hari ini' },
                                { value: 'week', label: '7 hari' },
                                { value: 'month', label: 'Bulan ini' },
                                { value: 'custom', label: 'Kustom' },
                            ]}
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadData}
                            leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Muat ulang
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            loading={isExporting}
                            onClick={handleExportExcel}
                            leftIcon={<FileDown className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Ekspor Excel
                        </Button>
                    </>
                }
            />

            {selectedPeriod === 'custom' && (
                <Card padding="sm">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[12.5px] font-semibold text-[#57534e]">Rentang kustom:</span>
                        <input
                            type="date"
                            aria-label="Tanggal mulai"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                        />
                        <span className="text-[#a8a29e]">–</span>
                        <input
                            type="date"
                            aria-label="Tanggal selesai"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                        />
                    </div>
                </Card>
            )}

            {/* KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile
                    label="Total biaya"
                    value={formatCurrency(stats?.totalCost || 0)}
                    color="#1c1917"
                    sub={`${(stats?.total || 0).toLocaleString('id-ID')} porsi dipesan`}
                />
                <StatTile
                    label="Biaya termanfaatkan"
                    value={formatCurrency(stats?.actualCost || 0)}
                    color="#16a34a"
                    valueColor="#15803d"
                    sub={`${(stats?.pickedUp || 0).toLocaleString('id-ID')} porsi (${stats?.pickupRate || 0}%)`}
                />
                <StatTile
                    label="Kerugian"
                    value={formatCurrency(stats?.wasteCost || 0)}
                    color="#dc2626"
                    valueColor="#b91c1c"
                    sub={`${stats?.noShow || 0} porsi tidak diambil`}
                />
                <StatTile
                    label="Waste rate"
                    value={`${stats?.wasteRate || 0}%`}
                    color={(stats?.wasteRate || 0) > 10 ? '#dc2626' : '#f59e0b'}
                    valueColor={(stats?.wasteRate || 0) > 10 ? '#b91c1c' : '#b45309'}
                    sub="Target di bawah 10%"
                />
            </div>

            {/* Automatic alert when waste rate > 15% */}
            {showHighWasteAlert && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-[14px] bg-[#fff7ed] border border-[#fed7aa]">
                    <AlertTriangle className="w-5 h-5 text-[#c2410c] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="text-[13px] text-[#9a3412] leading-relaxed">
                        <span className="font-bold">Waste rate melampaui 15% ({stats?.wasteRate}%). </span>
                        {topLossShift ? (
                            <>
                                Shift dengan kerugian terbesar: <b>{topLossShift.shiftName}</b> ({topLossShift.noShow} porsi, {formatCurrency(topLossShift.wasteCost)}). Pertimbangkan meninjau ulang kuota atau pengingat notifikasi untuk shift ini.
                            </>
                        ) : (
                            'Pertimbangkan meninjau ulang kuota atau pengingat notifikasi pada shift dengan tingkat no-show tertinggi.'
                        )}
                    </div>
                </div>
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
                <Card>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-[15px] font-bold text-[#1c1917]">Order per hari</h2>
                            <p className="text-[12.5px] text-[#78716c]">7 hari terakhir hingga tanggal akhir periode</p>
                        </div>
                        <span className="text-[12px] text-[#78716c] flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-[2px] bg-[#f59e0b] inline-block" />
                            Hari ini
                        </span>
                    </div>
                    <BarChart data={dailyBars} height={150} />
                </Card>

                <Card>
                    <div className="flex items-center justify-between mb-3.5">
                        <h2 className="text-[15px] font-bold text-[#1c1917]">
                            Porsi tidak diambil per shift
                        </h2>
                        <span className="text-[12px] text-[#78716c]">Urut kerugian terbesar</span>
                    </div>
                    {shiftCosts.length > 0 ? (
                        <div className="space-y-3.5">
                            {shiftCosts.map((s) => {
                                const pct = s.orders > 0 ? Math.round((s.noShow / s.orders) * 100) : 0;
                                const barColor = pct >= 50 ? '#dc2626' : pct >= 15 ? '#f59e0b' : '#16a34a';
                                return (
                                    <div key={s.shiftId} className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-2 text-[13px]">
                                            <span className="font-semibold text-[#1c1917]">{s.shiftName}</span>
                                            <span className="tabular-nums text-[#78716c] text-[12px]">
                                                <b className="text-[#1c1917]">{s.noShow}</b> dari {s.orders} ({pct}%)
                                            </span>
                                        </div>
                                        <ProgressBar value={s.noShow} max={Math.max(1, s.orders)} color={barColor} height="md" />
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState title="Tidak ada data shift" />
                    )}
                </Card>
            </div>

            {/* Breakdown Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card padding="none">
                    <div className="px-4 py-3.5 border-b border-[#f5f5f4]">
                        <h3 className="text-[14px] font-bold text-[#1c1917]">Biaya per shift</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                    <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Shift
                                    </th>
                                    <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Order
                                    </th>
                                    <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        No-show
                                    </th>
                                    <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Biaya
                                    </th>
                                    <th className="text-right px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Kerugian
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#f5f5f4]">
                                {shiftCosts.length > 0 ? (
                                    shiftCosts.map((shift) => (
                                        <tr key={shift.shiftId} className="hover:bg-[#fafaf9]">
                                            <td className="px-4 py-2.5">
                                                <div className="font-semibold text-[#1c1917]">{shift.shiftName}</div>
                                                <div className="text-[11.5px] text-[#78716c] tabular-nums">
                                                    {formatCurrency(shift.mealPrice)}/porsi
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-[#1c1917]">
                                                {shift.orders}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">
                                                <span className={shift.noShow > 0 ? 'font-semibold text-[#b91c1c]' : 'text-[#a8a29e]'}>
                                                    {shift.noShow}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#1c1917]">
                                                {formatCurrency(shift.totalCost)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">
                                                {shift.wasteCost > 0 ? (
                                                    <span className="font-semibold text-[#b91c1c]">
                                                        {formatCurrency(shift.wasteCost)}
                                                    </span>
                                                ) : (
                                                    <span className="text-[#a8a29e]">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-[#78716c]">
                                            Tidak ada data
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card padding="none">
                    <div className="px-4 py-3.5 border-b border-[#f5f5f4]">
                        <h3 className="text-[14px] font-bold text-[#1c1917]">Biaya per perusahaan</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                    <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Perusahaan
                                    </th>
                                    <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Order
                                    </th>
                                    <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Waste
                                    </th>
                                    <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Biaya
                                    </th>
                                    <th className="text-right px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Kerugian
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#f5f5f4]">
                                {companyCosts.length > 0 ? (
                                    companyCosts.slice(0, 10).map((company) => (
                                        <tr key={company.company} className="hover:bg-[#fafaf9]">
                                            <td className="px-4 py-2.5 font-semibold text-[#1c1917]">
                                                {company.company}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-[#1c1917]">
                                                {company.orders}
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                <Badge
                                                    variant={
                                                        company.wasteRate > 15
                                                            ? 'danger'
                                                            : company.wasteRate > 10
                                                                ? 'warning'
                                                                : 'neutral'
                                                    }
                                                >
                                                    {company.wasteRate}%
                                                </Badge>
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#1c1917]">
                                                {formatCurrency(company.totalCost)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">
                                                {company.wasteCost > 0 ? (
                                                    <span className="font-semibold text-[#b91c1c]">
                                                        {formatCurrency(company.wasteCost)}
                                                    </span>
                                                ) : (
                                                    <span className="text-[#a8a29e]">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-[#78716c]">
                                            Tidak ada data
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            {/* Calculation Explanation */}
            <Card padding="sm">
                <div className="flex items-start gap-3">
                    <Info className="w-4 h-4 text-[#2563eb] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="text-[12.5px] text-[#57534e] space-y-0.5">
                        <div className="font-semibold text-[#1c1917]">Tentang perhitungan biaya</div>
                        <div>Total biaya = seluruh pesanan aktif (kecuali dibatalkan) × harga porsi per shift. Biaya termanfaatkan = pesanan sudah diambil. Kerugian = pesanan tidak diambil × harga makanan.</div>
                    </div>
                </div>
            </Card>
        </div>
    );
}
