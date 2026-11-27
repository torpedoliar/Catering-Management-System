import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, ORDER_EVENTS } from '../../contexts/SSEContext';
import { getLocalDateString, formatOrderDate } from '../../utils/dateHelpers';
import { Button, Card, PageHeader, StatTile, Tabs, Badge, SkeletonCard } from '../../components/ui';

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    mealPrice: number;
    breakStartTime?: string | null;
    breakEndTime?: string | null;
}

interface ShiftGroup {
    key: string;
    label: string;
    shifts: Shift[];
    shiftIds: string[];
    isGrouped: boolean;
}

const groupShiftsByBreakTime = (shifts: Shift[]): ShiftGroup[] => {
    const groups: Map<string, Shift[]> = new Map();
    shifts.forEach((shift) => {
        const key =
            shift.breakStartTime && shift.breakEndTime
                ? `${shift.breakStartTime}–${shift.breakEndTime}`
                : `_shift_${shift.id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(shift);
    });
    return Array.from(groups.entries())
        .map(([key, list]) => ({
            key,
            label: key.startsWith('_shift_') ? list[0].name : key,
            shifts: list,
            shiftIds: list.map((s) => s.id),
            isGrouped: !key.startsWith('_shift_'),
        }))
        .sort((a, b) => a.shifts[0].startTime.localeCompare(b.shifts[0].startTime));
};

interface Canteen {
    id: string;
    name: string;
    location: string | null;
}

interface DayData {
    date: string;
    dayName: string;
    dayOfWeek: number;
    isHoliday: boolean;
    holidayName: string | null;
    isPast: boolean;
    byShift: Record<string, { ordered: number; pickedUp: number; noShow: number; cancelled: number }>;
    byCanteen: Record<string, { ordered: number; location: string | null }>;
    byCanteenShift: Record<string, Record<string, number>>;
    total: number;
}

interface WeeklyData {
    week: number;
    year: number;
    weekStart: string;
    weekEnd: string;
    shifts: Shift[];
    canteens: Canteen[];
    dailyData: DayData[];
    summary: {
        totalOrders: number;
        totalPickedUp: number;
        totalNoShow: number;
        totalCancelled: number;
        totalCost: number;
        avgPerDay: number;
    };
}

interface AvailableWeek {
    week: number;
    year: number;
    label: string;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

function formatShortDate(dateStr: string): string {
    const key = formatOrderDate(dateStr);
    const [, m, d] = key.split('-').map(Number);
    if (!m || !d) return key;
    return `${d} ${MONTH_SHORT[m - 1] || ''}`;
}

export default function VendorDashboardPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<WeeklyData | null>(null);
    const [availableWeeks, setAvailableWeeks] = useState<AvailableWeek[]>([]);
    const [selectedWeek, setSelectedWeek] = useState<number>(0);
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [activeCanteenTab, setActiveCanteenTab] = useState<string>('all');

    const loadAvailableWeeks = useCallback(async () => {
        try {
            const res = await api.get('/api/vendor/available-weeks');
            setAvailableWeeks(res.data.weeks || []);
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
        if (selectedWeek) loadWeeklyData();
    }, [selectedWeek, selectedYear, loadWeeklyData]);

    useSSERefresh(ORDER_EVENTS, loadWeeklyData);

    const currentIdx = availableWeeks.findIndex(
        (w) => w.week === selectedWeek && w.year === selectedYear
    );
    const goPrevWeek = () => {
        if (currentIdx >= 0 && currentIdx < availableWeeks.length - 1) {
            const prev = availableWeeks[currentIdx + 1];
            setSelectedWeek(prev.week);
            setSelectedYear(prev.year);
        }
    };
    const goNextWeek = () => {
        if (currentIdx > 0) {
            const next = availableWeeks[currentIdx - 1];
            setSelectedWeek(next.week);
            setSelectedYear(next.year);
        }
    };

    const shiftGroups = useMemo(() => (data ? groupShiftsByBreakTime(data.shifts) : []), [data]);
    const todayKey = getLocalDateString();

    const exportToCsv = () => {
        if (!data) return;
        toast.loading('Menyiapkan ekspor…', { id: 'vendor-export' });
        try {
            let csv = `Rekap Mingguan - Minggu ${data.week} ${data.year}\n`;
            csv += `Periode: ${data.weekStart} s/d ${data.weekEnd}\n\n`;
            csv += 'Hari,Tanggal';
            shiftGroups.forEach((g) => {
                csv += `,${g.label}`;
            });
            csv += ',Total\n';
            data.dailyData.forEach((day) => {
                csv += `${day.dayName},${day.date}`;
                shiftGroups.forEach((g) => {
                    const tot = g.shiftIds.reduce((s, id) => s + (day.byShift[id]?.ordered || 0), 0);
                    csv += `,${tot}`;
                });
                csv += `,${day.total}\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `rekap-minggu-${data.week}-${data.year}.csv`;
            link.click();
            toast.success('Ekspor berhasil', { id: 'vendor-export' });
        } catch {
            toast.error('Ekspor gagal', { id: 'vendor-export' });
        }
    };

    if (isLoading && !data) {
        return (
            <div className="max-w-[1240px] space-y-4">
                <SkeletonCard lines={2} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                    <SkeletonCard lines={2} />
                    <SkeletonCard lines={2} />
                    <SkeletonCard lines={2} />
                    <SkeletonCard lines={2} />
                </div>
                <SkeletonCard lines={6} />
            </div>
        );
    }

    const canteenTabs = data
        ? [
              { id: 'all', label: 'Semua kantin', count: data.summary.totalOrders.toLocaleString('id-ID') },
              ...data.canteens.map((c) => {
                  const totalC = data.dailyData.reduce(
                      (sum, day) => sum + (day.byCanteen[c.id]?.ordered || 0),
                      0
                  );
                  return { id: c.id, label: c.name, count: totalC.toLocaleString('id-ID') };
              }),
          ]
        : [];

    const getCellCount = (day: DayData, group: ShiftGroup) => {
        if (activeCanteenTab === 'all') {
            return group.shiftIds.reduce((sum, id) => sum + (day.byShift[id]?.ordered || 0), 0);
        }
        return group.shiftIds.reduce(
            (sum, id) => sum + (day.byCanteenShift?.[activeCanteenTab]?.[id] || 0),
            0
        );
    };

    const getRowTotal = (day: DayData) => {
        if (activeCanteenTab === 'all') return day.total;
        return day.byCanteen[activeCanteenTab]?.ordered || 0;
    };

    const footerGroupTotals = shiftGroups.map((g) =>
        data ? data.dailyData.reduce((sum, day) => sum + getCellCount(day, g), 0) : 0
    );
    const footerGrandTotal = data ? data.dailyData.reduce((sum, day) => sum + getRowTotal(day), 0) : 0;

    return (
        <div className="max-w-[1240px] w-full flex flex-col gap-[18px]">
            <PageHeader
                title="Rekap order makanan"
                subtitle={
                    data
                        ? `Minggu ${data.week} · ${formatShortDate(data.weekStart)}–${formatShortDate(data.weekEnd)} ${data.year}`
                        : 'Data order makanan mingguan'
                }
                actions={
                    <>
                        <div className="inline-flex items-center border border-[#e7e5e4] bg-[#fff] rounded-[10px] h-[38px]">
                            <button
                                type="button"
                                aria-label="Minggu sebelumnya"
                                disabled={currentIdx < 0 || currentIdx >= availableWeeks.length - 1}
                                onClick={goPrevWeek}
                                className="w-[38px] h-9 border-0 bg-transparent cursor-pointer text-[16px] text-[#44403c] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#fafaf9] rounded-l-[10px]"
                            >
                                ‹
                            </button>
                            <select
                                aria-label="Pilih minggu"
                                value={`${selectedWeek}-${selectedYear}`}
                                onChange={(e) => {
                                    const [w, y] = e.target.value.split('-');
                                    setSelectedWeek(parseInt(w, 10));
                                    setSelectedYear(parseInt(y, 10));
                                }}
                                className="border-0 border-x border-[#f0efed] px-2.5 h-9 text-[13px] font-semibold text-[#1c1917] bg-transparent cursor-pointer focus:outline-none"
                            >
                                {availableWeeks.map((w) => (
                                    <option key={`${w.week}-${w.year}`} value={`${w.week}-${w.year}`}>
                                        {w.label}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                aria-label="Minggu berikutnya"
                                disabled={currentIdx <= 0}
                                onClick={goNextWeek}
                                className="w-[38px] h-9 border-0 bg-transparent cursor-pointer text-[16px] text-[#44403c] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#fafaf9] rounded-r-[10px]"
                            >
                                ›
                            </button>
                        </div>

                        <Button variant="primary" onClick={exportToCsv} disabled={!data}>
                            Ekspor Excel
                        </Button>
                    </>
                }
            />

            {data && (
                <>
                    <section aria-label="Ringkasan minggu" className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                        <StatTile label="Total order" value={data.summary.totalOrders} />
                        <StatTile label="Diambil" value={data.summary.totalPickedUp} valueColor="#15803d" />
                        <StatTile label="Tidak diambil" value={data.summary.totalNoShow} valueColor="#b91c1c" />
                        <StatTile label="Dibatalkan" value={data.summary.totalCancelled} valueColor="#57534e" />
                    </section>

                    <Card padding="none" className="overflow-hidden">
                        <div className="px-4">
                            <Tabs
                                ariaLabel="Kantin"
                                items={canteenTabs}
                                value={activeCanteenTab}
                                onChange={setActiveCanteenTab}
                                layoutId="vendor-canteen-tab"
                            />
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-[13.5px] min-w-[760px]">
                                <thead>
                                    <tr className="bg-[#fafaf9] text-[#57534e]">
                                        <th className="text-left px-4 py-3 font-semibold">Hari</th>
                                        {shiftGroups.map((g) => (
                                            <th key={g.key} className="text-right px-4 py-3 font-semibold">
                                                <div>{g.label}</div>
                                                {g.isGrouped && (
                                                    <div className="text-[11px] font-medium text-[#a8a29e]">
                                                        {g.shifts.map((s) => s.name).join(' · ')}
                                                    </div>
                                                )}
                                            </th>
                                        ))}
                                        <th className="text-right px-4 py-3 font-bold text-[#1c1917]">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.dailyData.map((day) => {
                                        const isToday = formatOrderDate(day.date) === todayKey;
                                        const rowTotal = getRowTotal(day);
                                        return (
                                            <tr
                                                key={day.date}
                                                className={`border-t border-[#f5f5f4] ${
                                                    isToday ? 'bg-[#fffbeb]' : day.isHoliday ? 'bg-[#fee2e2]/30' : ''
                                                }`}
                                            >
                                                <td className="px-4 py-[11px]">
                                                    <b className="text-[#1c1917]">{day.dayName}</b>{' '}
                                                    <span className="text-[#78716c]">{formatShortDate(day.date)}</span>
                                                    {isToday && (
                                                        <Badge variant="warning" className="ml-1.5">
                                                            Hari ini
                                                        </Badge>
                                                    )}
                                                    {day.isHoliday && day.holidayName && (
                                                        <Badge variant="danger" className="ml-1.5">
                                                            {day.holidayName}
                                                        </Badge>
                                                    )}
                                                </td>
                                                {shiftGroups.map((g) => {
                                                    const val = getCellCount(day, g);
                                                    return (
                                                        <td
                                                            key={g.key}
                                                            className="px-4 py-[11px] text-right tabular-nums text-[#1c1917]"
                                                        >
                                                            {val > 0 ? val.toLocaleString('id-ID') : '–'}
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-4 py-[11px] text-right font-extrabold tabular-nums text-[#1c1917]">
                                                    {rowTotal > 0 ? rowTotal.toLocaleString('id-ID') : '–'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-[#e7e5e4] bg-[#fafaf9] font-extrabold text-[#1c1917]">
                                        <td className="px-4 py-3">Total minggu</td>
                                        {footerGroupTotals.map((tot, idx) => (
                                            <td key={shiftGroups[idx]?.key || idx} className="px-4 py-3 text-right tabular-nums">
                                                {tot > 0 ? tot.toLocaleString('id-ID') : '–'}
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 text-right tabular-nums text-[#b45309]">
                                            {footerGrandTotal.toLocaleString('id-ID')}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <p className="m-0 px-4 py-2.5 text-[12px] text-[#78716c] border-t border-[#f0efed]">
                            Hari yang sudah lewat menampilkan jumlah yang benar-benar dimasak. Angka berubah sampai batas pesan tiap shift.
                        </p>
                    </Card>
                </>
            )}
        </div>
    );
}
