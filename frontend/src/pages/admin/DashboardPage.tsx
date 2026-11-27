import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    Download,
    List,
    Calendar,
    Building2,
    Briefcase,
    AlertTriangle,
    XCircle,
    Clock,
    CalendarDays,
    ChevronDown,
    ChevronUp,
    Wifi,
    RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { getLocalDateString, addDays } from '../../utils/dateHelpers';
import { useSSE, useSSERefresh, ORDER_EVENTS, USER_EVENTS } from '../../contexts/SSEContext';
import {
    PageHeader,
    SegmentedControl,
    Button,
    StatTile,
    Card,
    ProgressBar,
    Badge,
    OrderStatusBadge,
    EmptyState,
    Skeleton,
    SkeletonCard,
} from '../../components/ui';

interface ShiftStats {
    shiftId: string;
    shiftName: string;
    startTime: string;
    endTime: string;
    breakStartTime?: string | null;
    breakEndTime?: string | null;
    count: number;
}

interface ShiftGroup {
    key: string;
    label: string;
    shifts: ShiftStats[];
    shiftIds: string[];
    shiftNames: string[];
    isGrouped: boolean;
    totalCount: number;
}

interface CanteenStats {
    canteenId: string;
    canteenName: string;
    count: number;
}

interface DepartmentShiftStats {
    shiftName: string;
    total: number;
    pickedUp: number;
    noShow: number;
}

interface DepartmentStats {
    name: string;
    total: number;
    pickedUp: number;
    pending: number;
    cost: number;
    byShift: DepartmentShiftStats[];
}

interface NoShowUser {
    userId: string;
    externalId: string;
    name: string;
    company: string;
    department: string;
    shiftName: string;
    noShowCount: number;
    date: string;
}

interface UserAtRisk {
    id: string;
    externalId: string;
    name: string;
    company: string;
    department: string;
    noShowCount: number;
}

interface Holiday {
    id: string;
    name: string;
    shiftName: string;
}

interface CompanyShiftRecap {
    company: string;
    shifts: Record<string, number>;
    total: number;
}

interface TomorrowOrder {
    id: string;
    user: { name: string; externalId: string; company: string; department: string };
    shift: { name: string; startTime: string; endTime: string };
}

interface Stats {
    date: string;
    total: number;
    pickedUp: number;
    pending: number;
    cancelled: number;
    noShow: number;
    pickupRate: number;
    byShift: ShiftStats[];
    byCanteen: CanteenStats[];
    byDepartment: DepartmentStats[];
    noShowUsers: {
        today: NoShowUser[];
        yesterday: NoShowUser[];
    };
    holidays: Holiday[];
    blacklistedCount: number;
    usersAtRisk: UserAtRisk[];
    blacklistStrikes: number;
}

interface Order {
    id: string;
    status: string;
    orderTime: string;
    orderDate: string;
    user: { name: string; externalId: string; company: string; department: string };
    shift: { name: string };
}

type PeriodKey = 'today' | 'yesterday' | '7d' | 'month' | 'custom';

function groupShiftsByBreakTime(shifts: ShiftStats[]): ShiftGroup[] {
    const groups = new Map<string, ShiftStats[]>();
    shifts.forEach((shift) => {
        const key =
            shift.breakStartTime && shift.breakEndTime
                ? `${shift.breakStartTime}-${shift.breakEndTime}`
                : `_shift_${shift.shiftId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(shift);
    });

    return Array.from(groups.entries())
        .map(([key, shiftsInGroup]) => ({
            key,
            label: key.startsWith('_shift_') ? shiftsInGroup[0].shiftName : `${shiftsInGroup[0].breakStartTime}–${shiftsInGroup[0].breakEndTime}`,
            shifts: shiftsInGroup,
            shiftIds: shiftsInGroup.map((s) => s.shiftId),
            shiftNames: shiftsInGroup.map((s) => s.shiftName),
            isGrouped: !key.startsWith('_shift_'),
            totalCount: shiftsInGroup.reduce((sum, s) => sum + s.count, 0),
        }))
        .sort((a, b) => a.shifts[0].startTime.localeCompare(b.shifts[0].startTime));
}

function formatDisplayDateRange(startDate: string, endDate: string): string {
    const fmtSingle = (d: string, withDay = false) => {
        const [y, m, day] = d.split('-').map(Number);
        if (!y || !m || !day) return d;
        const dt = new Date(y, m - 1, day);
        return dt.toLocaleDateString('id-ID', {
            ...(withDay ? { weekday: 'long' } : {}),
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    };
    if (startDate === endDate) return fmtSingle(startDate, true);
    return `${fmtSingle(startDate)} – ${fmtSingle(endDate)}`;
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

function isBreakRunningNow(breakRange: string | undefined): 'running' | 'upcoming' | null {
    if (!breakRange || !breakRange.includes('-')) return null;
    const [start, end] = breakRange.replace('–', '-').split('-');
    if (!start || !end) return null;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (hhmm >= start.trim() && hhmm <= end.trim()) return 'running';
    if (hhmm < start.trim()) return 'upcoming';
    return null;
}

export default function DashboardPage() {
    const { isConnected, connectedClients } = useSSE();
    const [stats, setStats] = useState<Stats | null>(null);
    const [todayOrders, setTodayOrders] = useState<Order[]>([]);
    const [allFilteredOrders, setAllFilteredOrders] = useState<Order[]>([]);
    const [tomorrowOrders, setTomorrowOrders] = useState<TomorrowOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [expandedDept, setExpandedDept] = useState<string | null>(null);

    const [period, setPeriod] = useState<PeriodKey>('today');
    const [startDate, setStartDate] = useState(() => getLocalDateString());
    const [endDate, setEndDate] = useState(() => getLocalDateString());

    const applyPeriod = (next: PeriodKey) => {
        setPeriod(next);
        const today = getLocalDateString();
        if (next === 'today') {
            setStartDate(today);
            setEndDate(today);
        } else if (next === 'yesterday') {
            const yest = addDays(today, -1);
            setStartDate(yest);
            setEndDate(yest);
        } else if (next === '7d') {
            setStartDate(addDays(today, -6));
            setEndDate(today);
        } else if (next === 'month') {
            setStartDate(`${today.slice(0, 7)}-01`);
            setEndDate(today);
        }
    };

    const loadData = useCallback(async () => {
        try {
            const tomorrow = addDays(getLocalDateString(), 1);
            const [statsRes, ordersRes, tomorrowRes] = await Promise.all([
                api.get(`/api/orders/stats/range?startDate=${startDate}&endDate=${endDate}`),
                api.get(`/api/orders?startDate=${startDate}&endDate=${endDate}&limit=200`),
                api.get(`/api/orders?startDate=${tomorrow}&endDate=${tomorrow}&limit=100`),
            ]);
            setStats(statsRes.data);
            const allOrders: Order[] = ordersRes.data.orders || [];
            setTodayOrders(allOrders.slice(0, 8));
            setAllFilteredOrders(allOrders);
            setTomorrowOrders((tomorrowRes.data.orders || []).filter((o: Order) => o.status !== 'CANCELLED'));
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        } finally {
            setIsLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useSSERefresh([...ORDER_EVENTS, ...USER_EVENTS], loadData);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const res = await api.get(`/api/orders/export?startDate=${startDate}&endDate=${endDate}`, {
                responseType: 'blob',
            });
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Rekap_Order_${startDate}_${endDate}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Rekap berhasil diekspor');
        } catch {
            toast.error('Gagal mengekspor data');
        } finally {
            setIsExporting(false);
        }
    };

    const companyShiftRecap = useMemo<CompanyShiftRecap[]>(() => {
        const companyMap = new Map<string, Map<string, number>>();
        allFilteredOrders
            .filter((o) => o.status !== 'CANCELLED')
            .forEach((order) => {
                const company = order.user.company || 'Lainnya';
                const shift = order.shift.name;
                if (!companyMap.has(company)) companyMap.set(company, new Map());
                const shiftMap = companyMap.get(company)!;
                shiftMap.set(shift, (shiftMap.get(shift) || 0) + 1);
            });
        const list: CompanyShiftRecap[] = [];
        companyMap.forEach((shifts, company) => {
            const shiftsObj: Record<string, number> = {};
            let total = 0;
            shifts.forEach((count, shiftName) => {
                shiftsObj[shiftName] = count;
                total += count;
            });
            list.push({ company, shifts: shiftsObj, total });
        });
        return list.sort((a, b) => b.total - a.total);
    }, [allFilteredOrders]);

    const maxCanteenCount = useMemo(
        () => Math.max(1, ...(stats?.byCanteen?.map((c) => c.count) || [1])),
        [stats?.byCanteen]
    );

    const todayStr = getLocalDateString();
    const isViewingToday = startDate === todayStr && endDate === todayStr;

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-9 w-72" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
                <Skeleton className="h-44 w-full" />
            </div>
        );
    }

    const totalOrders = stats?.total || 0;
    const pickedUp = stats?.pickedUp || 0;
    const pending = stats?.pending || 0;
    const noShow = stats?.noShow || 0;
    const blacklistedCount = stats?.blacklistedCount || 0;
    const pendingRate = totalOrders > 0 ? Math.round((pending / totalOrders) * 100) : 0;
    const noShowRate = totalOrders > 0 ? Math.round((noShow / totalOrders) * 100) : 0;

    return (
        <div className="space-y-4">
            <PageHeader
                title="Dashboard"
                subtitle={formatDisplayDateRange(startDate, endDate)}
                actions={
                    <>
                        <div
                            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border ${
                                isConnected
                                    ? 'bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]'
                                    : 'bg-[#fee2e2] text-[#b91c1c] border-[#fecaca]'
                            }`}
                        >
                            <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                            <span className="tabular-nums">{connectedClients}</span>
                        </div>
                        <SegmentedControl
                            ariaLabel="Rentang tanggal dashboard"
                            layoutId="dashboard-period"
                            value={period}
                            onChange={(v) => applyPeriod(v as PeriodKey)}
                            options={[
                                { value: 'today', label: 'Hari ini' },
                                { value: 'yesterday', label: 'Kemarin' },
                                { value: '7d', label: '7 hari' },
                                { value: 'month', label: 'Bulan ini' },
                                { value: 'custom', label: 'Kustom' },
                            ]}
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleExport}
                            loading={isExporting}
                            leftIcon={<Download className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Ekspor
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadData}
                            aria-label="Muat ulang dashboard"
                            leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Muat ulang
                        </Button>
                        <Link
                            to={`/admin/orders?date=${startDate}`}
                            className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] text-[13px] font-semibold bg-[#f59e0b] hover:bg-[#d97706] text-[#1c1917] no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
                        >
                            <List className="w-3.5 h-3.5" aria-hidden="true" />
                            Lihat detail order
                        </Link>
                    </>
                }
            />

            {period === 'custom' && (
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

            {/* Holiday Alert */}
            {stats?.holidays && stats.holidays.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-[14px] bg-[#fffbeb] border border-[#fde68a]">
                    <Calendar className="w-5 h-5 text-[#b45309] flex-shrink-0" aria-hidden="true" />
                    <div className="text-[13px] text-[#78350f]">
                        <span className="font-semibold">Hari Libur Terjadwal: </span>
                        {stats.holidays.map((h) => `${h.name} (${h.shiftName})`).join(', ')}
                    </div>
                </div>
            )}

            {/* 5-card KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatTile label="Total order" value={totalOrders} color="#f59e0b" sub="Pesanan aktif" />
                <StatTile
                    label="Sudah diambil"
                    value={pickedUp}
                    color="#16a34a"
                    valueColor="#15803d"
                    sub={`${stats?.pickupRate || 0}% pickup rate`}
                />
                <StatTile
                    label="Menunggu"
                    value={pending}
                    color="#2563eb"
                    valueColor="#1d4ed8"
                    sub={`${pendingRate}% belum scan`}
                />
                <StatTile
                    label="Tidak diambil"
                    value={noShow}
                    color="#dc2626"
                    valueColor="#b91c1c"
                    sub={`${noShowRate}% waste`}
                />
                <StatTile
                    label="Diblacklist"
                    value={blacklistedCount}
                    color="#57534e"
                    sub={
                        stats?.usersAtRisk?.length
                            ? `${stats.usersAtRisk.length} user di batas strike`
                            : 'Status blacklist aktif'
                    }
                />
            </div>

            {/* Pengambilan per waktu istirahat */}
            <Card>
                <div className="flex items-center justify-between gap-2 mb-3.5">
                    <div>
                        <h2 className="text-[15px] font-bold text-[#1c1917]">
                            Pengambilan per waktu istirahat
                        </h2>
                        <p className="text-[12.5px] text-[#78716c]">
                            Ringkasan real-time per jadwal makan
                        </p>
                    </div>
                    <Badge variant="neutral">{groupShiftsByBreakTime(stats?.byShift || []).length} waktu</Badge>
                </div>

                {stats?.byShift && stats.byShift.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {groupShiftsByBreakTime(stats.byShift).map((group) => {
                            const groupOrders = allFilteredOrders.filter(
                                (o) => group.shiftNames.includes(o.shift.name) && o.status !== 'CANCELLED'
                            );
                            const gPicked = groupOrders.filter((o) => o.status === 'PICKED_UP').length;
                            const gPending = groupOrders.filter((o) => o.status === 'ORDERED').length;
                            const gNoShow = groupOrders.filter((o) => o.status === 'NO_SHOW').length;
                            const gTotal = Math.max(groupOrders.length, group.totalCount);
                            const timeString = group.isGrouped
                                ? `${group.shifts[0].breakStartTime}-${group.shifts[0].breakEndTime}`
                                : `${group.shifts[0].startTime}-${group.shifts[0].endTime}`;
                            const liveState = isViewingToday ? isBreakRunningNow(timeString) : null;

                            return (
                                <div
                                    key={group.key}
                                    className={`rounded-[12px] p-3.5 border transition-colors ${
                                        liveState === 'running'
                                            ? 'bg-[#f0fdf4] border-[#86efac]'
                                            : 'bg-[#fafaf9] border-[#e7e5e4]'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="text-[13.5px] font-bold text-[#1c1917]">
                                                {group.label}
                                            </div>
                                            <div className="text-[12px] text-[#78716c]">
                                                {group.isGrouped
                                                    ? group.shiftNames.join(', ')
                                                    : `${group.shifts[0].startTime} – ${group.shifts[0].endTime}`}
                                            </div>
                                        </div>
                                        {liveState === 'running' && (
                                            <Badge variant="success" dot>
                                                Berjalan
                                            </Badge>
                                        )}
                                        {liveState === 'upcoming' && <Badge variant="info">Akan datang</Badge>}
                                    </div>

                                    <div className="mt-3 mb-2 flex items-baseline gap-1.5">
                                        <span className="text-[24px] font-extrabold text-[#1c1917] tabular-nums leading-none">
                                            {gPicked}
                                        </span>
                                        <span className="text-[12.5px] text-[#78716c] tabular-nums">
                                            dari {gTotal} diambil
                                        </span>
                                    </div>

                                    <ProgressBar value={gPicked} max={Math.max(1, gTotal)} color="#16a34a" height="md" />

                                    <div className="mt-2.5 flex justify-between text-[12px] text-[#78716c] tabular-nums">
                                        <span>Belum: {gPending}</span>
                                        <span className={gNoShow > 0 ? 'text-[#b91c1c] font-semibold' : ''}>
                                            Tidak diambil: {gNoShow}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState
                        title="Belum ada order pada rentang ini"
                        description="Data pengambilan per waktu istirahat akan tampil setelah karyawan melakukan pemesanan."
                    />
                )}
            </Card>

            {/* Bottom 3-column row: Order per kantin + Rekap per departemen + Order terbaru */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr_1fr] gap-4">
                {/* Order per kantin */}
                <Card>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
                            <h2 className="text-[14px] font-bold text-[#1c1917]">Order per kantin</h2>
                        </div>
                        <span className="text-[12px] text-[#78716c] tabular-nums">
                            {stats?.byCanteen?.length || 0} lokasi
                        </span>
                    </div>
                    {stats?.byCanteen && stats.byCanteen.length > 0 ? (
                        <div className="space-y-3">
                            {stats.byCanteen.map((c) => {
                                const pct = Math.round((c.count / maxCanteenCount) * 100);
                                return (
                                    <div key={c.canteenId} className="space-y-1.5">
                                        <div className="flex items-center justify-between text-[13px]">
                                            <span className="font-semibold text-[#1c1917] truncate">
                                                {c.canteenName}
                                            </span>
                                            <span className="font-bold text-[#1c1917] tabular-nums">
                                                {c.count.toLocaleString('id-ID')}
                                            </span>
                                        </div>
                                        <ProgressBar value={pct} max={100} color="#f59e0b" height="sm" />
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-[13px] text-[#78716c] py-6 text-center">Tidak ada data kantin</p>
                    )}
                </Card>

                {/* Rekap per departemen */}
                <Card padding="none">
                    <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#f5f5f4]">
                        <div className="flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
                            <h2 className="text-[14px] font-bold text-[#1c1917]">Rekap per departemen</h2>
                        </div>
                        <Link
                            to={`/admin/orders?date=${startDate}`}
                            className="text-[12.5px] font-semibold text-[#b45309] hover:text-[#92400e] no-underline"
                        >
                            Lihat semua →
                        </Link>
                    </div>
                    {stats?.byDepartment && stats.byDepartment.length > 0 ? (
                        <div className="max-h-[300px] overflow-y-auto divide-y divide-[#f5f5f4]">
                            {stats.byDepartment.map((dept) => {
                                const isExpanded = expandedDept === dept.name;
                                return (
                                    <div key={dept.name}>
                                        <button
                                            type="button"
                                            onClick={() => setExpandedDept(isExpanded ? null : dept.name)}
                                            className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-[#fafaf9] border-0 bg-transparent cursor-pointer transition-colors"
                                        >
                                            <div className="min-w-0 pr-3">
                                                <div className="text-[13px] font-semibold text-[#1c1917] truncate">
                                                    {dept.name}
                                                </div>
                                                <div className="text-[11.5px] text-[#78716c] tabular-nums">
                                                    Rp {(dept.cost || 0).toLocaleString('id-ID')}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 flex-shrink-0 text-[12.5px] tabular-nums">
                                                <span className="font-semibold text-[#1c1917]">{dept.total} order</span>
                                                <span className="text-[#15803d] font-semibold">{dept.pickedUp} diambil</span>
                                                {isExpanded ? (
                                                    <ChevronUp className="w-4 h-4 text-[#a8a29e]" aria-hidden="true" />
                                                ) : (
                                                    <ChevronDown className="w-4 h-4 text-[#a8a29e]" aria-hidden="true" />
                                                )}
                                            </div>
                                        </button>
                                        {isExpanded && dept.byShift && (
                                            <div className="px-4 pb-3 pt-1 bg-[#fafaf9] space-y-1">
                                                {dept.byShift.map((s) => (
                                                    <div
                                                        key={s.shiftName}
                                                        className="flex items-center justify-between text-[12px] py-1 px-2.5 rounded-[7px] bg-[#fff] border border-[#e7e5e4]"
                                                    >
                                                        <span className="text-[#57534e]">{s.shiftName}</span>
                                                        <div className="flex gap-3 tabular-nums">
                                                            <span className="text-[#1c1917] font-medium">{s.total}</span>
                                                            <span className="text-[#15803d]">{s.pickedUp} diambil</span>
                                                            <span className="text-[#b91c1c]">{s.noShow} batal/no-show</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-[13px] text-[#78716c] py-8 text-center">Tidak ada data departemen</p>
                    )}
                </Card>

                {/* Order terbaru */}
                <Card>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-[14px] font-bold text-[#1c1917]">Order terbaru</h2>
                        <span className="text-[12px] text-[#78716c] tabular-nums">
                            {todayOrders.length} terakhir
                        </span>
                    </div>
                    {todayOrders.length > 0 ? (
                        <div className="space-y-2.5 max-h-[260px] overflow-y-auto">
                            {todayOrders.map((order) => (
                                <div key={order.id} className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-[#f5f5f4] text-[#57534e] text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                                        {getInitials(order.user.name)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-semibold text-[#1c1917] truncate">
                                            {order.user.name}
                                        </div>
                                        <div className="text-[11.5px] text-[#78716c] truncate">
                                            {order.shift.name}
                                        </div>
                                    </div>
                                    <OrderStatusBadge status={order.status} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[13px] text-[#78716c] py-8 text-center">Belum ada order</p>
                    )}
                </Card>
            </div>

            {/* Operational warnings: User Berisiko + Tidak Diambil */}
            {((stats?.usersAtRisk && stats.usersAtRisk.length > 0) ||
                (stats?.noShowUsers?.today && stats.noShowUsers.today.length > 0) ||
                (stats?.noShowUsers?.yesterday && stats.noShowUsers.yesterday.length > 0)) && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {stats?.usersAtRisk && stats.usersAtRisk.length > 0 && (
                        <Card>
                            <div className="flex items-center gap-2 mb-3">
                                <AlertTriangle className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
                                <div>
                                    <h3 className="text-[14px] font-bold text-[#1c1917]">User Berisiko</h3>
                                    <p className="text-[12px] text-[#78716c]">
                                        {stats.blacklistStrikes - 1} dari {stats.blacklistStrikes} strike
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-2 max-h-[220px] overflow-y-auto">
                                {stats.usersAtRisk.map((u) => (
                                    <div
                                        key={u.id}
                                        className="flex items-center justify-between px-3 py-2 rounded-[10px] bg-[#fffbeb] border border-[#fde68a]"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-[13px] font-semibold text-[#1c1917] truncate">
                                                {u.name}
                                            </div>
                                            <div className="text-[11.5px] text-[#78716c] font-mono">
                                                {u.externalId}
                                            </div>
                                        </div>
                                        <Badge variant="warning">{u.noShowCount} strike</Badge>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {stats?.noShowUsers?.today && stats.noShowUsers.today.length > 0 && (
                        <Card>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <XCircle className="w-4 h-4 text-[#b91c1c]" aria-hidden="true" />
                                    <h3 className="text-[14px] font-bold text-[#1c1917]">
                                        Tidak diambil hari ini
                                    </h3>
                                </div>
                                <Badge variant="danger">{stats.noShowUsers.today.length}</Badge>
                            </div>
                            <div className="space-y-2 max-h-[220px] overflow-y-auto">
                                {stats.noShowUsers.today.map((u, idx) => (
                                    <div
                                        key={`${u.userId}-${idx}`}
                                        className="flex items-center justify-between px-3 py-2 rounded-[10px] bg-[#fef2f2] border border-[#fecaca]"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-[13px] font-semibold text-[#1c1917] truncate">
                                                {u.name}
                                            </div>
                                            <div className="text-[11.5px] text-[#78716c]">
                                                {u.externalId} · {u.shiftName}
                                            </div>
                                        </div>
                                        <Badge variant="danger">{u.noShowCount} total</Badge>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {stats?.noShowUsers?.yesterday && stats.noShowUsers.yesterday.length > 0 && (
                        <Card>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
                                    <h3 className="text-[14px] font-bold text-[#1c1917]">
                                        Tidak diambil kemarin
                                    </h3>
                                </div>
                                <Badge variant="warning">{stats.noShowUsers.yesterday.length}</Badge>
                            </div>
                            <div className="space-y-2 max-h-[220px] overflow-y-auto">
                                {stats.noShowUsers.yesterday.map((u, idx) => (
                                    <div
                                        key={`${u.userId}-${idx}`}
                                        className="flex items-center justify-between px-3 py-2 rounded-[10px] bg-[#fffbeb] border border-[#fde68a]"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-[13px] font-semibold text-[#1c1917] truncate">
                                                {u.name}
                                            </div>
                                            <div className="text-[11.5px] text-[#78716c]">
                                                {u.externalId} · {u.shiftName}
                                            </div>
                                        </div>
                                        <Badge variant="warning">{u.noShowCount} total</Badge>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {/* Rekap per Perusahaan */}
            {companyShiftRecap.length > 0 && (
                <Card padding="none">
                    <div className="px-4 py-3.5 border-b border-[#f5f5f4] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-[#2563eb]" aria-hidden="true" />
                            <h2 className="text-[14px] font-bold text-[#1c1917]">Rekap per perusahaan</h2>
                        </div>
                        <span className="text-[12px] text-[#78716c] tabular-nums">
                            {companyShiftRecap.length} perusahaan
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                    <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Perusahaan
                                    </th>
                                    {stats?.byShift?.map((s) => (
                                        <th
                                            key={s.shiftName}
                                            className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]"
                                        >
                                            {s.shiftName}
                                        </th>
                                    ))}
                                    <th className="text-right px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Total
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#f5f5f4]">
                                {companyShiftRecap.map((row) => (
                                    <tr key={row.company} className="hover:bg-[#fafaf9]">
                                        <td className="px-4 py-2.5 font-semibold text-[#1c1917]">
                                            {row.company}
                                        </td>
                                        {stats?.byShift?.map((s) => (
                                            <td
                                                key={s.shiftName}
                                                className="px-3 py-2.5 text-right text-[#57534e] tabular-nums"
                                            >
                                                {row.shifts[s.shiftName] || 0}
                                            </td>
                                        ))}
                                        <td className="px-4 py-2.5 text-right font-bold text-[#b45309] tabular-nums">
                                            {row.total}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Order Besok */}
            {tomorrowOrders.length > 0 && (
                <Card padding="none">
                    <div className="px-4 py-3.5 border-b border-[#f5f5f4] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-[#0d9488]" aria-hidden="true" />
                            <h2 className="text-[14px] font-bold text-[#1c1917]">Order besok</h2>
                        </div>
                        <div className="flex items-center gap-3">
                            <Badge variant="info">{tomorrowOrders.length} pesanan</Badge>
                            {tomorrowOrders.length > 8 && (
                                <Link
                                    to={`/admin/orders?date=${addDays(getLocalDateString(), 1)}`}
                                    className="text-[12.5px] font-semibold text-[#b45309] hover:text-[#92400e] no-underline"
                                >
                                    Lihat semua →
                                </Link>
                            )}
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                    <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Nama
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        ID
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Perusahaan
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Departemen
                                    </th>
                                    <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Shift
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#f5f5f4]">
                                {tomorrowOrders.slice(0, 8).map((o) => (
                                    <tr key={o.id} className="hover:bg-[#fafaf9]">
                                        <td className="px-4 py-2.5 font-semibold text-[#1c1917]">
                                            {o.user.name}
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-[12px] text-[#57534e]">
                                            {o.user.externalId}
                                        </td>
                                        <td className="px-3 py-2.5 text-[#57534e]">{o.user.company || '-'}</td>
                                        <td className="px-3 py-2.5 text-[#57534e]">{o.user.department || '-'}</td>
                                        <td className="px-4 py-2.5">
                                            <Badge variant="info">{o.shift.name}</Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}
