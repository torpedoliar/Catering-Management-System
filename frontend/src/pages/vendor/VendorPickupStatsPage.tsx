import { useState, useEffect, useCallback } from 'react';
import { Calendar, TrendingUp, Package, Loader2, CheckCircle, Clock, ArrowRight, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, ORDER_EVENTS } from '../../contexts/SSEContext';

interface ShiftStats {
    ordered: number;
    pickedUp: number;
    noShow: number;
    cancelled: number;
    pickupRate: number;
}

interface ShiftData {
    shiftId: string;
    shiftName: string;
    startTime: string;
    endTime: string;
    status: 'completed' | 'in_progress' | 'upcoming';
    stats: ShiftStats;
}

interface DateData {
    date: string;
    dayName: string;
    shifts: ShiftData[];
}

interface Summary {
    totalOrdered: number;
    totalPickedUp: number;
    totalNoShow: number;
    totalCancelled: number;
    overallPickupRate: number;
}

interface PickupStatsData {
    dates: DateData[];
    summary: Summary;
}

// CSS Donut Chart Component
function DonutChart({ stats, status }: { stats: ShiftStats; status: ShiftData['status'] }) {
    if (status === 'upcoming' || stats.ordered === 0) {
        return (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
                {status === 'upcoming' ? 'Menunggu shift dimulai' : 'Tidak ada pesanan'}
            </div>
        );
    }

    const pending = stats.ordered - stats.pickedUp - stats.noShow;
    const total = stats.ordered;

    // Calculate percentages
    const pickedUpPct = (stats.pickedUp / total) * 100;
    const noShowPct = (stats.noShow / total) * 100;
    const pendingPct = status === 'in_progress' ? (pending / total) * 100 : 0;

    // Build conic gradient
    let gradient = '';
    let currentAngle = 0;

    if (stats.pickedUp > 0) {
        gradient += `#10b981 ${currentAngle}deg ${currentAngle + pickedUpPct * 3.6}deg, `;
        currentAngle += pickedUpPct * 3.6;
    }
    if (stats.noShow > 0) {
        gradient += `#ef4444 ${currentAngle}deg ${currentAngle + noShowPct * 3.6}deg, `;
        currentAngle += noShowPct * 3.6;
    }
    if (status === 'in_progress' && pending > 0) {
        gradient += `#f59e0b ${currentAngle}deg ${currentAngle + pendingPct * 3.6}deg, `;
        currentAngle += pendingPct * 3.6;
    }

    // Remove trailing comma and space
    gradient = gradient.slice(0, -2);

    return (
        <div className="flex flex-col items-center gap-3">
            <div
                className="w-24 h-24 rounded-full relative"
                style={{
                    background: `conic-gradient(${gradient})`,
                }}
            >
                <div className="absolute inset-3 bg-white rounded-full flex items-center justify-center">
                    <span className="text-lg font-bold text-emerald-600">{stats.pickupRate}%</span>
                </div>
            </div>
            <div className="flex flex-wrap justify-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    <span>Diambil ({stats.pickedUp})</span>
                </div>
                {stats.noShow > 0 && (
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <span>Tidak ({stats.noShow})</span>
                    </div>
                )}
                {status === 'in_progress' && pending > 0 && (
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                        <span>Menunggu ({pending})</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function VendorPickupStatsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<PickupStatsData | null>(null);
    const [startDate, setStartDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get(`/api/vendor/pickup-stats?startDate=${startDate}&endDate=${endDate}`);
            setData(res.data);
        } catch (error) {
            console.error('Failed to load pickup stats:', error);
            toast.error('Gagal memuat statistik pengambilan');
        } finally {
            setIsLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // SSE refresh for real-time updates
    useSSERefresh(ORDER_EVENTS, loadData);

    const getStatusBadge = (status: ShiftData['status']) => {
        switch (status) {
            case 'completed':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Selesai
                    </span>
                );
            case 'in_progress':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200 animate-pulse">
                        <Clock className="w-3.5 h-3.5" />
                        Sedang Berjalan
                    </span>
                );
            case 'upcoming':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
                        <ArrowRight className="w-3.5 h-3.5" />
                        Akan Datang
                    </span>
                );
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#1a1f37]">Statistik Pengambilan</h1>
                    <p className="text-slate-500">Monitoring pengambilan makanan per shift</p>
                </div>
                <button
                    onClick={loadData}
                    disabled={isLoading}
                    className="btn-secondary flex items-center gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Date Filter */}
            <div className="card p-4">
                <div className="flex flex-col sm:flex-row items-end gap-4">
                    <div className="flex-1 w-full sm:w-auto">
                        <label className="block text-sm text-slate-500 mb-1">
                            <Calendar className="w-4 h-4 inline mr-1" />
                            Tanggal Mulai
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="input-field"
                        />
                    </div>
                    <div className="flex-1 w-full sm:w-auto">
                        <label className="block text-sm text-slate-500 mb-1">
                            <Calendar className="w-4 h-4 inline mr-1" />
                            Tanggal Akhir
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="input-field"
                        />
                    </div>
                    <button
                        onClick={loadData}
                        disabled={isLoading}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 w-full sm:w-auto"
                    >
                        Terapkan
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="card p-12 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                </div>
            ) : data ? (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="card p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                    <Package className="w-5 h-5 text-blue-600" />
                                </div>
                                <p className="text-sm text-slate-500">Total Dipesan</p>
                            </div>
                            <p className="text-2xl font-bold text-[#1a1f37]">{data.summary.totalOrdered}</p>
                        </div>
                        <div className="card p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                                </div>
                                <p className="text-sm text-slate-500">Diambil</p>
                            </div>
                            <p className="text-2xl font-bold text-emerald-600">{data.summary.totalPickedUp}</p>
                        </div>
                        <div className="card p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                                    <Package className="w-5 h-5 text-red-600" />
                                </div>
                                <p className="text-sm text-slate-500">Tidak Diambil</p>
                            </div>
                            <p className="text-2xl font-bold text-red-600">{data.summary.totalNoShow}</p>
                        </div>
                        <div className="card p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5 text-orange-600" />
                                </div>
                                <p className="text-sm text-slate-500">Tingkat Pengambilan</p>
                            </div>
                            <p className="text-2xl font-bold text-orange-600">{data.summary.overallPickupRate}%</p>
                        </div>
                    </div>

                    {/* Per Date Breakdown */}
                    {data.dates.map((dateData) => (
                        <div key={dateData.date} className="space-y-4">
                            <h2 className="text-lg font-semibold text-[#1a1f37] flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-orange-500" />
                                {dateData.dayName}, {formatDate(dateData.date)}
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {dateData.shifts.map((shift) => (
                                    <div key={shift.shiftId} className="card p-4">
                                        {/* Shift Header */}
                                        <div className="flex items-start justify-between mb-4">
                                            <div>
                                                <h3 className="font-semibold text-[#1a1f37]">{shift.shiftName}</h3>
                                                <p className="text-sm text-slate-500">{shift.startTime} - {shift.endTime}</p>
                                            </div>
                                            {getStatusBadge(shift.status)}
                                        </div>

                                        {/* Stats */}
                                        <div className="space-y-2 mb-4">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-500">Dipesan:</span>
                                                <span className="font-medium">{shift.stats.ordered}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-500">Diambil:</span>
                                                <span className="font-medium text-emerald-600">{shift.stats.pickedUp}</span>
                                            </div>
                                            {shift.status !== 'upcoming' && (
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-slate-500">Tidak Diambil:</span>
                                                    <span className="font-medium text-red-600">{shift.stats.noShow}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Donut Chart */}
                                        <DonutChart stats={shift.stats} status={shift.status} />

                                        {/* Pickup Rate Bar */}
                                        {shift.status !== 'upcoming' && shift.stats.ordered > 0 && (
                                            <div className="mt-4">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-slate-500">Tingkat Pengambilan</span>
                                                    <span className="font-semibold text-emerald-600">{shift.stats.pickupRate}%</span>
                                                </div>
                                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                                        style={{ width: `${shift.stats.pickupRate}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </>
            ) : (
                <div className="card p-12 text-center text-slate-500">
                    Tidak ada data
                </div>
            )}
        </div>
    );
}
