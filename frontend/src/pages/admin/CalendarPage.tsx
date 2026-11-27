import { useState, useEffect, useCallback } from 'react';
import { Calendar as CalendarIcon, Plus, Trash2, ChevronLeft, ChevronRight, Sun, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { getLocalDateString } from '../../utils/dateHelpers';
import { useSSERefresh, HOLIDAY_EVENTS, ORDER_EVENTS } from '../../contexts/SSEContext';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    Modal,
    Field,
    Input,
    Skeleton,
} from '../../components/ui';

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

interface CalendarData {
    holidays: Holiday[];
    orderStats: Record<string, number>;
    orderStatsByShift: Record<string, Record<string, { count: number; shiftName: string }>>;
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
    shiftIds: string[];
    isFullday: boolean;
}

const MONTH_NAMES = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
];
const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function toDateKey(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function CalendarPage() {
    const initialParts = getLocalDateString().split('-').map(Number);
    const [year, setYear] = useState(initialParts[0]);
    const [month, setMonth] = useState(initialParts[1]);

    const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedDateKey, setSelectedDateKey] = useState<string>('');
    const [newHoliday, setNewHoliday] = useState({
        name: '',
        description: '',
        shiftIds: [] as string[],
        isFullday: true,
    });

    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkEntries, setBulkEntries] = useState<BulkEntry[]>([
        { id: '1', startDate: '', endDate: '', name: '', description: '', shiftIds: [], isFullday: true },
    ]);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    const [sundayAutoHoliday, setSundayAutoHoliday] = useState(false);
    const [isTogglingSunday, setIsTogglingSunday] = useState(false);
    const [nationalAutoHoliday, setNationalAutoHoliday] = useState(false);
    const [isTogglingNational, setIsTogglingNational] = useState(false);

    const loadCalendarData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [calRes, shiftRes] = await Promise.all([
                api.get(`/api/holidays/calendar/${year}/${month}`),
                api.get('/api/shifts'),
            ]);
            setCalendarData(calRes.data);
            setShifts(shiftRes.data.shifts || []);
        } catch {
            toast.error('Gagal memuat data kalender');
        } finally {
            setIsLoading(false);
        }
    }, [year, month]);

    useEffect(() => {
        loadCalendarData();
    }, [loadCalendarData]);

    useEffect(() => {
        api.get('/api/holidays/sundays/status')
            .then((res) => setSundayAutoHoliday(Boolean(res.data.enabled)))
            .catch(() => {});
    }, []);

    useEffect(() => {
        api.get(`/api/holidays/national/status?year=${year}`)
            .then((res) => setNationalAutoHoliday(Boolean(res.data.enabled)))
            .catch(() => {});
    }, [year]);

    useSSERefresh([...HOLIDAY_EVENTS, ...ORDER_EVENTS], loadCalendarData);

    const handleToggleSunday = async () => {
        setIsTogglingSunday(true);
        try {
            const res = await api.post('/api/holidays/sundays/toggle', { enabled: !sundayAutoHoliday });
            setSundayAutoHoliday(!sundayAutoHoliday);
            toast.success(res.data.message);
            loadCalendarData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal mengubah pengaturan');
        } finally {
            setIsTogglingSunday(false);
        }
    };

    const handleToggleNational = async () => {
        setIsTogglingNational(true);
        try {
            const res = await api.post('/api/holidays/national/toggle', {
                year,
                enabled: !nationalAutoHoliday,
            });
            setNationalAutoHoliday(!nationalAutoHoliday);
            toast.success(res.data.message);
            loadCalendarData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal sinkronisasi libur nasional');
        } finally {
            setIsTogglingNational(false);
        }
    };

    const prevMonth = () => {
        if (month === 1) {
            setYear((y) => y - 1);
            setMonth(12);
        } else {
            setMonth((m) => m - 1);
        }
    };

    const nextMonth = () => {
        if (month === 12) {
            setYear((y) => y + 1);
            setMonth(1);
        } else {
            setMonth((m) => m + 1);
        }
    };

    const goToToday = () => {
        const [y, m] = getLocalDateString().split('-').map(Number);
        setYear(y);
        setMonth(m);
    };

    const getHolidaysForDate = (dateStr: string) =>
        calendarData?.holidays.filter((h) => h.date.split('T')[0] === dateStr) || [];

    const handleAddHoliday = async () => {
        if (!selectedDateKey || !newHoliday.name.trim()) {
            toast.error('Nama hari libur wajib diisi');
            return;
        }
        if (!newHoliday.isFullday && newHoliday.shiftIds.length === 0) {
            toast.error('Pilih minimal satu shift atau gunakan Seharian');
            return;
        }
        setIsSaving(true);
        try {
            if (newHoliday.isFullday) {
                await api.post('/api/holidays', {
                    date: selectedDateKey,
                    name: newHoliday.name.trim(),
                    description: newHoliday.description.trim() || null,
                    shiftId: null,
                });
            } else {
                for (const shiftId of newHoliday.shiftIds) {
                    await api.post('/api/holidays', {
                        date: selectedDateKey,
                        name: newHoliday.name.trim(),
                        description: newHoliday.description.trim() || null,
                        shiftId,
                    });
                }
            }
            toast.success('Hari libur ditambahkan');
            setShowAddModal(false);
            setNewHoliday({ name: '', description: '', shiftIds: [], isFullday: true });
            loadCalendarData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menambah hari libur');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteHoliday = async (holidayId: string) => {
        setIsDeleting(holidayId);
        try {
            await api.delete(`/api/holidays/${holidayId}`);
            toast.success('Hari libur dihapus');
            await loadCalendarData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menghapus hari libur');
        } finally {
            setIsDeleting(null);
        }
    };

    const handleBulkAdd = async () => {
        const valid = bulkEntries.filter((e) => e.startDate && e.endDate && e.name.trim());
        if (valid.length === 0) {
            toast.error('Minimal 1 entri harus lengkap (tanggal & nama)');
            return;
        }
        setIsSaving(true);
        try {
            const apiEntries: Array<Record<string, unknown>> = [];
            valid.forEach((e) => {
                if (e.isFullday || e.shiftIds.length === 0) {
                    apiEntries.push({
                        startDate: e.startDate,
                        endDate: e.endDate,
                        name: e.name.trim(),
                        description: e.description.trim() || null,
                        shiftId: null,
                    });
                } else {
                    e.shiftIds.forEach((shiftId) => {
                        apiEntries.push({
                            startDate: e.startDate,
                            endDate: e.endDate,
                            name: e.name.trim(),
                            description: e.description.trim() || null,
                            shiftId,
                        });
                    });
                }
            });
            const res = await api.post('/api/holidays/bulk', { entries: apiEntries });
            toast.success(res.data.message);
            setShowBulkModal(false);
            setBulkEntries([
                { id: '1', startDate: '', endDate: '', name: '', description: '', shiftIds: [], isFullday: true },
            ]);
            loadCalendarData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menambah hari libur massal');
        } finally {
            setIsSaving(false);
        }
    };

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay();
    const todayStr = getLocalDateString();

    return (
        <div className="space-y-4">
            <PageHeader
                title="Kalender & hari libur"
                subtitle="Atur hari libur penuh atau per shift dan pantau volume order bulanan"
                actions={
                    <>
                        <Button
                            variant="secondary"
                            size="sm"
                            loading={isTogglingSunday}
                            onClick={handleToggleSunday}
                            leftIcon={<Sun className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Libur Minggu: {sundayAutoHoliday ? 'Aktif' : 'Nonaktif'}
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            loading={isTogglingNational}
                            onClick={handleToggleNational}
                            leftIcon={<CalendarIcon className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Libur Nasional {year}: {nationalAutoHoliday ? 'Aktif' : 'Nonaktif'}
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setShowBulkModal(true)}
                            leftIcon={<Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Tambah libur massal
                        </Button>
                    </>
                }
            />

            <Card padding="none">
                {/* Month Navigator */}
                <div className="px-4 py-3 border-b border-[#f5f5f4] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={prevMonth} aria-label="Bulan sebelumnya">
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <h2 className="text-[15px] font-bold text-[#1c1917] min-w-[150px] text-center">
                            {MONTH_NAMES[month - 1]} {year}
                        </h2>
                        <Button variant="secondary" size="sm" onClick={nextMonth} aria-label="Bulan berikutnya">
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={goToToday}>
                        Hari ini
                    </Button>
                </div>

                {isLoading ? (
                    <div className="p-4">
                        <Skeleton className="h-[420px] w-full" />
                    </div>
                ) : (
                    <div className="p-3 overflow-x-auto">
                        <div className="min-w-[680px]">
                            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                                {DAY_NAMES.map((d, i) => (
                                    <div
                                        key={d}
                                        className={`text-center py-1.5 text-[11.5px] font-bold uppercase ${
                                            i === 0 ? 'text-[#b91c1c]' : 'text-[#78716c]'
                                        }`}
                                    >
                                        {d}
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-7 gap-1.5">
                                {Array.from({ length: firstDay }).map((_, idx) => (
                                    <div key={`empty-${idx}`} className="min-h-[96px] rounded-[10px] bg-[#fafaf9]/60" />
                                ))}

                                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                                    const dateStr = toDateKey(year, month, day);
                                    const dayHolidays = getHolidaysForDate(dateStr);
                                    const orderCount = calendarData?.orderStats[dateStr] || 0;
                                    const isToday = dateStr === todayStr;
                                    const isSunday = new Date(year, month - 1, day).getDay() === 0;
                                    const hasFulldayHoliday = dayHolidays.some((h) => !h.shiftId);

                                    return (
                                        <div
                                            key={day}
                                            onClick={() => {
                                                setSelectedDateKey(dateStr);
                                                setNewHoliday({ name: '', description: '', shiftIds: [], isFullday: true });
                                                setShowAddModal(true);
                                            }}
                                            className={`min-h-[96px] rounded-[10px] p-2 border cursor-pointer transition-colors flex flex-col justify-between ${
                                                hasFulldayHoliday
                                                    ? 'bg-[#fef2f2] border-[#fecaca]'
                                                    : isToday
                                                        ? 'bg-[#fffbeb] border-[#f59e0b]'
                                                        : 'bg-[#fff] border-[#e7e5e4] hover:border-[#d6d3d1]'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span
                                                    className={`text-[12.5px] font-bold tabular-nums ${
                                                        hasFulldayHoliday || isSunday
                                                            ? 'text-[#b91c1c]'
                                                            : isToday
                                                                ? 'text-[#b45309]'
                                                                : 'text-[#1c1917]'
                                                    }`}
                                                >
                                                    {day}
                                                </span>
                                                {orderCount > 0 && (
                                                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#eff6ff] text-[#1d4ed8] tabular-nums">
                                                        {orderCount}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="space-y-1 mt-1">
                                                {dayHolidays.map((h) => (
                                                    <div
                                                        key={h.id}
                                                        className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded bg-[#fee2e2] text-[#991b1b] text-[10.5px] font-semibold"
                                                    >
                                                        <span className="truncate">
                                                            {h.name}
                                                            {h.shift ? ` (${h.shift.name})` : ''}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            aria-label={`Hapus libur ${h.name}`}
                                                            disabled={isDeleting === h.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteHoliday(h.id);
                                                            }}
                                                            className="p-0.5 border-0 bg-transparent text-[#b91c1c] hover:text-[#7f1d1d] cursor-pointer flex-shrink-0"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            {/* Holiday list summary */}
            {calendarData && calendarData.holidays.length > 0 && (
                <Card>
                    <h3 className="text-[14px] font-bold text-[#1c1917] mb-3">
                        Daftar libur bulan {MONTH_NAMES[month - 1]} ({calendarData.holidays.length})
                    </h3>
                    <div className="divide-y divide-[#f5f5f4]">
                        {calendarData.holidays.map((h) => (
                            <div key={h.id} className="py-2 flex items-center justify-between gap-3 text-[13px]">
                                <div>
                                    <span className="font-mono text-[#57534e] mr-2">{h.date.split('T')[0]}</span>
                                    <span className="font-semibold text-[#1c1917]">{h.name}</span>
                                    <span className="ml-2">
                                        <Badge variant={h.shift ? 'warning' : 'danger'}>
                                            {h.shift ? `Shift: ${h.shift.name}` : 'Seharian'}
                                        </Badge>
                                    </span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    loading={isDeleting === h.id}
                                    onClick={() => handleDeleteHoliday(h.id)}
                                    aria-label={`Hapus ${h.name}`}
                                >
                                    <Trash2 className="w-3.5 h-3.5 text-[#b91c1c]" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Add Single Holiday Modal */}
            <Modal
                open={showAddModal}
                onClose={() => setShowAddModal(false)}
                title={`Kelola hari libur — ${selectedDateKey}`}
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowAddModal(false)}>
                            Tutup
                        </Button>
                        <Button variant="primary" loading={isSaving} onClick={handleAddHoliday}>
                            Tambah libur
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    {selectedDateKey && getHolidaysForDate(selectedDateKey).length > 0 && (
                        <div className="space-y-1.5 pb-2 border-b border-[#f5f5f4]">
                            <div className="text-[12px] font-semibold text-[#57534e]">Libur pada tanggal ini:</div>
                            {getHolidaysForDate(selectedDateKey).map((h) => (
                                <div
                                    key={h.id}
                                    className="flex items-center justify-between px-3 py-1.5 rounded-[8px] bg-[#fef2f2] border border-[#fecaca] text-[12.5px] text-[#991b1b]"
                                >
                                    <span>
                                        {h.name} {h.shift ? `(${h.shift.name})` : '(Seharian)'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteHoliday(h.id)}
                                        className="border-0 bg-transparent text-[#b91c1c] cursor-pointer"
                                        aria-label={`Hapus ${h.name}`}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <Field label="Nama hari libur" required>
                        <Input
                            value={newHoliday.name}
                            onChange={(e) => setNewHoliday((f) => ({ ...f, name: e.target.value }))}
                            placeholder="Contoh: Libur Idul Fitri"
                        />
                    </Field>
                    <Field label="Keterangan" hint="Opsional">
                        <Input
                            value={newHoliday.description}
                            onChange={(e) => setNewHoliday((f) => ({ ...f, description: e.target.value }))}
                        />
                    </Field>
                    <label className="flex items-center gap-2 text-[13px] font-medium text-[#1c1917] cursor-pointer">
                        <input
                            type="checkbox"
                            checked={newHoliday.isFullday}
                            onChange={(e) =>
                                setNewHoliday((f) => ({ ...f, isFullday: e.target.checked }))
                            }
                        />
                        Blokir seharian (semua shift)
                    </label>
                    {!newHoliday.isFullday && (
                        <div className="flex flex-wrap gap-1.5">
                            {shifts.map((s) => {
                                const on = newHoliday.shiftIds.includes(s.id);
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() =>
                                            setNewHoliday((f) => ({
                                                ...f,
                                                shiftIds: on
                                                    ? f.shiftIds.filter((x) => x !== s.id)
                                                    : [...f.shiftIds, s.id],
                                            }))
                                        }
                                        className={`h-8 px-3 rounded-[8px] text-[12px] font-semibold border cursor-pointer ${
                                            on
                                                ? 'bg-[#f59e0b] text-[#1c1917] border-[#f59e0b]'
                                                : 'bg-[#fff] text-[#57534e] border-[#e7e5e4]'
                                        }`}
                                    >
                                        {s.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Bulk Holiday Modal */}
            <Modal
                open={showBulkModal}
                onClose={() => setShowBulkModal(false)}
                title="Tambah hari libur massal"
                size="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowBulkModal(false)}>
                            Batal
                        </Button>
                        <Button variant="primary" loading={isSaving} onClick={handleBulkAdd}>
                            Simpan semua
                        </Button>
                    </>
                }
            >
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                    {bulkEntries.map((entry, idx) => (
                        <div key={entry.id} className="p-3 rounded-[12px] bg-[#fafaf9] border border-[#e7e5e4] space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[12.5px] font-bold text-[#1c1917]">Entri #{idx + 1}</span>
                                {bulkEntries.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setBulkEntries((prev) => prev.filter((e) => e.id !== entry.id))
                                        }
                                        className="text-[12px] text-[#b91c1c] bg-transparent border-0 cursor-pointer"
                                    >
                                        Hapus baris
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <Field label="Dari tanggal" required>
                                    <Input
                                        type="date"
                                        value={entry.startDate}
                                        onChange={(e) =>
                                            setBulkEntries((prev) =>
                                                prev.map((x) =>
                                                    x.id === entry.id ? { ...x, startDate: e.target.value } : x
                                                )
                                            )
                                        }
                                    />
                                </Field>
                                <Field label="Sampai tanggal" required>
                                    <Input
                                        type="date"
                                        value={entry.endDate}
                                        onChange={(e) =>
                                            setBulkEntries((prev) =>
                                                prev.map((x) =>
                                                    x.id === entry.id ? { ...x, endDate: e.target.value } : x
                                                )
                                            )
                                        }
                                    />
                                </Field>
                                <Field label="Nama libur" required>
                                    <Input
                                        value={entry.name}
                                        onChange={(e) =>
                                            setBulkEntries((prev) =>
                                                prev.map((x) => (x.id === entry.id ? { ...x, name: e.target.value } : x))
                                            )
                                        }
                                        placeholder="Cuti Bersama"
                                    />
                                </Field>
                            </div>
                            <label className="flex items-center gap-2 text-[12.5px] font-medium text-[#1c1917] cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={entry.isFullday}
                                    onChange={(e) =>
                                        setBulkEntries((prev) =>
                                            prev.map((x) =>
                                                x.id === entry.id ? { ...x, isFullday: e.target.checked } : x
                                            )
                                        )
                                    }
                                />
                                Seharian (semua shift)
                            </label>
                            {!entry.isFullday && (
                                <div className="flex flex-wrap gap-1.5">
                                    {shifts.map((s) => {
                                        const on = entry.shiftIds.includes(s.id);
                                        return (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() =>
                                                    setBulkEntries((prev) =>
                                                        prev.map((x) =>
                                                            x.id === entry.id
                                                                ? {
                                                                      ...x,
                                                                      shiftIds: on
                                                                          ? x.shiftIds.filter((i) => i !== s.id)
                                                                          : [...x.shiftIds, s.id],
                                                                  }
                                                                : x
                                                        )
                                                    )
                                                }
                                                className={`h-7 px-2.5 rounded-[7px] text-[11.5px] font-semibold border cursor-pointer ${
                                                    on
                                                        ? 'bg-[#f59e0b] text-[#1c1917] border-[#f59e0b]'
                                                        : 'bg-[#fff] text-[#57534e] border-[#e7e5e4]'
                                                }`}
                                            >
                                                {s.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                            setBulkEntries((prev) => [
                                ...prev,
                                {
                                    id: String(Date.now()),
                                    startDate: '',
                                    endDate: '',
                                    name: '',
                                    description: '',
                                    shiftIds: [],
                                    isFullday: true,
                                },
                            ])
                        }
                        leftIcon={<Plus className="w-3.5 h-3.5" />}
                    >
                        Tambah baris tanggal
                    </Button>
                </div>
            </Modal>
        </div>
    );
}
