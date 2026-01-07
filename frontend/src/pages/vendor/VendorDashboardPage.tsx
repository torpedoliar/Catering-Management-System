import { useState, useEffect, useCallback } from 'react';
import { FileSpreadsheet, Calendar, TrendingUp, Package, Loader2, Download, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    mealPrice: number;
}

interface Canteen {
    id: string;
    name: string;
    location: string | null;
}

interface ShiftData {
    ordered: number;
    pickedUp: number;
    noShow: number;
    cancelled: number;
}

interface CanteenData {
    ordered: number;
    location: string | null;
}

interface DayData {
    date: string;
    dayName: string;
    dayOfWeek: number;
    isHoliday: boolean;
    holidayName: string | null;
    isPast: boolean;
    byShift: Record<string, ShiftData>;
    byCanteen: Record<string, CanteenData>;
    byCanteenShift: Record<string, Record<string, number>>;
    total: number;
}

interface Summary {
    totalOrders: number;
    totalPickedUp: number;
    totalNoShow: number;
    totalCancelled: number;
    totalCost: number;
    avgPerDay: number;
}

interface WeeklyData {
    week: number;
    year: number;
    weekStart: string;
    weekEnd: string;
    shifts: Shift[];
    canteens: Canteen[];
    dailyData: DayData[];
    summary: Summary;
}

interface AvailableWeek {
    week: number;
    year: number;
    label: string;
}

export default function VendorDashboardPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<WeeklyData | null>(null);
    const [availableWeeks, setAvailableWeeks] = useState<AvailableWeek[]>([]);
    const [selectedWeek, setSelectedWeek] = useState<number>(0);
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

    const loadAvailableWeeks = useCallback(async () => {
        try {
            const res = await api.get('/api/vendor/available-weeks');
            setAvailableWeeks(res.data.weeks);
            if (res.data.currentWeek) {
                setSelectedWeek(res.data.currentWeek);
                setSelectedYear(res.data.currentYear);
            }
        } catch (error) {
            console.error('Failed to load available weeks:', error);
            toast.error('Gagal memuat data minggu');
        }
    }, []);

    const loadWeeklyData = useCallback(async () => {
        if (!selectedWeek) return;

        setIsLoading(true);
        try {
            const res = await api.get(`/api/vendor/weekly-summary?week=${selectedWeek}&year=${selectedYear}`);
            setData(res.data);
        } catch (error) {
            console.error('Failed to load weekly data:', error);
            toast.error('Gagal memuat rekap mingguan');
        } finally {
            setIsLoading(false);
        }
    }, [selectedWeek, selectedYear]);

    useEffect(() => {
        loadAvailableWeeks();
    }, [loadAvailableWeeks]);

    useEffect(() => {
        if (selectedWeek) {
            loadWeeklyData();
        }
    }, [selectedWeek, selectedYear, loadWeeklyData]);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    };

    const goToPreviousWeek = () => {
        const currentIndex = availableWeeks.findIndex(w => w.week === selectedWeek && w.year === selectedYear);
        if (currentIndex < availableWeeks.length - 1) {
            const prev = availableWeeks[currentIndex + 1];
            setSelectedWeek(prev.week);
            setSelectedYear(prev.year);
        }
    };

    const goToNextWeek = () => {
        const currentIndex = availableWeeks.findIndex(w => w.week === selectedWeek && w.year === selectedYear);
        if (currentIndex > 0) {
            const next = availableWeeks[currentIndex - 1];
            setSelectedWeek(next.week);
            setSelectedYear(next.year);
        }
    };

    const exportToExcel = async () => {
        if (!data) return;

        toast.loading('Menyiapkan export...', { id: 'export' });

        try {
            // Create CSV content
            let csv = 'Rekap Mingguan - Week ' + data.week + ' ' + data.year + '\n';
            csv += 'Periode: ' + data.weekStart + ' s/d ' + data.weekEnd + '\n\n';

            // Header
            csv += 'Hari,Tanggal';
            data.shifts.forEach(s => {
                csv += ',' + s.name;
            });
            csv += ',Total\n';

            // Data rows
            data.dailyData.forEach(day => {
                csv += day.dayName + ',' + day.date;
                data.shifts.forEach(s => {
                    const shiftData = day.byShift[s.id];
                    csv += ',' + (shiftData?.ordered || 0);
                });
                csv += ',' + day.total + '\n';
            });

            // Summary
            csv += '\nRingkasan\n';
            csv += 'Total Order,' + data.summary.totalOrders + '\n';
            csv += 'Total Picked Up,' + data.summary.totalPickedUp + '\n';
            csv += 'Total No Show,' + data.summary.totalNoShow + '\n';
            csv += 'Total Biaya,' + data.summary.totalCost + '\n';

            // Download
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `rekap-week${data.week}-${data.year}.csv`;
            link.click();

            toast.success('Export berhasil!', { id: 'export' });
        } catch (error) {
            console.error('Export failed:', error);
            toast.error('Export gagal', { id: 'export' });
        }
    };

    if (isLoading && !data) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Rekap Order Makanan</h1>
                    <p className="text-slate-500">Data order makanan per minggu</p>
                </div>

                {/* Week Navigator */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={goToPreviousWeek}
                        disabled={availableWeeks.findIndex(w => w.week === selectedWeek && w.year === selectedYear) >= availableWeeks.length - 1}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>

                    <select
                        value={`${selectedWeek}-${selectedYear}`}
                        onChange={(e) => {
                            const [w, y] = e.target.value.split('-');
                            setSelectedWeek(parseInt(w));
                            setSelectedYear(parseInt(y));
                        }}
                        className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium"
                    >
                        {availableWeeks.map(w => (
                            <option key={`${w.week}-${w.year}`} value={`${w.week}-${w.year}`}>
                                {w.label}
                            </option>
                        ))}
                    </select>

                    <button
                        onClick={goToNextWeek}
                        disabled={availableWeeks.findIndex(w => w.week === selectedWeek && w.year === selectedYear) <= 0}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>

                    <button
                        onClick={exportToExcel}
                        disabled={!data}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Export</span>
                    </button>
                </div>
            </div>

            {/* Period Info */}
            {data && (
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-4 py-2 rounded-lg">
                    <Calendar className="w-4 h-4" />
                    <span>Periode: {formatDate(data.weekStart)} - {formatDate(data.weekEnd)}</span>
                </div>
            )}

            {/* Summary Cards */}
            {data && (
                <div className="grid grid-cols-3 gap-4">
                    <div className="card p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
                                <Package className="w-5 h-5 text-teal-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-800">{data.summary.totalOrders}</p>
                                <p className="text-xs text-slate-500">Total Order</p>
                            </div>
                        </div>
                    </div>

                    <div className="card p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                <TrendingUp className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-800">{data.summary.totalPickedUp}</p>
                                <p className="text-xs text-slate-500">Picked Up</p>
                            </div>
                        </div>
                    </div>

                    <div className="card p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                <FileSpreadsheet className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-800">{data.summary.avgPerDay}</p>
                                <p className="text-xs text-slate-500">Rata-rata/Hari</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Table */}
            {data && (
                <div className="card overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                        <h2 className="font-semibold text-slate-800">Total Order Keseluruhan Harian</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-50">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Hari</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Tanggal</th>
                                    {data.shifts.map(shift => (
                                        <th key={shift.id} className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase">
                                            {shift.name}
                                        </th>
                                    ))}
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase bg-slate-100">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.dailyData.map((day, index) => (
                                    <tr
                                        key={day.date}
                                        className={`border-b border-slate-50 ${day.isHoliday ? 'bg-red-50' : day.isPast ? 'bg-slate-50/50' : ''} ${index % 2 === 0 ? '' : 'bg-slate-50/30'}`}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-800">{day.dayName}</div>
                                            {day.isHoliday && (
                                                <div className="text-xs text-red-500">{day.holidayName}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">{formatDate(day.date)}</td>
                                        {data.shifts.map(shift => {
                                            const shiftData = day.byShift[shift.id];
                                            return (
                                                <td key={shift.id} className="text-center px-4 py-3">
                                                    {shiftData?.ordered > 0 ? (
                                                        <div>
                                                            <span className="text-lg font-semibold text-slate-800">{shiftData.ordered}</span>
                                                            {shiftData.noShow > 0 && (
                                                                <span className="ml-1 text-xs text-red-500">(-{shiftData.noShow})</span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-300">-</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td className="text-center px-4 py-3 bg-slate-100/50">
                                            <span className="text-lg font-bold text-teal-600">{day.total}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-100 font-semibold">
                                    <td colSpan={2} className="px-4 py-3 text-slate-800">Total Minggu</td>
                                    {data.shifts.map(shift => {
                                        const shiftTotal = data.dailyData.reduce((sum, day) => sum + (day.byShift[shift.id]?.ordered || 0), 0);
                                        return (
                                            <td key={shift.id} className="text-center px-4 py-3 text-slate-800">
                                                {shiftTotal}
                                            </td>
                                        );
                                    })}
                                    <td className="text-center px-4 py-3 text-teal-600 text-xl">{data.summary.totalOrders}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* Canteen Breakdown - Detailed Tables */}
            {data && data.canteens.length > 0 && (
                <div className="space-y-4">
                    {data.canteens.map(canteen => {
                        const totalOrders = data.dailyData.reduce((sum, day) => {
                            return sum + (day.byCanteen[canteen.id]?.ordered || 0);
                        }, 0);

                        return (
                            <div key={canteen.id} className="card overflow-hidden">
                                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                                    <div>
                                        <h2 className="font-semibold text-slate-800">{canteen.name}</h2>
                                        {canteen.location && (
                                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                                <MapPin className="w-3 h-3" />
                                                {canteen.location}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-bold text-teal-600">{totalOrders}</p>
                                        <p className="text-xs text-slate-500">total order</p>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-slate-50">
                                                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Hari</th>
                                                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Tanggal</th>
                                                {data.shifts.map(shift => (
                                                    <th key={shift.id} className="text-center px-3 py-2 text-xs font-semibold text-slate-600 uppercase">
                                                        {shift.name}
                                                    </th>
                                                ))}
                                                <th className="text-center px-3 py-2 text-xs font-semibold text-slate-600 uppercase bg-slate-100">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.dailyData.map((day, index) => {
                                                const dayTotal = day.byCanteen[canteen.id]?.ordered || 0;
                                                return (
                                                    <tr
                                                        key={day.date}
                                                        className={`border-b border-slate-50 ${day.isHoliday ? 'bg-red-50' : index % 2 === 0 ? '' : 'bg-slate-50/30'}`}
                                                    >
                                                        <td className="px-4 py-2 text-sm font-medium text-slate-700">{day.dayName}</td>
                                                        <td className="px-4 py-2 text-sm text-slate-600">{formatDate(day.date)}</td>
                                                        {data.shifts.map(shift => {
                                                            const count = day.byCanteenShift?.[canteen.id]?.[shift.id] || 0;
                                                            return (
                                                                <td key={shift.id} className="text-center px-3 py-2">
                                                                    {count > 0 ? (
                                                                        <span className="font-semibold text-slate-800">{count}</span>
                                                                    ) : (
                                                                        <span className="text-slate-300">-</span>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="text-center px-3 py-2 bg-slate-100/50 font-bold text-teal-600">
                                                            {dayTotal}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-slate-100 font-semibold">
                                                <td colSpan={2} className="px-4 py-2 text-slate-800 text-sm">Total Minggu</td>
                                                {data.shifts.map(shift => {
                                                    const shiftTotal = data.dailyData.reduce((sum, day) => {
                                                        return sum + (day.byCanteenShift?.[canteen.id]?.[shift.id] || 0);
                                                    }, 0);
                                                    return (
                                                        <td key={shift.id} className="text-center px-3 py-2 text-slate-800">
                                                            {shiftTotal}
                                                        </td>
                                                    );
                                                })}
                                                <td className="text-center px-3 py-2 text-teal-600 font-bold">{totalOrders}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
