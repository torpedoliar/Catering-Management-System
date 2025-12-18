import { useState, useCallback, useEffect } from 'react';
import { format, startOfMonth, subDays } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, ORDER_EVENTS } from '../../contexts/SSEContext';
import {
    DollarSign,
    TrendingDown,
    PieChart,
    Download,
    FileDown, // Changed from Download
    Calendar,
    Building2,
    Clock,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Loader2,
    RefreshCw
    // Removed FileText
} from 'lucide-react';
import toast from 'react-hot-toast';

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

export default function CostAnalysisPage() {
    const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('month');
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    // Removed isPDFExporting state

    const [stats, setStats] = useState<CostStats | null>(null);
    const [shiftCosts, setShiftCosts] = useState<ShiftCost[]>([]);
    const [companyCosts, setCompanyCosts] = useState<CompanyCost[]>([]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get(`/api/orders/stats/range?startDate=${startDate}&endDate=${endDate}`);
            const data = res.data;

            // Calculate costs from shift data
            const shiftsRes = await api.get('/api/shifts');
            const shiftPrices: Record<string, number> = {};
            (shiftsRes.data.shifts || []).forEach((s: any) => {
                shiftPrices[s.id] = Number(s.mealPrice) || 25000;
            });

            // Get orders for detailed cost calculation
            const ordersRes = await api.get(`/api/orders?startDate=${startDate}&endDate=${endDate}&limit=10000`);
            const orders = ordersRes.data.orders || [];

            // Calculate comprehensive stats
            let totalCost = 0;
            let actualCost = 0;
            let wasteCost = 0;

            const shiftStats: Record<string, ShiftCost> = {};
            const companyStats: Record<string, CompanyCost> = {};

            orders.forEach((order: any) => {
                const price = shiftPrices[order.shiftId] || 25000;

                if (order.status !== 'CANCELLED') {
                    totalCost += price;

                    // Update shift stats
                    if (!shiftStats[order.shiftId]) {
                        shiftStats[order.shiftId] = {
                            shiftId: order.shiftId,
                            shiftName: order.shift?.name || 'Unknown',
                            mealPrice: price,
                            orders: 0,
                            pickedUp: 0,
                            noShow: 0,
                            totalCost: 0,
                            wasteCost: 0
                        };
                    }
                    shiftStats[order.shiftId].orders++;
                    shiftStats[order.shiftId].totalCost += price;

                    // Update company stats
                    const company = order.user?.company || 'Tidak Ada';
                    if (!companyStats[company]) {
                        companyStats[company] = {
                            company,
                            orders: 0,
                            pickedUp: 0,
                            noShow: 0,
                            totalCost: 0,
                            wasteCost: 0,
                            wasteRate: 0
                        };
                    }
                    companyStats[company].orders++;
                    companyStats[company].totalCost += price;
                }

                if (order.status === 'PICKED_UP') {
                    actualCost += price;
                    if (shiftStats[order.shiftId]) shiftStats[order.shiftId].pickedUp++;
                    const company = order.user?.company || 'Tidak Ada';
                    if (companyStats[company]) companyStats[company].pickedUp++;
                } else if (order.status === 'NO_SHOW') {
                    wasteCost += price;
                    if (shiftStats[order.shiftId]) {
                        shiftStats[order.shiftId].noShow++;
                        shiftStats[order.shiftId].wasteCost += price;
                    }
                    const company = order.user?.company || 'Tidak Ada';
                    if (companyStats[company]) {
                        companyStats[company].noShow++;
                        companyStats[company].wasteCost += price;
                    }
                }
            });

            // Calculate waste rates for companies
            Object.values(companyStats).forEach(c => {
                c.wasteRate = c.orders > 0 ? Math.round((c.noShow / c.orders) * 100) : 0;
            });

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
                pickupRate
            });

            setShiftCosts(Object.values(shiftStats).sort((a, b) => b.totalCost - a.totalCost));
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

    // SSE Real-time updates for orders
    useSSERefresh(ORDER_EVENTS, loadData);

    const handleExportExcel = async () => { // Renamed from handleExport
        setIsExporting(true);
        try {
            const token = localStorage.getItem('token');
            const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3012';

            const response = await fetch(
                `${apiUrl}/api/orders/export?startDate=${startDate}&endDate=${endDate}`,
                {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` },
                }
            );

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Laporan_Catering_${startDate}_${endDate}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success('Laporan berhasil diexport');
        } catch (error) {
            toast.error('Gagal export laporan');
        } finally {
            setIsExporting(false);
        }
    };

    // Removed handlePDFExport function

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    };

    // Quick date filters
    const setToday = () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        setStartDate(today);
        setEndDate(today);
        setSelectedPeriod('today');
    };

    const setThisWeek = () => {
        const end = format(new Date(), 'yyyy-MM-dd');
        const start = format(subDays(new Date(), 7), 'yyyy-MM-dd');
        setStartDate(start);
        setEndDate(end);
        setSelectedPeriod('week');
    };

    const setThisMonth = () => {
        const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const end = format(new Date(), 'yyyy-MM-dd');
        setStartDate(start);
        setEndDate(end);
        setSelectedPeriod('month');
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-primary-500 mx-auto" />
                    <p className="text-white/50 mt-4">Memuat analisis biaya...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-glow">
                        <DollarSign className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-title-1 text-white">Analisis Biaya</h1>
                        <p className="text-white/50">
                            {startDate === endDate
                                ? format(new Date(startDate), 'EEEE, dd MMMM yyyy', { locale: idLocale })
                                : `${format(new Date(startDate), 'dd MMM', { locale: idLocale })} - ${format(new Date(endDate), 'dd MMM yyyy', { locale: idLocale })}`
                            }
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={loadData} className="btn-secondary flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                    <button
                        onClick={handleExportExcel} // Changed to handleExportExcel
                        disabled={isExporting} // Removed isPDFExporting
                        className="btn-primary flex items-center gap-2" // Changed class
                    >
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} {/* Changed icon */}
                        Export Excel
                    </button>
                    {/* Removed PDF export button */}
                </div>
            </div>

            {/* Date Range Filter */}
            <div className="glass-card p-4 rounded-2xl">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary-400" />
                        <span className="text-sm font-medium text-white">Periode:</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={setToday}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedPeriod === 'today'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            Hari Ini
                        </button>
                        <button
                            onClick={setThisWeek}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedPeriod === 'week'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            7 Hari
                        </button>
                        <button
                            onClick={setThisMonth}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedPeriod === 'month'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            Bulan Ini
                        </button>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => { setStartDate(e.target.value); setSelectedPeriod('custom'); }}
                            className="input-field text-sm py-1.5"
                        />
                        <span className="text-slate-400">—</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setSelectedPeriod('custom'); }}
                            className="input-field text-sm py-1.5"
                        />
                    </div>
                </div>
            </div>

            {/* Cost Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-5 rounded-2xl">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                            <PieChart className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="text-sm text-white/60">Total Biaya</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{formatCurrency(stats?.totalCost || 0)}</p>
                    <p className="text-xs text-white/40 mt-1">{stats?.total || 0} pesanan</p>
                </div>

                <div className="glass-card p-5 rounded-2xl">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        </div>
                        <span className="text-sm text-white/60">Biaya Aktual</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-400">{formatCurrency(stats?.actualCost || 0)}</p>
                    <p className="text-xs text-white/40 mt-1">{stats?.pickedUp || 0} diambil ({stats?.pickupRate || 0}%)</p>
                </div>

                <div className="glass-card p-5 rounded-2xl border border-red-500/30">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                            <TrendingDown className="w-5 h-5 text-red-400" />
                        </div>
                        <span className="text-sm text-white/60">Kerugian</span>
                    </div>
                    <p className="text-2xl font-bold text-red-400">{formatCurrency(stats?.wasteCost || 0)}</p>
                    <p className="text-xs text-white/40 mt-1">{stats?.noShow || 0} tidak diambil ({stats?.wasteRate || 0}%)</p>
                </div>

                <div className="glass-card p-5 rounded-2xl">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                        </div>
                        <span className="text-sm text-white/60">Waste Rate</span>
                    </div>
                    <p className={`text-2xl font-bold ${(stats?.wasteRate || 0) > 10 ? 'text-red-400' : 'text-amber-400'}`}>
                        {stats?.wasteRate || 0}%
                    </p>
                    <p className="text-xs text-white/40 mt-1">Target: &lt;10%</p>
                </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Cost Distribution Donut Chart */}
                <div className="glass-card rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <PieChart className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="font-semibold text-white">Distribusi Biaya</h3>
                    </div>
                    <div className="flex items-center justify-center">
                        <div className="relative">
                            <svg width="200" height="200" viewBox="0 0 200 200">
                                <defs>
                                    <linearGradient id="actualGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#10b981" />
                                        <stop offset="100%" stopColor="#059669" />
                                    </linearGradient>
                                    <linearGradient id="wasteGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#ef4444" />
                                        <stop offset="100%" stopColor="#dc2626" />
                                    </linearGradient>
                                    <linearGradient id="pendingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#f59e0b" />
                                        <stop offset="100%" stopColor="#d97706" />
                                    </linearGradient>
                                </defs>
                                {/* Background circle */}
                                <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="24" />

                                {/* Actual Cost (Picked Up) */}
                                {stats && stats.totalCost > 0 && (
                                    <circle
                                        cx="100"
                                        cy="100"
                                        r="80"
                                        fill="none"
                                        stroke="url(#actualGradient)"
                                        strokeWidth="24"
                                        strokeDasharray={`${(stats.actualCost / stats.totalCost) * 502.65} 502.65`}
                                        strokeDashoffset="0"
                                        transform="rotate(-90 100 100)"
                                        className="transition-all duration-1000"
                                    />
                                )}

                                {/* Waste Cost (Tidak Diambil) */}
                                {stats && stats.totalCost > 0 && stats.wasteCost > 0 && (
                                    <circle
                                        cx="100"
                                        cy="100"
                                        r="80"
                                        fill="none"
                                        stroke="url(#wasteGradient)"
                                        strokeWidth="24"
                                        strokeDasharray={`${(stats.wasteCost / stats.totalCost) * 502.65} 502.65`}
                                        strokeDashoffset={`${-((stats.actualCost / stats.totalCost) * 502.65)}`}
                                        transform="rotate(-90 100 100)"
                                        className="transition-all duration-1000"
                                    />
                                )}
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-3xl font-bold text-white">{stats?.pickupRate || 0}%</span>
                                <span className="text-xs text-white/50">Pickup Rate</span>
                            </div>
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" />
                            <div>
                                <p className="text-xs text-white/50">Diambil</p>
                                <p className="text-sm font-semibold text-emerald-400">{formatCurrency(stats?.actualCost || 0)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-red-500 to-red-600" />
                            <div>
                                <p className="text-xs text-white/50">Terbuang</p>
                                <p className="text-sm font-semibold text-red-400">{formatCurrency(stats?.wasteCost || 0)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Shift Cost Bar Chart */}
                <div className="glass-card rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="font-semibold text-white">Biaya per Shift</h3>
                    </div>
                    <div className="space-y-4">
                        {shiftCosts.length > 0 ? (
                            shiftCosts.map((shift) => {
                                const maxCost = Math.max(...shiftCosts.map(s => s.totalCost));
                                const barWidth = maxCost > 0 ? (shift.totalCost / maxCost) * 100 : 0;
                                const wasteWidth = shift.totalCost > 0 ? (shift.wasteCost / shift.totalCost) * 100 : 0;

                                return (
                                    <div key={shift.shiftId}>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm font-medium text-white">{shift.shiftName}</span>
                                            <span className="text-sm text-white/60">{formatCurrency(shift.totalCost)}</span>
                                        </div>
                                        <div className="relative h-8 bg-white/5 rounded-lg overflow-hidden">
                                            {/* Total bar */}
                                            <div
                                                className="absolute h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg transition-all duration-700"
                                                style={{ width: `${barWidth}%` }}
                                            />
                                            {/* Waste indicator */}
                                            {shift.wasteCost > 0 && (
                                                <div
                                                    className="absolute h-full bg-gradient-to-r from-red-500/80 to-red-600/80 rounded-r-lg transition-all duration-700"
                                                    style={{
                                                        width: `${(wasteWidth / 100) * barWidth}%`,
                                                        left: `${barWidth - (wasteWidth / 100) * barWidth}%`
                                                    }}
                                                />
                                            )}
                                            {/* Labels inside bar */}
                                            <div className="absolute inset-0 flex items-center justify-between px-3">
                                                <span className="text-xs font-medium text-white/90">{shift.orders} order</span>
                                                {shift.noShow > 0 && (
                                                    <span className="text-xs font-medium text-red-200">{shift.noShow} tidak diambil</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center py-8 text-white/40">
                                Tidak ada data shift
                            </div>
                        )}
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-xs text-white/50">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-gradient-to-r from-blue-500 to-blue-600" />
                            <span>Total Biaya</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-gradient-to-r from-red-500 to-red-600" />
                            <span>Kerugian</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Company Waste Rate Chart */}
            {companyCosts.length > 0 && (
                <div className="glass-card rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="font-semibold text-white">Waste Rate per Perusahaan</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {companyCosts.slice(0, 6).map((company) => {
                            const wasteRate = company.wasteRate || 0;
                            const circumference = 2 * Math.PI * 35;
                            const strokeDasharray = `${(wasteRate / 100) * circumference} ${circumference}`;
                            const color = wasteRate > 15 ? '#ef4444' : wasteRate > 10 ? '#f59e0b' : '#10b981';

                            return (
                                <div key={company.company} className="text-center">
                                    <div className="relative w-20 h-20 mx-auto mb-2">
                                        <svg width="80" height="80" viewBox="0 0 80 80">
                                            <circle cx="40" cy="40" r="35" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                                            <circle
                                                cx="40"
                                                cy="40"
                                                r="35"
                                                fill="none"
                                                stroke={color}
                                                strokeWidth="6"
                                                strokeDasharray={strokeDasharray}
                                                strokeLinecap="round"
                                                transform="rotate(-90 40 40)"
                                                className="transition-all duration-700"
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-lg font-bold" style={{ color }}>{wasteRate}%</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-white font-medium truncate" title={company.company}>
                                        {company.company.length > 10 ? company.company.substring(0, 10) + '...' : company.company}
                                    </p>
                                    <p className="text-xs text-white/40">{company.noShow}/{company.orders}</p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-4 flex items-center justify-center gap-6 text-xs text-white/50">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                            <span>&lt;10% Baik</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-amber-500" />
                            <span>10-15% Perhatian</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500" />
                            <span>&gt;15% Buruk</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Breakdown Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Per Shift */}
                <div className="glass-card rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-white/10 flex items-center gap-3">
                        <Clock className="w-5 h-5 text-purple-400" />
                        <h3 className="font-semibold text-white">Biaya per Shift</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/5">
                                    <th className="text-left px-4 py-3 text-xs text-white/50 font-medium">Shift</th>
                                    <th className="text-center px-4 py-3 text-xs text-white/50 font-medium">Order</th>
                                    <th className="text-center px-4 py-3 text-xs text-white/50 font-medium">Tidak Diambil</th>
                                    <th className="text-right px-4 py-3 text-xs text-white/50 font-medium">Biaya</th>
                                    <th className="text-right px-4 py-3 text-xs text-white/50 font-medium">Kerugian</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shiftCosts.map((shift) => (
                                    <tr key={shift.shiftId} className="border-b border-white/5 hover:bg-white/5">
                                        <td className="px-4 py-3">
                                            <p className="text-white font-medium">{shift.shiftName}</p>
                                            <p className="text-xs text-white/40">{formatCurrency(shift.mealPrice)}/porsi</p>
                                        </td>
                                        <td className="text-center px-4 py-3 text-white">{shift.orders}</td>
                                        <td className="text-center px-4 py-3">
                                            {shift.noShow > 0 ? (
                                                <span className="text-red-400 font-medium">{shift.noShow}</span>
                                            ) : (
                                                <span className="text-white/40">0</span>
                                            )}
                                        </td>
                                        <td className="text-right px-4 py-3 text-white">{formatCurrency(shift.totalCost)}</td>
                                        <td className="text-right px-4 py-3">
                                            {shift.wasteCost > 0 ? (
                                                <span className="text-red-400 font-medium">{formatCurrency(shift.wasteCost)}</span>
                                            ) : (
                                                <span className="text-white/40">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {shiftCosts.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-white/40">
                                            Tidak ada data
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Per Company */}
                <div className="glass-card rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-white/10 flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-amber-400" />
                        <h3 className="font-semibold text-white">Biaya per Perusahaan</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/5">
                                    <th className="text-left px-4 py-3 text-xs text-white/50 font-medium">Perusahaan</th>
                                    <th className="text-center px-4 py-3 text-xs text-white/50 font-medium">Order</th>
                                    <th className="text-center px-4 py-3 text-xs text-white/50 font-medium">Waste</th>
                                    <th className="text-right px-4 py-3 text-xs text-white/50 font-medium">Biaya</th>
                                    <th className="text-right px-4 py-3 text-xs text-white/50 font-medium">Kerugian</th>
                                </tr>
                            </thead>
                            <tbody>
                                {companyCosts.slice(0, 10).map((company) => (
                                    <tr key={company.company} className="border-b border-white/5 hover:bg-white/5">
                                        <td className="px-4 py-3">
                                            <p className="text-white font-medium">{company.company}</p>
                                        </td>
                                        <td className="text-center px-4 py-3 text-white">{company.orders}</td>
                                        <td className="text-center px-4 py-3">
                                            {company.wasteRate > 0 ? (
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${company.wasteRate > 15 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                                    {company.wasteRate}%
                                                </span>
                                            ) : (
                                                <span className="text-white/40">0%</span>
                                            )}
                                        </td>
                                        <td className="text-right px-4 py-3 text-white">{formatCurrency(company.totalCost)}</td>
                                        <td className="text-right px-4 py-3">
                                            {company.wasteCost > 0 ? (
                                                <span className="text-red-400 font-medium">{formatCurrency(company.wasteCost)}</span>
                                            ) : (
                                                <span className="text-white/40">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {companyCosts.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-white/40">
                                            Tidak ada data
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Info Card */}
            <div className="glass-card p-4 rounded-2xl border border-blue-500/30">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                        <XCircle className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h4 className="font-medium text-blue-400 mb-1">Tentang Perhitungan Biaya</h4>
                        <ul className="text-sm text-white/60 space-y-1">
                            <li>• <strong>Total Biaya</strong>: Semua pesanan (tidak termasuk yang dibatalkan) × harga per shift</li>
                            <li>• <strong>Biaya Aktual</strong>: Hanya pesanan yang diambil (PICKED_UP)</li>
                            <li>• <strong>Kerugian</strong>: Pesanan yang tidak diambil (Tidak Diambil) × harga makanan</li>
                            <li>• <strong>Waste Rate</strong>: Persentase tidak diambil dari total pesanan</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
