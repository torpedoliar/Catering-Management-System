import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, ORDER_EVENTS } from '../../contexts/SSEContext';
import {
    ListOrdered,
    CalendarDays,
    Loader2,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Calendar,
    ArrowLeft
} from 'lucide-react';

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
}

interface User {
    id: string;
    name: string;
    externalId: string;
    company: string;
    department: string;
}

interface Order {
    id: string;
    status: string;
    orderTime: string;
    orderDate: string;
    checkInTime: string | null;
    user: User;
    shift: Shift;
}

export default function OrderListPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [orders, setOrders] = useState<Order[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());

    // Get date from URL or default to today
    const getLocalDateString = (date: Date = new Date()): string => {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [selectedDate, setSelectedDate] = useState(() => {
        return searchParams.get('date') || getLocalDateString();
    });

    // Update URL when date changes
    useEffect(() => {
        setSearchParams({ date: selectedDate });
    }, [selectedDate, setSearchParams]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [ordersRes, shiftsRes] = await Promise.all([
                api.get(`/api/orders?startDate=${selectedDate}&endDate=${selectedDate}&limit=500`),
                api.get('/api/shifts')
            ]);

            setOrders(ordersRes.data.orders || []);
            // Shifts API returns { shifts: [], ... }
            const shiftsData = shiftsRes.data.shifts || [];
            setShifts(shiftsData.filter((s: Shift) => s.isActive));
        } catch (error) {
            console.error('Failed to load orders:', error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Real-time updates via SSE
    useSSERefresh(ORDER_EVENTS, loadData);

    const toggleShift = (shiftId: string) => {
        setExpandedShifts(prev => {
            const newSet = new Set(prev);
            if (newSet.has(shiftId)) {
                newSet.delete(shiftId);
            } else {
                newSet.add(shiftId);
            }
            return newSet;
        });
    };

    const getOrdersForShift = (shiftId: string) => {
        return orders.filter(o => o.shift.id === shiftId && o.status !== 'CANCELLED');
    };

    const getDynamicTitle = () => {
        const today = getLocalDateString();
        const tomorrow = getLocalDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));

        if (selectedDate === today) return 'Order Hari Ini';
        if (selectedDate === tomorrow) return 'Order Besok';
        return `Order ${format(new Date(selectedDate), 'dd MMMM yyyy', { locale: id })}`;
    };

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

    const setToday = () => setSelectedDate(getLocalDateString());
    const setTomorrow = () => setSelectedDate(getLocalDateString(new Date(Date.now() + 24 * 60 * 60 * 1000)));
    const setDayAfterTomorrow = () => setSelectedDate(getLocalDateString(new Date(Date.now() + 48 * 60 * 60 * 1000)));

    const totalOrders = orders.filter(o => o.status !== 'CANCELLED').length;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto" />
                    <p className="text-slate-500 mt-4">Memuat data order...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link
                        to="/admin/dashboard"
                        className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-white" />
                    </Link>
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <ListOrdered className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-[#1a1f37]">{getDynamicTitle()}</h1>
                        <p className="text-slate-500">
                            {totalOrders} pesanan untuk {format(new Date(selectedDate), 'EEEE, dd MMMM yyyy', { locale: id })}
                        </p>
                    </div>
                </div>
                <button onClick={loadData} className="btn-primary flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Date Filter */}
            <div className="card">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 text-slate-500">
                            <CalendarDays className="w-5 h-5 text-orange-500" />
                            <span className="text-sm font-medium text-[#1a1f37] whitespace-nowrap">Pilih Tanggal:</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={setToday}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedDate === getLocalDateString()
                                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-[#1a1f37]'
                                    }`}
                            >
                                Hari Ini
                            </button>
                            <button
                                onClick={setTomorrow}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedDate === getLocalDateString(new Date(Date.now() + 24 * 60 * 60 * 1000))
                                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-[#1a1f37]'
                                    }`}
                            >
                                Besok
                            </button>
                            <button
                                onClick={setDayAfterTomorrow}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedDate === getLocalDateString(new Date(Date.now() + 48 * 60 * 60 * 1000))
                                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-[#1a1f37]'
                                    }`}
                            >
                                Lusa
                            </button>
                        </div>
                    </div>

                    <div className="relative min-w-[200px]">
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="input-field w-full"
                        />
                    </div>
                </div>
            </div>

            {/* Orders by Shift */}
            {shifts.length > 0 ? (
                <div className="space-y-4">
                    {shifts.map((shift) => {
                        const shiftOrders = getOrdersForShift(shift.id);
                        const isExpanded = expandedShifts.has(shift.id);

                        const stats = {
                            total: shiftOrders.length,
                            pickedUp: shiftOrders.filter(o => o.status === 'PICKED_UP').length,
                            pending: shiftOrders.filter(o => o.status === 'ORDERED').length,
                            noShow: shiftOrders.filter(o => o.status === 'NO_SHOW').length,
                        };

                        return (
                            <div key={shift.id} className="card">
                                {/* Shift Header */}
                                <button
                                    onClick={() => toggleShift(shift.id)}
                                    className="w-full text-left flex items-center justify-between p-4 hover:bg-white/5 rounded-xl transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center">
                                            <Calendar className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white">{shift.name}</h3>
                                            <p className="text-sm text-white/60">{shift.startTime} - {shift.endTime}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="px-3 py-1 rounded-full bg-slate-700 text-white text-xs font-medium">
                                                {stats.total} Total
                                            </span>
                                            {stats.pickedUp > 0 && (
                                                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                                                    ✓ {stats.pickedUp} Diambil
                                                </span>
                                            )}
                                            {stats.pending > 0 && (
                                                <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium">
                                                    ⏳ {stats.pending} Pending
                                                </span>
                                            )}
                                            {stats.noShow > 0 && (
                                                <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
                                                    ✕ {stats.noShow} No-Show
                                                </span>
                                            )}
                                        </div>
                                        {isExpanded ? (
                                            <ChevronUp className="w-5 h-5 text-white/40" />
                                        ) : (
                                            <ChevronDown className="w-5 h-5 text-white/40" />
                                        )}
                                    </div>
                                </button>

                                {/* Order Table */}
                                {isExpanded && (
                                    <div className="mt-4 overflow-x-auto">
                                        {shiftOrders.length > 0 ? (
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-white/10">
                                                        <th className="text-left py-3 px-3 text-white/50 font-medium">No</th>
                                                        <th className="text-left py-3 px-3 text-white/50 font-medium">Nama</th>
                                                        <th className="text-left py-3 px-3 text-white/50 font-medium">ID</th>
                                                        <th className="text-left py-3 px-3 text-white/50 font-medium">Perusahaan</th>
                                                        <th className="text-left py-3 px-3 text-white/50 font-medium">Departemen</th>
                                                        <th className="text-center py-3 px-3 text-white/50 font-medium">Status</th>
                                                        <th className="text-center py-3 px-3 text-white/50 font-medium">Waktu Check-in</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {shiftOrders.map((order, idx) => (
                                                        <tr key={order.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                            <td className="py-3 px-3 text-white/70">{idx + 1}</td>
                                                            <td className="py-3 px-3 font-medium text-white">{order.user.name}</td>
                                                            <td className="py-3 px-3 text-white/70 font-mono text-xs">{order.user.externalId}</td>
                                                            <td className="py-3 px-3 text-white/70">{order.user.company || '-'}</td>
                                                            <td className="py-3 px-3 text-white/70">{order.user.department || '-'}</td>
                                                            <td className="py-3 px-3 text-center">
                                                                <span className={`badge ${getStatusBadge(order.status)}`}>
                                                                    {getStatusLabel(order.status)}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-3 text-center text-white/70 text-xs">
                                                                {order.checkInTime
                                                                    ? format(new Date(order.checkInTime), 'HH:mm:ss', { locale: id })
                                                                    : '-'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="py-8 text-center text-white/40">
                                                Belum ada order untuk shift ini
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="card">
                    <div className="text-center py-12">
                        <CalendarDays className="w-16 h-16 text-white/20 mx-auto mb-4" />
                        <p className="text-white/40 text-lg">Belum ada shift aktif</p>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {shifts.length > 0 && totalOrders === 0 && (
                <div className="card">
                    <div className="text-center py-12">
                        <CalendarDays className="w-16 h-16 text-white/20 mx-auto mb-4" />
                        <p className="text-white/40 text-lg">Belum ada pesanan untuk tanggal ini</p>
                        <p className="text-white/30 text-sm mt-2">Gunakan date picker untuk memilih tanggal lain</p>
                    </div>
                </div>
            )}
        </div>
    );
}
