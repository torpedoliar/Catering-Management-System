import { useState, useEffect, useCallback } from 'react';
import { Clock, RefreshCw, ArrowUpCircle, ArrowDownCircle, Activity, Calendar, Timer, AlertTriangle, Download, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3012';

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

    if (days > 0) {
        return `${days}h ${hours % 24}j ${minutes % 60}m`;
    } else if (hours > 0) {
        return `${hours}j ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

function formatDateTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export default function UptimeHistoryPage() {
    const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
    const [summary, setSummary] = useState<UptimeSummary | null>(null);
    const [downtimePeriods, setDowntimePeriods] = useState<DowntimePeriod[]>([]);
    const [restartEvents, setRestartEvents] = useState<RestartEvent[]>([]);
    const [pm2Status, setPm2Status] = useState<PM2Status | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Date range - default last 7 days
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);

    const [startDate, setStartDate] = useState(sevenDaysAgo.toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const getToken = () => localStorage.getItem('token');

    const fetchData = useCallback(async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        setIsRefreshing(!showLoading);

        try {
            const token = getToken();
            const params = new URLSearchParams({ startDate, endDate });

            // Fetch daily stats
            const statsRes = await fetch(`${API_URL}/api/server/uptime/daily-stats?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!statsRes.ok) throw new Error('Failed to fetch stats');
            const statsData = await statsRes.json();
            setDailyStats(statsData.dailyStats || []);

            // Fetch summary
            const summaryRes = await fetch(`${API_URL}/api/server/uptime/summary?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!summaryRes.ok) throw new Error('Failed to fetch summary');
            const summaryData = await summaryRes.json();
            setSummary(summaryData.summary || null);
            setDowntimePeriods(summaryData.downtimePeriods || []);

            // Fetch restart events with notes
            const restartsRes = await fetch(`${API_URL}/api/server/uptime/restarts?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (restartsRes.ok) {
                const restartsData = await restartsRes.json();
                setRestartEvents(restartsData.restarts || []);
            }

            // Fetch PM2 status
            try {
                const pm2Res = await fetch(`${API_URL}/api/server/pm2-status`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (pm2Res.ok) {
                    const pm2Data = await pm2Res.json();
                    setPm2Status(pm2Data);
                }
            } catch (pm2Error) {
                console.log('PM2 status not available');
            }

        } catch (error) {
            console.error('Failed to fetch uptime data:', error);
            toast.error('Gagal memuat data uptime');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-refresh every 30 seconds when enabled
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchData(false);
        }, 30000);

        return () => clearInterval(interval);
    }, [autoRefresh, fetchData]);

    const handleExport = async () => {
        try {
            const token = getToken();
            const params = new URLSearchParams({ startDate, endDate });

            const response = await fetch(`${API_URL}/api/server/uptime/export?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Uptime_History_${startDate}_${endDate}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success('Export berhasil!');
        } catch (error) {
            console.error('Export failed:', error);
            toast.error('Gagal export data');
        }
    };

    const getUptimeColor = (percent: number) => {
        if (percent >= 99) return 'text-emerald-500';
        if (percent >= 95) return 'text-amber-500';
        return 'text-red-500';
    };

    const getUptimeBg = (percent: number) => {
        if (percent >= 99) return 'bg-emerald-500';
        if (percent >= 95) return 'bg-amber-500';
        return 'bg-red-500';
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-slate-500 mt-4">Memuat data uptime...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Clock className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-[#1a1f37]">Uptime History</h1>
                        <p className="text-slate-500">Riwayat uptime/downtime server</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleExport}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Export XLSX
                    </button>
                    <button
                        onClick={() => fetchData(false)}
                        disabled={isRefreshing}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${autoRefresh
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                        title={autoRefresh ? 'Auto-refresh aktif (30 detik)' : 'Auto-refresh nonaktif'}
                    >
                        <Timer className={`w-4 h-4 ${autoRefresh ? 'text-emerald-600' : 'text-slate-400'}`} />
                        {autoRefresh ? 'Auto' : 'Manual'}
                    </button>
                </div>
            </div>

            {/* Date Range Picker */}
            <div className="card p-4">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-sm text-slate-500 mb-2">
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
                    <div className="flex-1">
                        <label className="block text-sm text-slate-500 mb-2">
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
                        onClick={() => fetchData()}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
                    >
                        Terapkan
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Total Uptime */}
                    <div className="card p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                <ArrowUpCircle className="w-5 h-5 text-emerald-600" />
                            </div>
                            <span className="text-sm text-slate-500">Total Uptime</span>
                        </div>
                        <p className="text-2xl font-bold text-emerald-600">{formatDuration(summary.totalUptimeMs)}</p>
                    </div>

                    {/* Total Downtime */}
                    <div className="card p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                                <ArrowDownCircle className="w-5 h-5 text-red-600" />
                            </div>
                            <span className="text-sm text-slate-500">Total Downtime</span>
                        </div>
                        <p className="text-2xl font-bold text-red-600">{formatDuration(summary.totalDowntimeMs)}</p>
                    </div>

                    {/* Uptime Percentage */}
                    <div className="card p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                                <Activity className="w-5 h-5 text-indigo-600" />
                            </div>
                            <span className="text-sm text-slate-500">Uptime %</span>
                        </div>
                        <p className={`text-2xl font-bold ${getUptimeColor(summary.uptimePercent)}`}>
                            {summary.uptimePercent.toFixed(2)}%
                        </p>
                    </div>

                    {/* Restart Count */}
                    <div className="card p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                <Timer className="w-5 h-5 text-amber-600" />
                            </div>
                            <span className="text-sm text-slate-500">Total Restart</span>
                        </div>
                        <p className="text-2xl font-bold text-amber-600">{summary.totalRestarts}</p>
                    </div>
                </div>
            )}

            {/* PM2 Cluster Status */}
            {pm2Status && (
                <div className="card overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${pm2Status.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                            <h2 className="text-lg font-semibold text-[#1a1f37]">PM2 Process Manager</h2>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${pm2Status.mode === 'cluster' ? 'bg-purple-100 text-purple-800' :
                                pm2Status.mode === 'fork' ? 'bg-blue-100 text-blue-800' :
                                    'bg-slate-100 text-slate-700'
                                }`}>
                                {pm2Status.mode === 'cluster' ? '🚀 Cluster Mode' :
                                    pm2Status.mode === 'fork' ? '⚡ Fork Mode' :
                                        '📍 Standalone'}
                            </span>
                        </div>
                    </div>

                    {pm2Status.enabled && pm2Status.processes.length > 0 ? (
                        <>
                            {/* PM2 Summary Stats */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50/50">
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-purple-600">{pm2Status.instances}</p>
                                    <p className="text-xs text-slate-500">Instances</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-blue-600">{pm2Status.totalMemoryMB} MB</p>
                                    <p className="text-xs text-slate-500">Total Memory</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-emerald-600">{pm2Status.avgCpu}%</p>
                                    <p className="text-xs text-slate-500">Avg CPU</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-amber-600">
                                        {pm2Status.processes.reduce((sum, p) => sum + p.restarts, 0)}
                                    </p>
                                    <p className="text-xs text-slate-500">Total Restarts</p>
                                </div>
                            </div>

                            {/* PM2 Process Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">ID</th>
                                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
                                            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                                            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Memory</th>
                                            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">CPU</th>
                                            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Restarts</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {pm2Status.processes.map((proc) => (
                                            <tr key={proc.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 text-sm font-mono text-slate-600">{proc.id}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-[#1a1f37]">{proc.name}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${proc.status === 'online' ? 'bg-emerald-100 text-emerald-800' :
                                                        proc.status === 'stopping' ? 'bg-amber-100 text-amber-800' :
                                                            'bg-red-100 text-red-800'
                                                        }`}>
                                                        {proc.status === 'online' ? '🟢' : proc.status === 'stopping' ? '🟡' : '🔴'} {proc.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-right text-blue-600 font-medium">{proc.memoryMB} MB</td>
                                                <td className="px-4 py-3 text-sm text-right text-emerald-600 font-medium">{proc.cpu}%</td>
                                                <td className="px-4 py-3 text-center">
                                                    {proc.restarts > 0 && (
                                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-600 text-xs font-medium">
                                                            {proc.restarts}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="p-6 text-center text-slate-500">
                            <p>{pm2Status.message || 'PM2 tidak aktif. Menggunakan mode standalone (nodemon/node).'}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Daily Breakdown Table */}
            <div className="card overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                    <h2 className="text-lg font-semibold text-[#1a1f37]">Breakdown Per Hari</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Tanggal</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Hari</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Uptime</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Downtime</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Restart</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Uptime %</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {dailyStats.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                        Tidak ada data untuk rentang tanggal ini
                                    </td>
                                </tr>
                            ) : (
                                dailyStats.map((stat) => (
                                    <tr key={stat.date} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-sm font-medium text-[#1a1f37]">{stat.date}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{stat.dayName}</td>
                                        <td className="px-4 py-3 text-sm text-right text-emerald-600 font-medium">
                                            {formatDuration(stat.uptimeMs)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right text-red-500 font-medium">
                                            {formatDuration(stat.downtimeMs)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-center">
                                            {stat.restarts > 0 && (
                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-600 text-xs font-medium">
                                                    {stat.restarts}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${getUptimeBg(stat.uptimePercent)} transition-all duration-300`}
                                                        style={{ width: `${stat.uptimePercent}%` }}
                                                    />
                                                </div>
                                                <span className={`text-sm font-medium ${getUptimeColor(stat.uptimePercent)}`}>
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
            </div>

            {/* Downtime Periods */}
            {downtimePeriods.length > 0 && (
                <div className="card overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                        <h2 className="text-lg font-semibold text-[#1a1f37]">Periode Downtime</h2>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {downtimePeriods.map((period, index) => (
                            <div key={index} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                                <div className="flex-1">
                                    <p className="text-sm text-slate-500">Mulai:</p>
                                    <p className="font-medium text-[#1a1f37]">{formatDateTime(period.startTime)}</p>
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm text-slate-500">Selesai:</p>
                                    <p className="font-medium text-[#1a1f37]">
                                        {period.endTime ? formatDateTime(period.endTime) : <span className="text-red-500">Masih Down</span>}
                                    </p>
                                </div>
                                <div className="sm:text-right">
                                    <p className="text-sm text-slate-500">Durasi:</p>
                                    <p className="font-bold text-red-600">{formatDuration(period.durationMs)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Restart History with Type Badge */}
            {restartEvents.length > 0 && (
                <div className="card overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                        <RotateCcw className="w-5 h-5 text-amber-500" />
                        <h2 className="text-lg font-semibold text-[#1a1f37]">Riwayat Restart</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Waktu</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Tipe</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Keterangan</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Host</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {restartEvents.map((event) => (
                                    <tr key={event.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-sm font-medium text-[#1a1f37]">
                                            {formatDateTime(event.timestamp)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${event.restartType === 'update'
                                                ? 'bg-blue-100 text-blue-800'
                                                : 'bg-slate-100 text-slate-700'
                                                }`}>
                                                {event.restartType === 'update' ? '🔄 Update' : '⚡ Normal'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">
                                            {event.notes || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-500 font-mono">
                                            {event.hostname || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
