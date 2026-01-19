import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { api } from '../../contexts/AuthContext';
import { useSSE, useSSERefresh, ORDER_EVENTS, USER_EVENTS } from '../../contexts/SSEContext';
import {
    LayoutDashboard,
    CheckCircle2,
    Clock,
    XCircle,
    TrendingUp,
    Loader2,
    RefreshCw,
    Wifi,
    Building2,
    Briefcase,
    AlertTriangle,
    Calendar,
    Ban,
    Percent,
    Users,
    Zap,
    ChevronDown,
    ChevronUp,
    CalendarDays,
    List
} from 'lucide-react';

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
    isGrouped: boolean;
    totalCount: number;
}

// Group shifts by break time for merged display
const groupShiftsByBreakTime = (shifts: ShiftStats[]): ShiftGroup[] => {
    const groups: Map<string, ShiftStats[]> = new Map();

    shifts.forEach(shift => {
        const key = shift.breakStartTime && shift.breakEndTime
            ? `${shift.breakStartTime}-${shift.breakEndTime}`
            : `_shift_${shift.shiftId}`;

        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(shift);
    });

    return Array.from(groups.entries()).map(([key, shiftsInGroup]) => ({
        key,
        label: key.startsWith('_shift_') ? shiftsInGroup[0].shiftName : key,
        shifts: shiftsInGroup,
        shiftIds: shiftsInGroup.map(s => s.shiftId),
        isGrouped: !key.startsWith('_shift_'),
        totalCount: shiftsInGroup.reduce((sum, s) => sum + s.count, 0)
    })).sort((a, b) => a.shifts[0].startTime.localeCompare(b.shifts[0].startTime));
};

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
    oderId: string;
    oderId2?: string;
    oderId3?: string;
    oderId4?: string;
    oderId5?: string;
    oderId6?: string;
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
    shifts: { [shiftName: string]: number };
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
    companyShiftRecap?: CompanyShiftRecap[];
    tomorrowOrders?: TomorrowOrder[];
}

interface Order {
    id: string;
    status: string;
    orderTime: string;
    orderDate: string;
    user: { name: string; externalId: string; company: string; department: string };
    shift: { name: string };
}

export default function DashboardPage() {
    const { isConnected, connectedClients } = useSSE();
    const [stats, setStats] = useState<Stats | null>(null);
    const [todayOrders, setTodayOrders] = useState<Order[]>([]);
    const [allFilteredOrders, setAllFilteredOrders] = useState<Order[]>([]);
    const [tomorrowOrders, setTomorrowOrders] = useState<TomorrowOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedDept, setExpandedDept] = useState<string | null>(null);

    // Date range state - use local date format to avoid UTC timezone issues
    const getLocalDateString = (date: Date = new Date()): string => {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [startDate, setStartDate] = useState(() => getLocalDateString());
    const [endDate, setEndDate] = useState(() => getLocalDateString());

    const loadData = useCallback(async () => {
        try {
            const tomorrow = getLocalDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));

            const [statsRes, ordersRes, tomorrowRes] = await Promise.all([
                api.get(`/api/orders/stats/range?startDate=${startDate}&endDate=${endDate}`),
                api.get(`/api/orders?startDate=${startDate}&endDate=${endDate}&limit=100`),
                api.get(`/api/orders?startDate=${tomorrow}&endDate=${tomorrow}&limit=100`),
            ]);
            setStats(statsRes.data);

            const allOrders: Order[] = ordersRes.data.orders;
            setTodayOrders(allOrders.slice(0, 10));
            setAllFilteredOrders(allOrders); // Store all orders for recap calculation

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

    // Quick date range helpers
    const setToday = () => {
        const today = getLocalDateString();
        setStartDate(today);
        setEndDate(today);
    };

    const setYesterday = () => {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const yesterdayStr = getLocalDateString(yesterday);
        setStartDate(yesterdayStr);
        setEndDate(yesterdayStr);
    };

    const setLast7Days = () => {
        const end = getLocalDateString();
        const start = getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
        setStartDate(start);
        setEndDate(end);
    };

    const setThisMonth = () => {
        const now = new Date();
        const start = getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
        const end = getLocalDateString();
        setStartDate(start);
        setEndDate(end);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto" />
                    <p className="text-slate-500 mt-4">Memuat dashboard...</p>
                </div>
            </div>
        );
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'PICKED_UP': return 'badge-success';
            case 'ORDERED': return 'badge-info';
            case 'NO_SHOW': return 'badge-danger';
            case 'CANCELLED': return 'badge-warning';
            default: return 'badge-neutral';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'PICKED_UP': return 'Diambil';
            case 'ORDERED': return 'Pending';
            case 'NO_SHOW': return 'Tidak Diambil';
            case 'CANCELLED': return 'Batal';
            default: return status;
        }
    };

    // Build company-shift recap from ALL filtered orders (not just the displayed 10)
    // Filter out cancelled orders to match the total count
    const companyShiftRecap: CompanyShiftRecap[] = [];
    const companyMap = new Map<string, Map<string, number>>();

    allFilteredOrders
        .filter(order => order.status !== 'CANCELLED')
        .forEach(order => {
            const company = order.user.company || 'Unknown';
            const shift = order.shift.name;

            if (!companyMap.has(company)) {
                companyMap.set(company, new Map());
            }
            const shiftMap = companyMap.get(company)!;
            shiftMap.set(shift, (shiftMap.get(shift) || 0) + 1);
        });

    companyMap.forEach((shifts, company) => {
        const shiftsObj: { [key: string]: number } = {};
        let total = 0;
        shifts.forEach((count, shiftName) => {
            shiftsObj[shiftName] = count;
            total += count;
        });
        companyShiftRecap.push({ company, shifts: shiftsObj, total });
    });


    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <Zap className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-[#1a1f37]">Dashboard</h1>
                        <p className="text-slate-500">
                            {startDate === endDate
                                ? format(new Date(startDate), 'EEEE, dd MMMM yyyy', { locale: id })
                                : `${format(new Date(startDate), 'dd MMM yyyy', { locale: id })} - ${format(new Date(endDate), 'dd MMM yyyy', { locale: id })}`
                            }
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${isConnected
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-red-50 text-red-600'
                        }`}>
                        <div className="relative">
                            <Wifi className="w-4 h-4" />
                            {isConnected && <span className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-30" />}
                        </div>
                        <span>{connectedClients} terhubung</span>
                    </div>
                    <Link
                        to={`/admin/orders?date=${startDate}`}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <List className="w-4 h-4" />
                        Lihat Detail Order
                    </Link>
                    <button onClick={loadData} className="btn-primary flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Date Range Filter */}
            <div className="card">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-orange-500" />
                        <span className="text-sm font-medium text-[#1a1f37]">Filter Tanggal:</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={setToday}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${startDate === endDate && startDate === getLocalDateString()
                                ? 'bg-orange-500 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            Hari Ini
                        </button>
                        <button
                            onClick={setYesterday}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${startDate === endDate && startDate === getLocalDateString(new Date(Date.now() - 24 * 60 * 60 * 1000))
                                ? 'bg-orange-500 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            Kemarin
                        </button>
                        <button
                            onClick={setLast7Days}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                        >
                            7 Hari Terakhir
                        </button>
                        <button
                            onClick={setThisMonth}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                        >
                            Bulan Ini
                        </button>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="input-field"
                        />
                        <span className="text-slate-400">—</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="input-field"
                        />
                    </div>
                </div>
            </div>

            {/* Holiday Alert */}
            {stats?.holidays && stats.holidays.length > 0 && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-warning/20 to-warning/5 border border-warning/30">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-warning" />
                        </div>
                        <div>
                            <p className="font-semibold text-warning">Hari Libur</p>
                            <p className="text-sm text-white/60">
                                {stats.holidays.map(h => `${h.name} (${h.shiftName})`).join(', ')}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard
                    icon={<LayoutDashboard className="w-5 h-5" />}
                    label="Total Order"
                    value={stats?.total || 0}
                    gradient="from-orange-500 to-amber-500"
                />
                <StatCard
                    icon={<CheckCircle2 className="w-5 h-5" />}
                    label="Sudah Diambil"
                    value={stats?.pickedUp || 0}
                    gradient="from-emerald-500 to-teal-500"
                    valueColor="text-emerald-600"
                />
                <StatCard
                    icon={<Clock className="w-5 h-5" />}
                    label="Menunggu"
                    value={stats?.pending || 0}
                    gradient="from-blue-500 to-cyan-500"
                    valueColor="text-blue-600"
                />
                <StatCard
                    icon={<XCircle className="w-5 h-5" />}
                    label="Tidak Diambil"
                    value={stats?.noShow || 0}
                    gradient="from-red-500 to-rose-500"
                    valueColor="text-red-600"
                />
                <StatCard
                    icon={<Percent className="w-5 h-5" />}
                    label="Tingkat Ambil"
                    value={`${stats?.pickupRate || 0}%`}
                    gradient="from-purple-500 to-pink-500"
                />
                <StatCard
                    icon={<Ban className="w-5 h-5" />}
                    label="Diblacklist"
                    value={stats?.blacklistedCount || 0}
                    gradient="from-rose-500 to-red-600"
                    valueColor="text-red-600"
                />
            </div>

            {/* Main Grid - Row 1: Shift Performance (Full Width) */}
            <div className="grid grid-cols-1 gap-6">
                {/* Shift Performance with Donut Charts - Grouped by Break Time */}
                <div className="card">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-lg font-bold text-white">Pengambilan Makan per Waktu Istirahat</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {stats?.byShift && groupShiftsByBreakTime(stats.byShift).map((group) => {
                            // Calculate combined stats for all shifts in this group
                            const groupOrders = allFilteredOrders.filter(o =>
                                group.shifts.some(s => s.shiftName === o.shift.name) && o.status !== 'CANCELLED'
                            );
                            const pickedUp = groupOrders.filter(o => o.status === 'PICKED_UP').length;
                            const pending = groupOrders.filter(o => o.status === 'ORDERED').length;
                            const noShow = groupOrders.filter(o => o.status === 'NO_SHOW').length;
                            const total = groupOrders.length;

                            return (
                                <div key={group.key} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-primary-500/30 transition-all">
                                    <div className="text-center mb-3">
                                        <p className="font-semibold text-white">
                                            {group.isGrouped ? group.label : group.shifts[0].shiftName}
                                        </p>
                                        {group.isGrouped ? (
                                            <p className="text-xs text-white/40 mt-0.5">
                                                {group.shifts.map(s => s.shiftName).join(', ')}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-white/40">
                                                {group.shifts[0].startTime} - {group.shifts[0].endTime}
                                            </p>
                                        )}
                                    </div>

                                    {/* Donut Chart */}
                                    <div className="flex justify-center mb-4">
                                        <DonutChart
                                            pickedUp={pickedUp}
                                            pending={pending}
                                            total={total}
                                            size={120}
                                        />
                                    </div>

                                    {/* Legend */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="flex items-center gap-2">
                                                <span className="w-3 h-3 rounded-full bg-gradient-to-r from-success to-accent-teal" />
                                                <span className="text-white/70">Sudah Diambil</span>
                                            </span>
                                            <span className="font-bold text-success">{pickedUp}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="flex items-center gap-2">
                                                <span className="w-3 h-3 rounded-full bg-gradient-to-r from-warning to-orange-400" />
                                                <span className="text-white/70">Belum Diambil</span>
                                            </span>
                                            <span className="font-bold text-warning">{pending}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="flex items-center gap-2">
                                                <span className="w-3 h-3 rounded-full bg-gradient-to-r from-red-500 to-rose-500" />
                                                <span className="text-white/70">Tidak Diambil</span>
                                            </span>
                                            <span className="font-bold text-red-500">{noShow}</span>
                                        </div>
                                        <div className="pt-2 mt-2 border-t border-white/10 flex items-center justify-between text-sm">
                                            <span className="text-white/50">Total Pesanan</span>
                                            <span className="font-bold text-white">{total}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {(!stats?.byShift || stats.byShift.length === 0) && (
                            <div className="col-span-full">
                                <p className="text-white/40 text-center py-8">Belum ada order hari ini</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Grid - Row 2: Canteen + Department + Users At Risk */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Canteen Stats */}
                <div className="card">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-lg font-bold text-white">Order per Kantin</h2>
                    </div>
                    <div className="space-y-4">
                        {stats?.byCanteen && stats.byCanteen.length > 0 ? (
                            stats.byCanteen.map((canteen) => (
                                <div key={canteen.canteenId} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-orange-500/30 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold">
                                            {canteen.canteenName.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-white">{canteen.canteenName}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-bold text-white">{canteen.count}</p>
                                        <p className="text-xs text-white/50">pesanan</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-white/40 text-center py-8">Tidak ada data kantin</p>
                        )}
                    </div>
                </div>

                {/* Department Stats */}
                <div className="card">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple to-accent-pink flex items-center justify-center">
                            <Briefcase className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-lg font-bold text-white">Rekap per Departemen</h2>
                    </div>
                    <div className="space-y-2 max-h-[350px] overflow-y-auto">
                        {stats?.byDepartment && stats.byDepartment.length > 0 ? (
                            stats.byDepartment.map((dept) => (
                                <div key={dept.name} className="rounded-xl bg-white/5 border border-white/5 overflow-hidden">
                                    <button
                                        onClick={() => setExpandedDept(expandedDept === dept.name ? null : dept.name)}
                                        className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="font-medium text-white">{dept.name}</span>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400">
                                                {dept.total} order
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex gap-2 text-xs">
                                                <span className="text-success">{dept.pickedUp} diambil</span>
                                                <span className="text-emerald-400 font-medium">Rp {dept.cost?.toLocaleString('id-ID') || 0}</span>
                                            </div>
                                            {expandedDept === dept.name ? (
                                                <ChevronUp className="w-4 h-4 text-white/40" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-white/40" />
                                            )}
                                        </div>
                                    </button>
                                    {expandedDept === dept.name && dept.byShift && (
                                        <div className="px-3 pb-3 pt-1 border-t border-white/5">
                                            <div className="space-y-1">
                                                {dept.byShift.map((shift) => (
                                                    <div key={shift.shiftName} className="flex items-center justify-between py-1.5 px-2 rounded bg-white/5 text-sm">
                                                        <span className="text-white/70">{shift.shiftName}</span>
                                                        <div className="flex gap-3 text-xs">
                                                            <span className="text-white">{shift.total}</span>
                                                            <span className="text-success">{shift.pickedUp}</span>
                                                            <span className="text-danger">{shift.noShow}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-white/40 text-center py-8">Tidak ada data departemen</p>
                        )}
                    </div>
                </div>

                {/* Users at Risk & Recent Orders - Combined */}
                <div className="space-y-6">
                    {stats?.usersAtRisk && stats.usersAtRisk.length > 0 && (
                        <div className="card border-warning/30">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-warning" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">User Berisiko</h2>
                                    <p className="text-xs text-white/40">{stats.blacklistStrikes - 1} dari {stats.blacklistStrikes} strike</p>
                                </div>
                            </div>
                            <div className="space-y-2 max-h-[160px] overflow-y-auto">
                                {stats.usersAtRisk.map((user) => (
                                    <div key={user.id} className="flex items-center justify-between p-3 rounded-xl bg-warning/10 border border-warning/20">
                                        <div>
                                            <p className="font-medium text-white">{user.name}</p>
                                            <p className="text-xs text-white/40">{user.externalId}</p>
                                        </div>
                                        <span className="badge badge-warning">{user.noShowCount} strike</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="card">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-success to-accent-teal flex items-center justify-center">
                                <Users className="w-5 h-5 text-white" />
                            </div>
                            <h2 className="text-lg font-bold text-white">Order Terbaru</h2>
                        </div>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                            {todayOrders.slice(0, 5).map((order) => (
                                <div key={order.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                                    <div>
                                        <p className="font-medium text-white">{order.user.name}</p>
                                        <p className="text-xs text-white/40">{order.shift.name}</p>
                                    </div>
                                    <span className={`badge ${getStatusBadge(order.status)}`}>
                                        {getStatusLabel(order.status)}
                                    </span>
                                </div>
                            ))}
                            {todayOrders.length === 0 && (
                                <p className="text-white/40 text-center py-4">Belum ada order</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Row 3 - Company-Shift Recap (Full Width) */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-info to-accent-cyan flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-lg font-bold text-white">Rekap per Perusahaan</h2>
                </div>
                {companyShiftRecap.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left py-3 px-2 text-white/50 font-medium">Perusahaan</th>
                                    {stats?.byShift?.map(s => (
                                        <th key={s.shiftName} className="text-center py-3 px-2 text-white/50 font-medium">{s.shiftName}</th>
                                    ))}
                                    <th className="text-center py-3 px-2 text-white/50 font-medium">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {companyShiftRecap.map((row) => (
                                    <tr key={row.company} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                        <td className="py-3 px-2 font-medium text-white">{row.company}</td>
                                        {stats?.byShift?.map(s => (
                                            <td key={s.shiftName} className="text-center py-3 px-2 text-white/70">
                                                {row.shifts[s.shiftName] || 0}
                                            </td>
                                        ))}
                                        <td className="text-center py-3 px-2 font-bold text-primary-400">{row.total}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-white/40 text-center py-8">Belum ada data</p>
                )}
            </div>

            {/* Row 4 - No Show Users */}
            {
                ((stats?.noShowUsers?.today && stats.noShowUsers.today.length > 0) ||
                    (stats?.noShowUsers?.yesterday && stats.noShowUsers.yesterday.length > 0)) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Today's Tidak Diambil */}
                        {stats?.noShowUsers?.today && stats.noShowUsers.today.length > 0 && (
                            <div className="card border-danger/30">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-danger/20 flex items-center justify-center">
                                        <XCircle className="w-5 h-5 text-danger" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Tidak Diambil Hari Ini</h2>
                                        <p className="text-xs text-white/40">{stats.noShowUsers.today.length} user</p>
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {stats.noShowUsers.today.map((user, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-danger/10 border border-danger/20">
                                            <div>
                                                <p className="font-medium text-white">{user.name}</p>
                                                <p className="text-xs text-white/40">{user.externalId} • {user.shiftName}</p>
                                            </div>
                                            <span className="badge badge-danger">{user.noShowCount} total</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Yesterday's Tidak Diambil */}
                        {stats?.noShowUsers?.yesterday && stats.noShowUsers.yesterday.length > 0 && (
                            <div className="card border-warning/30">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
                                        <Clock className="w-5 h-5 text-warning" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Tidak Diambil Kemarin</h2>
                                        <p className="text-xs text-white/40">{stats.noShowUsers.yesterday.length} user</p>
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {stats.noShowUsers.yesterday.map((user, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-warning/10 border border-warning/20">
                                            <div>
                                                <p className="font-medium text-white">{user.name}</p>
                                                <p className="text-xs text-white/40">{user.externalId} • {user.shiftName}</p>
                                            </div>
                                            <span className="badge badge-warning">{user.noShowCount} total</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )
            }

            {/* Row 4 - Tomorrow's Orders */}
            {
                tomorrowOrders.length > 0 && (
                    <div className="card">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-cyan to-info flex items-center justify-center">
                                <CalendarDays className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Order Besok</h2>
                                <p className="text-xs text-white/40">{tomorrowOrders.length} pesanan</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left py-3 px-3 text-white/50 font-medium">Nama</th>
                                        <th className="text-left py-3 px-3 text-white/50 font-medium">ID</th>
                                        <th className="text-left py-3 px-3 text-white/50 font-medium">Perusahaan</th>
                                        <th className="text-left py-3 px-3 text-white/50 font-medium">Departemen</th>
                                        <th className="text-left py-3 px-3 text-white/50 font-medium">Shift</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tomorrowOrders.slice(0, 10).map((order) => (
                                        <tr key={order.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="py-3 px-3 font-medium text-white">{order.user.name}</td>
                                            <td className="py-3 px-3 text-white/70 font-mono text-xs">{order.user.externalId}</td>
                                            <td className="py-3 px-3 text-white/70">{order.user.company || '-'}</td>
                                            <td className="py-3 px-3 text-white/70">{order.user.department || '-'}</td>
                                            <td className="py-3 px-3">
                                                <span className="badge badge-info">{order.shift.name}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {tomorrowOrders.length > 10 && (
                                <div className="flex items-center justify-between px-3 py-3 border-t border-white/5">
                                    <p className="text-white/40 text-sm">
                                        +{tomorrowOrders.length - 10} pesanan lainnya
                                    </p>
                                    <Link
                                        to={`/admin/orders?date=${getLocalDateString(new Date(Date.now() + 24 * 60 * 60 * 1000))}`}
                                        className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors"
                                    >
                                        Lihat Semua
                                        <ChevronUp className="w-4 h-4 rotate-90" />
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }
        </div >
    );
}

function DonutChart({ pickedUp, pending, total, size = 120 }: {
    pickedUp: number;
    pending: number;
    total: number;
    size?: number;
}) {
    const strokeWidth = 12;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    const pickedUpPercent = total > 0 ? (pickedUp / total) * 100 : 0;
    const pendingPercent = total > 0 ? (pending / total) * 100 : 0;

    const pickedUpOffset = circumference - (pickedUpPercent / 100) * circumference;
    const pendingOffset = circumference - (pendingPercent / 100) * circumference;

    // Starting angle for pending (after picked up)
    const pendingRotation = (pickedUpPercent / 100) * 360 - 90;

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
                {/* Background circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={strokeWidth}
                />

                {/* Pending segment (warning/orange) */}
                {pending > 0 && (
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="url(#pendingGradient)"
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={pendingOffset}
                        strokeLinecap="round"
                        style={{
                            transform: `rotate(${pendingRotation}deg)`,
                            transformOrigin: 'center'
                        }}
                    />
                )}

                {/* Picked up segment (success/green) */}
                {pickedUp > 0 && (
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="url(#successGradient)"
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={pickedUpOffset}
                        strokeLinecap="round"
                    />
                )}

                {/* Gradient definitions */}
                <defs>
                    <linearGradient id="successGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#38ef7d" />
                        <stop offset="100%" stopColor="#11998e" />
                    </linearGradient>
                    <linearGradient id="pendingGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>
                </defs>
            </svg>

            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">{total > 0 ? Math.round(pickedUpPercent) : 0}%</span>
                <span className="text-xs text-white/50">Diambil</span>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, gradient, valueColor = 'text-[#1a1f37]' }: {
    icon: React.ReactNode;
    label: string;
    value: number | string;
    gradient: string;
    valueColor?: string;
}) {
    return (
        <div className="card group hover:shadow-lg transition-all duration-200">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">{label}</p>
                    <p className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white group-hover:scale-110 transition-transform shadow-lg`}>
                    {icon}
                </div>
            </div>
        </div>
    );
}
