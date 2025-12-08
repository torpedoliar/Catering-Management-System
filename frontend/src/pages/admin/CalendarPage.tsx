import { useState, useEffect, useCallback } from 'react';
import { Calendar, Plus, Trash2, ChevronLeft, ChevronRight, X, Utensils, Clock, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, HOLIDAY_EVENTS } from '../../contexts/SSEContext';

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
}

interface Holiday {
    id: string;
    date: string;
    name: string;
    description?: string;
    shiftId?: string | null;
    shift?: Shift | null;
    isActive: boolean;
}

interface ShiftOrderStat {
    count: number;
    shiftName: string;
}

interface CalendarData {
    holidays: Holiday[];
    orderStats: Record<string, number>;
    orderStatsByShift: Record<string, Record<string, ShiftOrderStat>>;
    shifts: Shift[];
    year: number;
    month: number;
}

interface BulkEntry {
    id: string;
    startDate: string;
    endDate: string;
    name: string;
    description: string;
    shiftIds: string[]; // Array of shift IDs, empty = fullday
    isFullday: boolean; // If true, all shifts are blocked
}

export default function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [newHoliday, setNewHoliday] = useState({ name: '', description: '', shiftIds: [] as string[], isFullday: true });
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkEntries, setBulkEntries] = useState<BulkEntry[]>([
        { id: '1', startDate: '', endDate: '', name: '', description: '', shiftIds: [], isFullday: true }
    ]);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    const loadCalendarData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [calRes, shiftRes] = await Promise.all([
                api.get(`/api/holidays/calendar/${year}/${month}`),
                api.get('/api/shifts')
            ]);
            setCalendarData(calRes.data);
            setShifts(shiftRes.data.shifts || []);
        } catch (error) {
            console.error('Failed to load calendar:', error);
            toast.error('Gagal memuat data kalender');
        } finally {
            setIsLoading(false);
        }
    }, [year, month]);

    useEffect(() => {
        loadCalendarData();
    }, [loadCalendarData]);

    // Auto-refresh on holiday events (SSE)
    useSSERefresh(HOLIDAY_EVENTS, loadCalendarData);

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month, 0).getDate();
    };

    const getFirstDayOfMonth = (year: number, month: number) => {
        return new Date(year, month - 1, 1).getDay();
    };

    const formatDateKey = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getHolidaysForDate = (dateStr: string) => {
        return calendarData?.holidays.filter((h: Holiday) => {
            // Extract date without timezone conversion
            const holidayDateStr = h.date.split('T')[0];
            return holidayDateStr === dateStr;
        }) || [];
    };

    const getOrderCount = (dateStr: string) => {
        return calendarData?.orderStats[dateStr] || 0;
    };

    const getOrdersByShift = (dateStr: string) => {
        return calendarData?.orderStatsByShift[dateStr] || {};
    };

    const prevMonth = () => {
        setCurrentDate(new Date(year, month - 2, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(year, month, 1));
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    const handleDateClick = (day: number) => {
        const clickedDate = new Date(year, month - 1, day);
        setSelectedDate(clickedDate);
        setNewHoliday({ name: '', description: '', shiftIds: [], isFullday: true });
        setShowAddModal(true);
    };

    const handleAddHoliday = async () => {
        if (!selectedDate || !newHoliday.name.trim()) {
            toast.error('Nama hari libur harus diisi');
            return;
        }

        try {
            const dateStr = formatDateKey(selectedDate);

            if (newHoliday.isFullday) {
                // Create single fullday holiday
                await api.post('/api/holidays', {
                    date: dateStr,
                    name: newHoliday.name.trim(),
                    description: newHoliday.description.trim() || null,
                    shiftId: null
                });
            } else {
                // Create holiday for each selected shift
                for (const shiftId of newHoliday.shiftIds) {
                    await api.post('/api/holidays', {
                        date: dateStr,
                        name: newHoliday.name.trim(),
                        description: newHoliday.description.trim() || null,
                        shiftId: shiftId
                    });
                }
            }
            toast.success('Hari libur berhasil ditambahkan');
            setShowAddModal(false);
            setNewHoliday({ name: '', description: '', shiftIds: [], isFullday: true });
            setSelectedDate(null);
            loadCalendarData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menambah hari libur');
        }
    };

    const handleDeleteHoliday = async (holidayId: string, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }

        setIsDeleting(holidayId);
        try {
            await api.delete(`/api/holidays/${holidayId}`);
            toast.success('Hari libur berhasil dihapus');
            await loadCalendarData();
        } catch (error: any) {
            console.error('Delete error:', error);
            toast.error(error.response?.data?.error || 'Gagal menghapus hari libur');
        } finally {
            setIsDeleting(null);
        }
    };

    // Bulk entry functions
    const addBulkEntry = () => {
        setBulkEntries(prev => [...prev, {
            id: Date.now().toString(),
            startDate: '',
            endDate: '',
            name: '',
            description: '',
            shiftIds: [],
            isFullday: true
        }]);
    };

    const removeBulkEntry = (id: string) => {
        if (bulkEntries.length === 1) {
            toast.error('Minimal harus ada 1 entry');
            return;
        }
        setBulkEntries(prev => prev.filter(e => e.id !== id));
    };

    const updateBulkEntry = (id: string, field: string, value: any) => {
        setBulkEntries(prev => prev.map(e =>
            e.id === id ? { ...e, [field]: value } : e
        ));
    };

    const toggleBulkShift = (entryId: string, shiftId: string) => {
        setBulkEntries(prev => prev.map(e => {
            if (e.id === entryId) {
                const newShiftIds = e.shiftIds.includes(shiftId)
                    ? e.shiftIds.filter(s => s !== shiftId)
                    : [...e.shiftIds, shiftId];
                return { ...e, shiftIds: newShiftIds };
            }
            return e;
        }));
    };

    const calculateTotalDays = () => {
        let total = 0;
        bulkEntries.forEach(entry => {
            if (entry.startDate && entry.endDate) {
                const start = new Date(entry.startDate);
                const end = new Date(entry.endDate);
                if (end >= start) {
                    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    // If fullday, count once. If specific shifts, multiply by shift count
                    if (entry.isFullday) {
                        total += days;
                    } else {
                        total += days * Math.max(1, entry.shiftIds.length);
                    }
                }
            }
        });
        return total;
    };

    const handleBulkAdd = async () => {
        const validEntries = bulkEntries.filter(e =>
            e.startDate && e.endDate && e.name.trim()
        );

        if (validEntries.length === 0) {
            toast.error('Minimal 1 entry harus lengkap (tanggal & nama)');
            return;
        }

        setIsSaving(true);
        try {
            // Transform entries for API - if not fullday and has shiftIds, create multiple entries
            const apiEntries: any[] = [];
            validEntries.forEach(e => {
                if (e.isFullday) {
                    // Single fullday entry
                    apiEntries.push({
                        startDate: e.startDate,
                        endDate: e.endDate,
                        name: e.name.trim(),
                        description: e.description.trim() || null,
                        shiftId: null
                    });
                } else if (e.shiftIds.length > 0) {
                    // Create entry for each selected shift
                    e.shiftIds.forEach(shiftId => {
                        apiEntries.push({
                            startDate: e.startDate,
                            endDate: e.endDate,
                            name: e.name.trim(),
                            description: e.description.trim() || null,
                            shiftId: shiftId
                        });
                    });
                } else {
                    // If not fullday but no shifts selected, treat as fullday
                    apiEntries.push({
                        startDate: e.startDate,
                        endDate: e.endDate,
                        name: e.name.trim(),
                        description: e.description.trim() || null,
                        shiftId: null
                    });
                }
            });

            const res = await api.post('/api/holidays/bulk', { entries: apiEntries });
            toast.success(res.data.message);
            setShowBulkModal(false);
            setBulkEntries([{ id: '1', startDate: '', endDate: '', name: '', description: '', shiftIds: [], isFullday: true }]);
            loadCalendarData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menambah hari libur');
        } finally {
            setIsSaving(false);
        }
    };

    const monthNames = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const today = new Date();
    const todayStr = formatDateKey(today);

    const renderCalendarDays = () => {
        const days = [];

        for (let i = 0; i < firstDay; i++) {
            days.push(
                <div key={`empty-${i}`} className="h-24 bg-slate-900/30"></div>
            );
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dateStr = formatDateKey(date);
            const holidays = getHolidaysForDate(dateStr);
            const orderCount = getOrderCount(dateStr);
            const ordersByShift = getOrdersByShift(dateStr);
            const shiftEntries = Object.entries(ordersByShift);
            const isToday = dateStr === todayStr;
            const isSunday = date.getDay() === 0;
            const hasFulldayHoliday = holidays.some((h: Holiday) => !h.shiftId);
            const hasShiftHoliday = holidays.some((h: Holiday) => h.shiftId);

            days.push(
                <div
                    key={day}
                    onClick={() => handleDateClick(day)}
                    className={`h-28 p-2 border border-slate-700/50 cursor-pointer transition-all hover:bg-slate-700/30 relative ${isToday ? 'ring-2 ring-cyan-500 bg-cyan-500/10' : ''
                        } ${hasFulldayHoliday ? 'bg-red-500/20' : hasShiftHoliday ? 'bg-orange-500/10' : ''} ${isSunday && !hasFulldayHoliday ? 'bg-orange-500/10' : ''}`}
                >
                    <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${isToday ? 'text-cyan-400' :
                            hasFulldayHoliday ? 'text-red-400' :
                                isSunday ? 'text-orange-400' : 'text-white'
                            }`}>
                            {day}
                        </span>
                        {orderCount > 0 && (
                            <div className="flex items-center gap-1 text-xs text-green-400 font-medium">
                                <Utensils className="w-3 h-3" />
                                {orderCount}
                            </div>
                        )}
                    </div>

                    {/* Order breakdown by shift */}
                    {shiftEntries.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                            {shiftEntries.map(([shiftId, stat]) => (
                                <span key={shiftId} className="text-[10px] bg-green-500/20 text-green-400 px-1 rounded">
                                    {stat.shiftName.replace('Shift ', 'S')}: {stat.count}
                                </span>
                            ))}
                        </div>
                    )}

                    {holidays.length > 0 && (
                        <div className="mt-1 space-y-0.5 overflow-hidden">
                            {holidays.slice(0, 1).map((holiday: Holiday) => (
                                <div key={holiday.id} className="group relative">
                                    <div className={`text-[10px] truncate flex items-center gap-1 ${holiday.shiftId ? 'text-orange-400' : 'text-red-400'}`}>
                                        {holiday.shiftId ? '⏰' : '🎌'} {holiday.name}
                                    </div>
                                    <button
                                        onClick={(e) => handleDeleteHoliday(holiday.id, e)}
                                        disabled={isDeleting === holiday.id}
                                        className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 
                                                 p-0.5 bg-red-500/80 rounded hover:bg-red-500 transition-all
                                                 disabled:opacity-50"
                                    >
                                        {isDeleting === holiday.id ? (
                                            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Trash2 className="w-3 h-3 text-white" />
                                        )}
                                    </button>
                                </div>
                            ))}
                            {holidays.length > 1 && (
                                <div className="text-[10px] text-slate-500">+{holidays.length - 1} lainnya</div>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        return days;
    };

    if (isLoading && !calendarData) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Calendar className="w-8 h-8 text-cyan-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Kalender</h1>
                        <p className="text-slate-400">Kelola hari libur dan lihat statistik pesanan</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowBulkModal(true)}
                    className="btn-primary flex items-center gap-2"
                >
                    <Copy className="w-4 h-4" />
                    Bulk Hari Libur
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Calendar */}
                <div className="lg:col-span-3 card">
                    {/* Month Navigation */}
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={prevMonth} className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors">
                            <ChevronLeft className="w-5 h-5 text-slate-400" />
                        </button>

                        <div className="flex items-center gap-4">
                            <h2 className="text-xl font-semibold text-white">
                                {monthNames[month - 1]} {year}
                            </h2>
                            <button onClick={goToToday} className="px-3 py-1 text-sm bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors">
                                Hari Ini
                            </button>
                        </div>

                        <button onClick={nextMonth} className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors">
                            <ChevronRight className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>

                    {/* Day Headers */}
                    <div className="grid grid-cols-7 mb-2">
                        {dayNames.map((day, idx) => (
                            <div key={day} className={`text-center text-sm font-medium py-2 ${idx === 0 ? 'text-orange-400' : 'text-slate-400'}`}>
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-px bg-slate-700/30 rounded-lg overflow-hidden">
                        {renderCalendarDays()}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-slate-400">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-cyan-500/30 ring-1 ring-cyan-500"></div>
                            <span>Hari Ini</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-red-500/30"></div>
                            <span>🎌 Libur Full</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-orange-500/20"></div>
                            <span>⏰ Libur Shift</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Utensils className="w-4 h-4 text-green-400" />
                            <span>Jumlah Pesanan</span>
                        </div>
                    </div>
                </div>

                {/* Sidebar - Holidays List */}
                <div className="card">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        🎌 Hari Libur Bulan Ini
                    </h3>

                    {calendarData?.holidays && calendarData.holidays.length > 0 ? (
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                            {calendarData.holidays.map((holiday: Holiday) => (
                                <div
                                    key={holiday.id}
                                    className={`p-3 border rounded-lg group ${holiday.shiftId ? 'bg-orange-500/10 border-orange-500/30' : 'bg-red-500/10 border-red-500/30'}`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm font-medium ${holiday.shiftId ? 'text-orange-400' : 'text-red-400'}`}>
                                                {new Date(holiday.date).toLocaleDateString('id-ID', {
                                                    weekday: 'long',
                                                    day: 'numeric',
                                                    month: 'long'
                                                })}
                                            </div>
                                            <div className="text-white font-medium mt-1 truncate">
                                                {holiday.shiftId ? '⏰' : '🎌'} {holiday.name}
                                            </div>
                                            {holiday.shift && (
                                                <div className="text-xs text-slate-400 mt-1">
                                                    Shift: {holiday.shift.name}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleDeleteHoliday(holiday.id)}
                                            disabled={isDeleting === holiday.id}
                                            className="p-1.5 hover:bg-red-500/30 rounded transition-all flex-shrink-0 ml-2"
                                        >
                                            {isDeleting === holiday.id ? (
                                                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4 text-red-400" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-slate-500 py-8">
                            <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>Tidak ada hari libur</p>
                        </div>
                    )}

                    {/* Quick Stats */}
                    <div className="mt-6 pt-6 border-t border-slate-700/50">
                        <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                            <Clock className="w-4 h-4" /> Statistik
                        </h4>
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Total Pesanan</span>
                                <span className="text-green-400 font-medium">
                                    {calendarData?.orderStats ? Object.values(calendarData.orderStats).reduce((a: number, b: number) => a + b, 0) : 0}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Hari Libur</span>
                                <span className="text-red-400 font-medium">{calendarData?.holidays?.length || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bulk Add Holiday Modal */}
            {showBulkModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 rounded-xl w-full max-w-5xl border border-slate-700 max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-slate-700">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Copy className="w-5 h-5 text-cyan-400" />
                                Bulk Tambah Hari Libur
                            </h3>
                            <button
                                onClick={() => {
                                    setShowBulkModal(false);
                                    setBulkEntries([{ id: '1', startDate: '', endDate: '', name: '', description: '', shiftIds: [], isFullday: true }]);
                                }}
                                className="p-1 hover:bg-slate-700 rounded"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {bulkEntries.map((entry, index) => (
                                <div key={entry.id} className="p-4 rounded-xl bg-slate-700/50 border border-slate-600/50">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-medium text-cyan-400">Entry #{index + 1}</span>
                                        <button onClick={() => removeBulkEntry(entry.id)} className="p-1 hover:bg-red-500/20 rounded text-red-400">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3">
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1">Tanggal Mulai *</label>
                                            <input
                                                type="date"
                                                value={entry.startDate}
                                                onChange={(e) => updateBulkEntry(entry.id, 'startDate', e.target.value)}
                                                className="input-field w-full text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1">Tanggal Akhir *</label>
                                            <input
                                                type="date"
                                                value={entry.endDate}
                                                onChange={(e) => updateBulkEntry(entry.id, 'endDate', e.target.value)}
                                                className="input-field w-full text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1">Nama Libur *</label>
                                            <input
                                                type="text"
                                                value={entry.name}
                                                onChange={(e) => updateBulkEntry(entry.id, 'name', e.target.value)}
                                                placeholder="Cuti Bersama"
                                                className="input-field w-full text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs text-slate-400 mb-1">Deskripsi</label>
                                            <input
                                                type="text"
                                                value={entry.description}
                                                onChange={(e) => updateBulkEntry(entry.id, 'description', e.target.value)}
                                                placeholder="Opsional"
                                                className="input-field w-full text-sm"
                                            />
                                        </div>
                                    </div>

                                    {/* Shift Selection */}
                                    <div className="border-t border-slate-600/50 pt-3">
                                        <label className="block text-xs text-slate-400 mb-2">Tipe Libur</label>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                onClick={() => updateBulkEntry(entry.id, 'isFullday', true)}
                                                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${entry.isFullday
                                                    ? 'bg-red-500/30 text-red-400 border border-red-500/50'
                                                    : 'bg-slate-600/50 text-slate-400 border border-slate-600 hover:border-slate-500'
                                                    }`}
                                            >
                                                🎌 Fullday (Semua Shift)
                                            </button>
                                            <button
                                                onClick={() => updateBulkEntry(entry.id, 'isFullday', false)}
                                                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${!entry.isFullday
                                                    ? 'bg-orange-500/30 text-orange-400 border border-orange-500/50'
                                                    : 'bg-slate-600/50 text-slate-400 border border-slate-600 hover:border-slate-500'
                                                    }`}
                                            >
                                                ⏰ Pilih Shift
                                            </button>
                                        </div>

                                        {!entry.isFullday && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {shifts.map((shift: Shift) => (
                                                    <button
                                                        key={shift.id}
                                                        onClick={() => toggleBulkShift(entry.id, shift.id)}
                                                        className={`px-3 py-1.5 rounded-lg text-sm transition-all ${entry.shiftIds.includes(shift.id)
                                                            ? 'bg-cyan-500/30 text-cyan-400 border border-cyan-500/50'
                                                            : 'bg-slate-600/50 text-slate-400 border border-slate-600 hover:border-slate-500'
                                                            }`}
                                                    >
                                                        {entry.shiftIds.includes(shift.id) ? '✓ ' : ''}{shift.name} ({shift.startTime}-{shift.endTime})
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            <button
                                onClick={addBulkEntry}
                                className="w-full py-3 border-2 border-dashed border-slate-600 rounded-xl text-slate-400 
                                         hover:border-cyan-500 hover:text-cyan-400 transition-colors flex items-center justify-center gap-2"
                            >
                                <Plus className="w-5 h-5" />
                                Tambah Entry
                            </button>
                        </div>

                        <div className="p-6 border-t border-slate-700 bg-slate-800/50">
                            <div className="flex items-center justify-between">
                                <div className="text-sm text-slate-400">
                                    Total: <span className="text-cyan-400 font-medium">{calculateTotalDays()}</span> hari libur dari <span className="text-cyan-400 font-medium">{bulkEntries.length}</span> entry
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setShowBulkModal(false)} className="btn-secondary">Batal</button>
                                    <button onClick={handleBulkAdd} disabled={isSaving} className="btn-success flex items-center gap-2">
                                        {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
                                        Tambah Semua
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Single Holiday Modal */}
            {showAddModal && selectedDate && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white">Tambah Hari Libur</h3>
                            <button
                                onClick={() => {
                                    setShowAddModal(false);
                                    setNewHoliday({ name: '', description: '', shiftIds: [], isFullday: true });
                                    setSelectedDate(null);
                                }}
                                className="p-1 hover:bg-slate-700 rounded"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="mb-4 p-3 bg-slate-700/50 rounded-lg">
                            <div className="text-sm text-slate-400">Tanggal</div>
                            <div className="text-white font-medium">
                                {selectedDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Nama Hari Libur *</label>
                                <input
                                    type="text"
                                    value={newHoliday.name}
                                    onChange={(e) => setNewHoliday(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Contoh: Idul Fitri"
                                    className="input-field w-full"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Deskripsi</label>
                                <textarea
                                    value={newHoliday.description}
                                    onChange={(e) => setNewHoliday(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Opsional"
                                    className="input-field w-full h-16 resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">Tipe Libur</label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    <button
                                        onClick={() => setNewHoliday(prev => ({ ...prev, isFullday: true, shiftIds: [] }))}
                                        className={`px-3 py-1.5 rounded-lg text-sm ${newHoliday.isFullday ? 'bg-red-500/30 text-red-400 border border-red-500/50' : 'bg-slate-600/50 text-slate-400 border border-slate-600'}`}
                                    >
                                        🎌 Fullday
                                    </button>
                                    <button
                                        onClick={() => setNewHoliday(prev => ({ ...prev, isFullday: false }))}
                                        className={`px-3 py-1.5 rounded-lg text-sm ${!newHoliday.isFullday ? 'bg-orange-500/30 text-orange-400 border border-orange-500/50' : 'bg-slate-600/50 text-slate-400 border border-slate-600'}`}
                                    >
                                        ⏰ Pilih Shift
                                    </button>
                                </div>
                                {!newHoliday.isFullday && (
                                    <div className="flex flex-wrap gap-2">
                                        {shifts.map((shift: Shift) => (
                                            <button
                                                key={shift.id}
                                                onClick={() => {
                                                    setNewHoliday(prev => ({
                                                        ...prev,
                                                        shiftIds: prev.shiftIds.includes(shift.id)
                                                            ? prev.shiftIds.filter(s => s !== shift.id)
                                                            : [...prev.shiftIds, shift.id]
                                                    }));
                                                }}
                                                className={`px-3 py-1.5 rounded-lg text-sm ${newHoliday.shiftIds.includes(shift.id) ? 'bg-cyan-500/30 text-cyan-400 border border-cyan-500/50' : 'bg-slate-600/50 text-slate-400 border border-slate-600'}`}
                                            >
                                                {newHoliday.shiftIds.includes(shift.id) ? '✓ ' : ''}{shift.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setShowAddModal(false)} className="flex-1 btn-secondary">Batal</button>
                                <button onClick={handleAddHoliday} className="flex-1 btn-success flex items-center justify-center gap-2">
                                    <Plus className="w-4 h-4" /> Tambah
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
