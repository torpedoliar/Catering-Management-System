import { useState, useEffect, useCallback } from 'react';
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
    CalendarDays
} from 'lucide-react';

interface ShiftStats {
    shiftId: string;
    shiftName: string;
    startTime: string;
    endTime: string;
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
    const [tomorrowOrders, setTomorrowOrders] = useState<TomorrowOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedDept, setExpandedDept] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const [statsRes, ordersRes, tomorrowRes] = await Promise.all([
                api.get('/api/orders/stats/today'),
                api.get(`/api/orders?startDate=${today}&endDate=${today}&limit=100`),
                api.get(`/api/orders?startDate=${tomorrow}&endDate=${tomorrow}&limit=100`),
            ]);
            setStats(statsRes.data);

            const allOrders: Order[] = ordersRes.data.orders;
            setTodayOrders(allOrders.slice(0, 10));

            setTomorrowOrders(tomorrowRes.data.orders || []);
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useSSERefresh([...ORDER_EVENTS, ...USER_EVENTS], loadData);

    const processNoShows = async () => {
        if (!confirm('Proses semua order pending sebagai no-show? Aksi ini tidak dapat dibatalkan.')) return;

        try {
            const res = await api.post('/api/orders/process-noshows');
            alert(`Diproses ${res.data.results.processed} no-shows.`);
            loadData();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Gagal memproses no-shows');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-primary-500 mx-auto" />
                    <p className="text-white/50 mt-4">Memuat dashboard...</p>
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
            case 'NO_SHOW': return 'No-Show';
            case 'CANCELLED': return 'Batal';
            default: return status;
        }
    };

    // Build company-shift recap from today orders
    const companyShiftRecap: CompanyShiftRecap[] = [];
    const companyMap = new Map<string, Map<string, number>>();
    
    todayOrders.forEach(order => {
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

    // Get unique shift names for table header
    const shiftNames = stats?.byShift.map(s => s.shiftName) || [];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center shadow-glow">
                        <Zap className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-title-1 text-white">Dashboard</h1>
                        <p className="text-white/50">
                            {stats?.date ? format(new Date(stats.date), 'EEEE, dd MMMM yyyy', { locale: id }) : 'Loading...'}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border ${
                        isConnected 
                            ? 'bg-success/10 border-success/30 text-success' 
                            : 'bg-danger/10 border-danger/30 text-danger'
                    }`}>
                        <div className="relative">
                            <Wifi className="w-4 h-4" />
                            {isConnected && <span className="absolute inset-0 bg-success rounded-full animate-ping opacity-50" />}
                        </div>
                        <span>{connectedClients} terhubung</span>
                    </div>
                    <button onClick={loadData} className="btn-secondary flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                    <button onClick={processNoShows} className="btn-danger flex items-center gap-2">
                        <XCircle className="w-4 h-4" />
                        Proses No-Show
                    </button>
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
                    icon={<LayoutDashboard />} 
                    label="Total Order" 
                    value={stats?.total || 0} 
                    gradient="from-primary-500 to-accent-purple"
                />
                <StatCard 
                    icon={<CheckCircle2 />} 
                    label="Sudah Diambil" 
                    value={stats?.pickedUp || 0} 
                    gradient="from-success to-accent-teal"
                    valueColor="text-success"
                />
                <StatCard 
                    icon={<Clock />} 
                    label="Menunggu" 
                    value={stats?.pending || 0} 
                    gradient="from-info to-accent-cyan"
                    valueColor="text-info"
                />
                <StatCard 
                    icon={<XCircle />} 
                    label="Tidak Diambil" 
                    value={stats?.noShow || 0} 
                    gradient="from-danger to-red-500"
                    valueColor="text-danger"
                />
                <StatCard 
                    icon={<Percent />} 
                    label="Tingkat Ambil" 
                    value={`${stats?.pickupRate || 0}%`} 
                    gradient="from-accent-purple to-accent-pink"
                />
                <StatCard 
                    icon={<Ban />} 
                    label="Diblacklist" 
                    value={stats?.blacklistedCount || 0} 
                    gradient="from-danger to-accent-pink"
                    valueColor="text-danger"
                />
            </div>

            {/* Main Grid - Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Shift Performance with Donut Charts */}
                <div className="card">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-lg font-bold text-white">Performa per Shift</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {stats?.byShift.map((shift) => {
                            const shiftOrders = todayOrders.filter(o => o.shift.name === shift.shiftName);
                            const pickedUp = shiftOrders.filter(o => o.status === 'PICKED_UP').length;
                            const pending = shiftOrders.filter(o => o.status === 'ORDERED').length;
                            const total = shiftOrders.length;
                            const pickedUpPercent = total > 0 ? Math.round((pickedUp / total) * 100) : 0;

                            return (
                                <div key={shift.shiftId} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-primary-500/30 transition-all">
                                    <div className="text-center mb-3">
                                        <p className="font-semibold text-white">{shift.shiftName}</p>
                                        <p className="text-xs text-white/40">{shift.startTime} - {shift.endTime}</p>
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
                                        <div className="pt-2 mt-2 border-t border-white/10 flex items-center justify-between text-sm">
                                            <span className="text-white/50">Total Pesanan</span>
                                            <span className="font-bold text-white">{total}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {(!stats?.byShift || stats.byShift.length === 0) && (
                            <div className="col-span-2">
                                <p className="text-white/40 text-center py-8">Belum ada order hari ini</p>
                            </div>
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
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
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
                                                <span className="text-info">{dept.pending} pending</span>
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
            </div>

            {/* Main Grid - Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Company-Shift Recap */}
                <div className="card lg:col-span-2">
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
                                        {shiftNames.map(name => (
                                            <th key={name} className="text-center py-3 px-2 text-white/50 font-medium">{name}</th>
                                        ))}
                                        <th className="text-center py-3 px-2 text-white/50 font-medium">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {companyShiftRecap.map((row) => (
                                        <tr key={row.company} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="py-3 px-2 font-medium text-white">{row.company}</td>
                                            {shiftNames.map(name => (
                                                <td key={name} className="text-center py-3 px-2 text-white/70">
                                                    {row.shifts[name] || 0}
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

                {/* Users at Risk & Recent Orders */}
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
                            <div className="space-y-2 max-h-[200px] overflow-y-auto">
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

            {/* Row 3 - No Show Users */}
            {((stats?.noShowUsers?.today && stats.noShowUsers.today.length > 0) || 
              (stats?.noShowUsers?.yesterday && stats.noShowUsers.yesterday.length > 0)) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Today's No-Shows */}
                    {stats?.noShowUsers?.today && stats.noShowUsers.today.length > 0 && (
                        <div className="card border-danger/30">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-danger/20 flex items-center justify-center">
                                    <XCircle className="w-5 h-5 text-danger" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">No-Show Hari Ini</h2>
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

                    {/* Yesterday's No-Shows */}
                    {stats?.noShowUsers?.yesterday && stats.noShowUsers.yesterday.length > 0 && (
                        <div className="card border-warning/30">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
                                    <Clock className="w-5 h-5 text-warning" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">No-Show Kemarin</h2>
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
            )}

            {/* Row 4 - Tomorrow's Orders */}
            {tomorrowOrders.length > 0 && (
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
                            <p className="text-center text-white/40 text-sm py-3">
                                +{tomorrowOrders.length - 10} pesanan lainnya
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
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

function StatCard({ icon, label, value, gradient, valueColor = 'text-white' }: { 
    icon: React.ReactNode; 
    label: string; 
    value: number | string;
    gradient: string;
    valueColor?: string;
}) {
    return (
        <div className="stat-card group">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider">{label}</p>
                    <p className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</p>
                </div>
                <div className={`stat-icon bg-gradient-to-br ${gradient} group-hover:scale-110 transition-transform`}>
                    {icon}
                </div>
            </div>
        </div>
    );
}
