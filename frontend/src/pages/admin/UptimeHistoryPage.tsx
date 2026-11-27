import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, AlertTriangle, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { getLocalDateString, addDays } from '../../utils/dateHelpers';
import {
    PageHeader,
    Button,
    Card,
    StatTile,
    ProgressBar,
    Badge,
    SegmentedControl,
    Skeleton,
    SkeletonCard,
} from '../../components/ui';

interface DailyStat {
    date: string;
    dayName: string;
    uptimeMs: number;
    downtimeMs: number;
    restarts: number;
    uptimePercent: number;
}

interface UptimeSummary {
    totalUptimeMs: number;
    totalDowntimeMs: number;
    totalRestarts: number;
    uptimePercent: number;
    daysInRange: number;
}

interface DowntimePeriod {
    startTime: string;
    endTime: string | null;
    durationMs: number;
}

interface RestartEvent {
    id: string;
    timestamp: string;
    notes: string | null;
    hostname: string | null;
    restartType: 'update' | 'normal';
    restartLabel: string;
}

interface PM2Process {
    name: string;
    id: number;
    mode: string;
    status: string;
    uptime: number;
    restarts: number;
    memoryMB: number;
    cpu: number;
}

interface PM2Status {
    enabled: boolean;
    mode: 'cluster' | 'fork' | 'standalone';
    instances?: number;
    totalMemoryMB?: number;
    avgCpu?: number;
    message?: string;
    processes: PM2Process[];
}

function formatDuration(ms: number): string {
    if (ms <= 0) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}h ${hours % 24}j ${minutes % 60}m`;
    if (hours > 0) return `${hours}j ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function formatDateTime(isoString: string): string {
    return new Date(isoString).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function uptimeBarColor(pct: number): string {
    if (pct >= 99) return '#16a34a';
    if (pct >= 95) return '#f59e0b';
    return '#dc2626';
}

export default function UptimeHistoryPage() {
    const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
    const [summary, setSummary] = useState<UptimeSummary | null>(null);
    const [downtimePeriods, setDowntimePeriods] = useState<DowntimePeriod[]>([]);
    const [restartEvents, setRestartEvents] = useState<RestartEvent[]>([]);
    const [pm2Status, setPm2Status] = useState<PM2Status | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const today = getLocalDateString();
    const [startDate, setStartDate] = useState(() => addDays(today, -6));
    const [endDate, setEndDate] = useState(today);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchData = useCallback(
        async (showLoading = true) => {
            if (showLoading) setIsLoading(true);
            setIsRefreshing(!showLoading);
            try {
                const params = new URLSearchParams({ startDate, endDate });
                const [statsRes, summaryRes] = await Promise.all([
                    api.get(`/api/server/uptime/daily-stats?${params}`),
                    api.get(`/api/server/uptime/summary?${params}`),
                ]);
                setDailyStats(statsRes.data.dailyStats || []);
                setSummary(summaryRes.data.summary || null);
                setDowntimePeriods(summaryRes.data.downtimePeriods || []);

                try {
                    const restartsRes = await api.get(`/api/server/uptime/restarts?${params}`);
                    setRestartEvents(restartsRes.data.restarts || []);
                } catch {
                    /* optional */
                }

                try {
                    const pm2Res = await api.get('/api/server/pm2-status');
                    setPm2Status(pm2Res.data);
                } catch {
                    /* optional */
                }
            } catch {
                toast.error('Gagal memuat data uptime');
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [startDate, endDate]
    );

    useEffect(() => {
        fetchData();
        if (!autoRefresh) return;
        const interval = setInterval(() => fetchData(false), 5000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchData]);

    const handleExport = async () => {
        try {
            const params = new URLSearchParams({ startDate, endDate });
            const response = await api.get(`/api/server/uptime/export?${params}`, {
                responseType: 'blob',
            });
            const url = URL.createObjectURL(new Blob([response.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `Uptime_History_${startDate}_${endDate}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Ekspor berhasil');
        } catch {
            toast.error('Gagal mengekspor data');
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-56" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Riwayat uptime"
                subtitle="Ketersediaan server, proses PM2, dan catatan restart"
                actions={
                    <>
                        <SegmentedControl
                            ariaLabel="Mode refresh uptime"
                            layoutId="uptime-refresh"
                            value={autoRefresh ? 'auto' : 'manual'}
                            onChange={(v) => setAutoRefresh(v === 'auto')}
                            options={[
                                { value: 'auto', label: 'Otomatis' },
                                { value: 'manual', label: 'Manual' },
                            ]}
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            loading={isRefreshing}
                            onClick={() => fetchData(false)}
                            leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Muat ulang
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleExport}
                            leftIcon={<Download className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Ekspor Excel
                        </Button>
                    </>
                }
            />

            <Card padding="sm">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[12.5px] font-semibold text-[#57534e]">Rentang tanggal:</span>
                    <input
                        type="date"
                        aria-label="Tanggal mulai"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    />
                    <span className="text-[#a8a29e]">–</span>
                    <input
                        type="date"
                        aria-label="Tanggal selesai"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    />
                </div>
            </Card>

            {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatTile
                        label="Total uptime"
                        value={formatDuration(summary.totalUptimeMs)}
                        color="#16a34a"
                        valueColor="#15803d"
                    />
                    <StatTile
                        label="Total downtime"
                        value={formatDuration(summary.totalDowntimeMs)}
                        color="#dc2626"
                        valueColor="#b91c1c"
                    />
                    <StatTile
                        label="Uptime (%)"
                        value={`${summary.uptimePercent.toFixed(2)}%`}
                        color={uptimeBarColor(summary.uptimePercent)}
                    />
                    <StatTile
                        label="Total restart"
                        value={summary.totalRestarts}
                        color="#f59e0b"
                        valueColor="#b45309"
                    />
                </div>
            )}

            {pm2Status && (
                <Card padding="none">
                    <div className="px-4 py-3.5 border-b border-[#f5f5f4] flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <h2 className="text-[15px] font-bold text-[#1c1917]">PM2 Process Manager</h2>
                            <Badge variant={pm2Status.enabled ? 'success' : 'neutral'} dot={pm2Status.enabled}>
                                {pm2Status.mode}
                            </Badge>
                        </div>
                        {pm2Status.enabled && (
                            <div className="text-[12px] text-[#57534e] tabular-nums">
                                {pm2Status.instances} instance · {pm2Status.totalMemoryMB} MB · CPU avg {pm2Status.avgCpu}%
                            </div>
                        )}
                    </div>

                    {pm2Status.enabled && pm2Status.processes.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                        <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                            ID
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                            Nama
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                            Status
                                        </th>
                                        <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                            Memori
                                        </th>
                                        <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                            CPU
                                        </th>
                                        <th className="text-right px-4 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                            Restart
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#f5f5f4]">
                                    {pm2Status.processes.map((proc) => (
                                        <tr key={proc.id} className="hover:bg-[#fafaf9]">
                                            <td className="px-4 py-2.5 font-mono text-[#57534e]">{proc.id}</td>
                                            <td className="px-3 py-2.5 font-semibold text-[#1c1917]">{proc.name}</td>
                                            <td className="px-3 py-2.5">
                                                <Badge
                                                    variant={
                                                        proc.status === 'online'
                                                            ? 'success'
                                                            : proc.status === 'stopping'
                                                                ? 'warning'
                                                                : 'danger'
                                                    }
                                                >
                                                    {proc.status}
                                                </Badge>
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-[#57534e]">
                                                {proc.memoryMB} MB
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-[#57534e]">
                                                {proc.cpu}%
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-[#57534e]">
                                                {proc.restarts}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-4 text-[13px] text-[#78716c]">
                            {pm2Status.message || 'PM2 tidak aktif. Server berjalan dalam mode standalone.'}
                        </div>
                    )}
                </Card>
            )}

            <Card padding="none">
                <div className="px-4 py-3.5 border-b border-[#f5f5f4]">
                    <h2 className="text-[15px] font-bold text-[#1c1917]">Rincian per hari</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                    Tanggal
                                </th>
                                <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                    Hari
                                </th>
                                <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                    Uptime
                                </th>
                                <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                    Downtime
                                </th>
                                <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                    Restart
                                </th>
                                <th className="text-right px-4 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                    Uptime %
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f5f5f4]">
                            {dailyStats.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-[#78716c]">
                                        Tidak ada data untuk rentang tanggal ini
                                    </td>
                                </tr>
                            ) : (
                                dailyStats.map((stat) => (
                                    <tr key={stat.date} className="hover:bg-[#fafaf9]">
                                        <td className="px-4 py-2.5 font-semibold text-[#1c1917] tabular-nums">
                                            {stat.date}
                                        </td>
                                        <td className="px-3 py-2.5 text-[#57534e]">{stat.dayName}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-[#15803d] font-medium">
                                            {formatDuration(stat.uptimeMs)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-[#b91c1c] font-medium">
                                            {formatDuration(stat.downtimeMs)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-[#57534e]">
                                            {stat.restarts}
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <div className="inline-flex items-center gap-2">
                                                <div className="w-16">
                                                    <ProgressBar
                                                        value={stat.uptimePercent}
                                                        max={100}
                                                        color={uptimeBarColor(stat.uptimePercent)}
                                                        height="sm"
                                                    />
                                                </div>
                                                <span className="font-semibold tabular-nums text-[#1c1917]">
                                                    {stat.uptimePercent.toFixed(1)}%
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {downtimePeriods.length > 0 && (
                <Card padding="none">
                    <div className="px-4 py-3.5 border-b border-[#f5f5f4] flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#b91c1c]" aria-hidden="true" />
                        <h2 className="text-[15px] font-bold text-[#1c1917]">Periode downtime</h2>
                    </div>
                    <div className="divide-y divide-[#f5f5f4]">
                        {downtimePeriods.map((p, idx) => (
                            <div
                                key={idx}
                                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[13px]"
                            >
                                <div>
                                    <span className="text-[#78716c]">Mulai: </span>
                                    <b className="text-[#1c1917]">{formatDateTime(p.startTime)}</b>
                                </div>
                                <div>
                                    <span className="text-[#78716c]">Selesai: </span>
                                    <b className="text-[#1c1917]">
                                        {p.endTime ? formatDateTime(p.endTime) : 'Masih berlangsung'}
                                    </b>
                                </div>
                                <div className="font-bold text-[#b91c1c] tabular-nums">
                                    {formatDuration(p.durationMs)}
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {restartEvents.length > 0 && (
                <Card padding="none">
                    <div className="px-4 py-3.5 border-b border-[#f5f5f4] flex items-center gap-2">
                        <RotateCcw className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
                        <h2 className="text-[15px] font-bold text-[#1c1917]">Riwayat restart</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                    <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                        Waktu
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                        Tipe
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                        Keterangan
                                    </th>
                                    <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase text-[#78716c]">
                                        Host
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#f5f5f4]">
                                {restartEvents.map((ev) => (
                                    <tr key={ev.id} className="hover:bg-[#fafaf9]">
                                        <td className="px-4 py-2.5 font-medium text-[#1c1917] whitespace-nowrap">
                                            {formatDateTime(ev.timestamp)}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <Badge variant={ev.restartType === 'update' ? 'info' : 'neutral'}>
                                                {ev.restartType === 'update' ? 'Update' : 'Normal'}
                                            </Badge>
                                        </td>
                                        <td className="px-3 py-2.5 text-[#57534e]">{ev.notes || '-'}</td>
                                        <td className="px-4 py-2.5 font-mono text-[12px] text-[#78716c]">
                                            {ev.hostname || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}
