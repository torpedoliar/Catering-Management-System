import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, ORDER_EVENTS } from '../../contexts/SSEContext';
import { getLocalDateString, formatOrderDate } from '../../utils/dateHelpers';
import {
    Button,
    Card,
    PageHeader,
    StatTile,
    ProgressBar,
    Badge,
    Input,
    EmptyState,
    SkeletonCard,
} from '../../components/ui';

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
    breakStartTime?: string | null;
    breakEndTime?: string | null;
    status: 'completed' | 'in_progress' | 'upcoming';
    stats: ShiftStats;
}

interface ShiftGroup {
    key: string;
    label: string;
    shifts: ShiftData[];
    isGrouped: boolean;
    combinedStats: ShiftStats;
    worstStatus: ShiftData['status'];
}

const groupShiftsByBreakTime = (shifts: ShiftData[]): ShiftGroup[] => {
    const groups: Map<string, ShiftData[]> = new Map();
    shifts.forEach((shift) => {
        const key =
            shift.breakStartTime && shift.breakEndTime
                ? `${shift.breakStartTime}–${shift.breakEndTime}`
                : `_shift_${shift.shiftId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(shift);
    });

    return Array.from(groups.entries())
        .map(([key, list]) => {
            const combinedStats: ShiftStats = {
                ordered: list.reduce((sum, s) => sum + s.stats.ordered, 0),
                pickedUp: list.reduce((sum, s) => sum + s.stats.pickedUp, 0),
                noShow: list.reduce((sum, s) => sum + s.stats.noShow, 0),
                cancelled: list.reduce((sum, s) => sum + s.stats.cancelled, 0),
                pickupRate: 0,
            };
            combinedStats.pickupRate =
                combinedStats.ordered > 0
                    ? Math.round((combinedStats.pickedUp / combinedStats.ordered) * 10000) / 100
                    : 0;

            const statusPriority = { in_progress: 0, upcoming: 1, completed: 2 };
            const worstStatus = list.reduce(
                (worst, s) => (statusPriority[s.status] < statusPriority[worst] ? s.status : worst),
                'completed' as ShiftData['status']
            );

            return {
                key,
                label: key.startsWith('_shift_') ? list[0].shiftName : key,
                shifts: list,
                isGrouped: !key.startsWith('_shift_'),
                combinedStats,
                worstStatus,
            };
        })
        .sort((a, b) => a.shifts[0].startTime.localeCompare(b.shifts[0].startTime));
};

interface PickupStatsData {
    dates: Array<{ date: string; dayName: string; shifts: ShiftData[] }>;
    summary: {
        totalOrdered: number;
        totalPickedUp: number;
        totalNoShow: number;
        totalCancelled: number;
        overallPickupRate: number;
    };
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
function formatShort(dateStr: string): string {
    const key = formatOrderDate(dateStr);
    const [y, m, d] = key.split('-').map(Number);
    if (!y || !m || !d) return key;
    return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

export default function VendorPickupStatsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<PickupStatsData | null>(null);
    const [startDate, setStartDate] = useState(() => getLocalDateString());
    const [endDate, setEndDate] = useState(() => getLocalDateString());

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

    useSSERefresh(ORDER_EVENTS, loadData);

    return (
        <div className="max-w-[1240px] w-full space-y-[18px]">
            <PageHeader
                title="Statistik pengambilan"
                subtitle="Pemantauan pengambilan makanan per jam istirahat"
                actions={
                    <Button
                        variant="secondary"
                        onClick={loadData}
                        disabled={isLoading}
                        leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />}
                    >
                        Segarkan
                    </Button>
                }
            />

            <Card>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[180px]">
                        <Input
                            label="Tanggal mulai"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 min-w-[180px]">
                        <Input
                            label="Tanggal akhir"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <Button variant="primary" onClick={loadData} disabled={isLoading}>
                        Terapkan
                    </Button>
                </div>
            </Card>

            {isLoading && !data ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                    <SkeletonCard lines={2} />
                    <SkeletonCard lines={2} />
                    <SkeletonCard lines={2} />
                    <SkeletonCard lines={2} />
                </div>
            ) : data ? (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                        <StatTile label="Total dipesan" value={data.summary.totalOrdered} color="#f59e0b" />
                        <StatTile
                            label="Diambil"
                            value={data.summary.totalPickedUp}
                            valueColor="#15803d"
                            color="#16a34a"
                        />
                        <StatTile
                            label="Tidak diambil"
                            value={data.summary.totalNoShow}
                            valueColor="#b91c1c"
                            color="#dc2626"
                        />
                        <StatTile
                            label="Tingkat pengambilan"
                            value={`${data.summary.overallPickupRate}%`}
                            valueColor="#b45309"
                            color="#f59e0b"
                        />
                    </div>

                    {data.dates.length === 0 ? (
                        <Card>
                            <EmptyState
                                title="Tidak ada data pengambilan"
                                description="Coba ubah rentang tanggal di atas."
                            />
                        </Card>
                    ) : (
                        data.dates.map((dateData) => {
                            const shiftGroups = groupShiftsByBreakTime(dateData.shifts);
                            return (
                                <Card key={dateData.date}>
                                    <h2 className="m-0 mb-3.5 text-[16px] font-bold text-[#1c1917]">
                                        {dateData.dayName}, {formatShort(dateData.date)}
                                    </h2>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                                        {shiftGroups.map((group) => {
                                            const statusLabel =
                                                group.worstStatus === 'completed'
                                                    ? 'Selesai'
                                                    : group.worstStatus === 'in_progress'
                                                        ? 'Berjalan'
                                                        : 'Akan datang';
                                            const variant =
                                                group.worstStatus === 'completed'
                                                    ? 'success'
                                                    : group.worstStatus === 'in_progress'
                                                        ? 'warning'
                                                        : 'neutral';
                                            return (
                                                <div
                                                    key={group.key}
                                                    className="border border-[#f0efed] rounded-[12px] p-4 space-y-3"
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <div className="font-bold text-[15px] text-[#1c1917]">
                                                                {group.label}
                                                            </div>
                                                            <div className="text-[12px] text-[#78716c] mt-0.5">
                                                                {group.isGrouped
                                                                    ? group.shifts.map((s) => s.shiftName).join(', ')
                                                                    : `${group.shifts[0].startTime}–${group.shifts[0].endTime}`}
                                                            </div>
                                                        </div>
                                                        <Badge variant={variant}>{statusLabel}</Badge>
                                                    </div>

                                                    <div className="flex items-baseline gap-1.5">
                                                        <span className="text-[26px] font-extrabold tabular-nums text-[#1c1917]">
                                                            {group.combinedStats.pickedUp.toLocaleString('id-ID')}
                                                        </span>
                                                        <span className="text-[13px] text-[#78716c]">
                                                            dari {group.combinedStats.ordered.toLocaleString('id-ID')} diambil
                                                        </span>
                                                    </div>

                                                    <ProgressBar
                                                        value={group.combinedStats.pickupRate}
                                                        color={
                                                            group.combinedStats.pickupRate >= 85
                                                                ? '#16a34a'
                                                                : group.combinedStats.pickupRate >= 50
                                                                    ? '#f59e0b'
                                                                    : '#dc2626'
                                                        }
                                                    />

                                                    <div className="flex justify-between text-[12px] text-[#78716c] tabular-nums">
                                                        <span>Tingkat: {group.combinedStats.pickupRate}%</span>
                                                        {group.worstStatus !== 'upcoming' && (
                                                            <span>Tidak diambil: {group.combinedStats.noShow}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </Card>
                            );
                        })
                    )}
                </>
            ) : null}
        </div>
    );
}
