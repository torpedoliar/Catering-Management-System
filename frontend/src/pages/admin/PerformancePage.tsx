import { useState, useEffect, useCallback } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    StatTile,
    ProgressBar,
    SegmentedControl,
    Skeleton,
    SkeletonCard,
} from '../../components/ui';

interface SystemMetrics {
    cpu: { usage: number; cores: number; model: string };
    memory: { total: number; used: number; free: number; usagePercent: number };
    disk: { total: number; used: number; free: number; usagePercent: number };
    uptime: { system: number; process: number };
    nodejs: {
        version: string;
        memoryUsage: { heapUsed: number; heapTotal: number; rss: number; external: number };
    };
    database: { connected: boolean; tableCount: number; totalRecords: number };
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}h ${hours}j ${mins}m`;
    if (hours > 0) return `${hours}j ${mins}m`;
    return `${mins}m`;
}

function barColor(percent: number): string {
    if (percent >= 90) return '#dc2626';
    if (percent >= 70) return '#f59e0b';
    return '#16a34a';
}

export default function PerformancePage() {
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchMetrics = useCallback(async (showSpinner = true) => {
        if (showSpinner) setRefreshing(true);
        try {
            const response = await api.get('/api/server/performance');
            setMetrics(response.data);
        } catch {
            toast.error('Gagal mengambil data performa');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchMetrics(false);
        if (!autoRefresh) return;
        const id = setInterval(() => fetchMetrics(false), 5000);
        return () => clearInterval(id);
    }, [autoRefresh, fetchMetrics]);

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-56" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Performa server"
                subtitle="Pemantauan CPU, memori, penyimpanan, runtime Node.js, dan database"
                actions={
                    <>
                        <SegmentedControl
                            ariaLabel="Mode refresh performa"
                            layoutId="perf-refresh"
                            value={autoRefresh ? 'auto' : 'manual'}
                            onChange={(v) => setAutoRefresh(v === 'auto')}
                            options={[
                                { value: 'auto', label: 'Otomatis (5d)' },
                                { value: 'manual', label: 'Manual' },
                            ]}
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            loading={refreshing}
                            onClick={() => fetchMetrics(true)}
                            leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Muat ulang
                        </Button>
                    </>
                }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Card>
                    <div className="text-[12px] font-semibold text-[#78716c]">CPU Usage</div>
                    <div className="text-[26px] font-extrabold text-[#1c1917] tabular-nums my-1">
                        {(metrics?.cpu.usage || 0).toFixed(1)}%
                    </div>
                    <ProgressBar
                        value={metrics?.cpu.usage || 0}
                        max={100}
                        color={barColor(metrics?.cpu.usage || 0)}
                    />
                    <div className="text-[12px] text-[#78716c] mt-2">{metrics?.cpu.cores || 0} core</div>
                </Card>

                <Card>
                    <div className="text-[12px] font-semibold text-[#78716c]">Memory Usage</div>
                    <div className="text-[26px] font-extrabold text-[#1c1917] tabular-nums my-1">
                        {(metrics?.memory.usagePercent || 0).toFixed(1)}%
                    </div>
                    <ProgressBar
                        value={metrics?.memory.usagePercent || 0}
                        max={100}
                        color={barColor(metrics?.memory.usagePercent || 0)}
                    />
                    <div className="text-[12px] text-[#78716c] mt-2">
                        {formatBytes(metrics?.memory.used || 0)} / {formatBytes(metrics?.memory.total || 0)}
                    </div>
                </Card>

                <Card>
                    <div className="text-[12px] font-semibold text-[#78716c]">Disk Usage</div>
                    <div className="text-[26px] font-extrabold text-[#1c1917] tabular-nums my-1">
                        {(metrics?.disk.usagePercent || 0).toFixed(1)}%
                    </div>
                    <ProgressBar
                        value={metrics?.disk.usagePercent || 0}
                        max={100}
                        color={barColor(metrics?.disk.usagePercent || 0)}
                    />
                    <div className="text-[12px] text-[#78716c] mt-2">
                        {formatBytes(metrics?.disk.used || 0)} / {formatBytes(metrics?.disk.total || 0)}
                    </div>
                </Card>

                <StatTile
                    label="System Uptime"
                    value={formatUptime(metrics?.uptime.system || 0)}
                    color="#16a34a"
                    valueColor="#15803d"
                    sub={`Proses: ${formatUptime(metrics?.uptime.process || 0)} · Node ${metrics?.nodejs.version || '-'}`}
                />
            </div>

            <Card>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-[#2563eb]" aria-hidden="true" />
                        <h2 className="text-[15px] font-bold text-[#1c1917]">Status database</h2>
                    </div>
                    <Badge variant={metrics?.database.connected ? 'success' : 'danger'} dot>
                        {metrics?.database.connected ? 'Terhubung' : 'Terputus'}
                    </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                        <div className="text-[11.5px] font-semibold uppercase text-[#78716c]">Status koneksi</div>
                        <div className="text-[15px] font-bold text-[#1c1917] mt-1">
                            {metrics?.database.connected ? 'PostgreSQL Aktif' : 'Offline'}
                        </div>
                    </div>
                    <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                        <div className="text-[11.5px] font-semibold uppercase text-[#78716c]">Jumlah tabel</div>
                        <div className="text-[22px] font-extrabold text-[#1c1917] tabular-nums mt-0.5">
                            {metrics?.database.tableCount || 0}
                        </div>
                    </div>
                    <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                        <div className="text-[11.5px] font-semibold uppercase text-[#78716c]">Total baris</div>
                        <div className="text-[22px] font-extrabold text-[#1c1917] tabular-nums mt-0.5">
                            {(metrics?.database.totalRecords || 0).toLocaleString('id-ID')}
                        </div>
                    </div>
                </div>
            </Card>

            <Card>
                <h2 className="text-[15px] font-bold text-[#1c1917] mb-3">Memori runtime Node.js</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: 'Heap Used', val: metrics?.nodejs.memoryUsage.heapUsed || 0 },
                        { label: 'Heap Total', val: metrics?.nodejs.memoryUsage.heapTotal || 0 },
                        { label: 'RSS', val: metrics?.nodejs.memoryUsage.rss || 0 },
                        { label: 'External', val: metrics?.nodejs.memoryUsage.external || 0 },
                    ].map((m) => (
                        <div key={m.label} className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                            <div className="text-[11.5px] font-semibold uppercase text-[#78716c]">{m.label}</div>
                            <div className="text-[18px] font-extrabold text-[#1c1917] tabular-nums mt-0.5">
                                {formatBytes(m.val)}
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}
