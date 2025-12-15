import { useState, useEffect } from 'react';
import { Activity, Database, HardDrive, Clock, Cpu, MemoryStick, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3012';

interface SystemMetrics {
    cpu: { usage: number; cores: number; model: string };
    memory: { total: number; used: number; free: number; usagePercent: number };
    disk: { total: number; used: number; free: number; usagePercent: number };
    uptime: { system: number; process: number };
    nodejs: { version: string; memoryUsage: NodeJS.MemoryUsage };
    database: { connected: boolean; tableCount: number; totalRecords: number };
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

export default function PerformancePage() {
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const getToken = () => localStorage.getItem('token');

    const fetchMetrics = async (showLoading = true) => {
        if (showLoading) setRefreshing(true);
        try {
            const response = await fetch(`${API_URL}/api/server/performance`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });

            if (response.ok) {
                const data = await response.json();
                setMetrics(data);
            } else {
                toast.error('Gagal mengambil data performa');
            }
        } catch (error) {
            console.error('Error fetching metrics:', error);
            toast.error('Gagal terhubung ke server');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchMetrics();

        let interval: NodeJS.Timeout;
        if (autoRefresh) {
            interval = setInterval(() => fetchMetrics(false), 5000);
        }
        return () => clearInterval(interval);
    }, [autoRefresh]);

    const getUsageColor = (percent: number) => {
        if (percent >= 90) return 'text-red-400';
        if (percent >= 70) return 'text-yellow-400';
        return 'text-green-400';
    };

    const getUsageGradient = (percent: number) => {
        if (percent >= 90) return 'from-red-500 to-red-700';
        if (percent >= 70) return 'from-yellow-500 to-orange-600';
        return 'from-emerald-500 to-teal-600';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-100">Server Performance</h1>
                        <p className="text-sm text-slate-400">Real-time system monitoring</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-400">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            className="rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                        />
                        Auto-refresh (5s)
                    </label>
                    <button
                        onClick={() => fetchMetrics()}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Main Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* CPU */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <Cpu className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">CPU Usage</p>
                            <p className={`text-2xl font-bold ${getUsageColor(metrics?.cpu.usage || 0)}`}>
                                {metrics?.cpu.usage.toFixed(1)}%
                            </p>
                        </div>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                            className={`h-2 rounded-full bg-gradient-to-r ${getUsageGradient(metrics?.cpu.usage || 0)}`}
                            style={{ width: `${Math.min(metrics?.cpu.usage || 0, 100)}%` }}
                        />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">{metrics?.cpu.cores} cores</p>
                </div>

                {/* Memory */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                            <MemoryStick className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Memory Usage</p>
                            <p className={`text-2xl font-bold ${getUsageColor(metrics?.memory.usagePercent || 0)}`}>
                                {metrics?.memory.usagePercent.toFixed(1)}%
                            </p>
                        </div>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                            className={`h-2 rounded-full bg-gradient-to-r ${getUsageGradient(metrics?.memory.usagePercent || 0)}`}
                            style={{ width: `${Math.min(metrics?.memory.usagePercent || 0, 100)}%` }}
                        />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                        {formatBytes(metrics?.memory.used || 0)} / {formatBytes(metrics?.memory.total || 0)}
                    </p>
                </div>

                {/* Disk */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                            <HardDrive className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Disk Usage</p>
                            <p className={`text-2xl font-bold ${getUsageColor(metrics?.disk.usagePercent || 0)}`}>
                                {metrics?.disk.usagePercent.toFixed(1)}%
                            </p>
                        </div>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                            className={`h-2 rounded-full bg-gradient-to-r ${getUsageGradient(metrics?.disk.usagePercent || 0)}`}
                            style={{ width: `${Math.min(metrics?.disk.usagePercent || 0, 100)}%` }}
                        />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                        {formatBytes(metrics?.disk.used || 0)} / {formatBytes(metrics?.disk.total || 0)}
                    </p>
                </div>

                {/* Uptime */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">System Uptime</p>
                            <p className="text-2xl font-bold text-emerald-400">
                                {formatUptime(metrics?.uptime.system || 0)}
                            </p>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">
                        Process: {formatUptime(metrics?.uptime.process || 0)}
                    </p>
                    <p className="text-xs text-slate-500">
                        Node.js {metrics?.nodejs.version}
                    </p>
                </div>
            </div>

            {/* Database Stats */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                        <Database className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-100">Database Status</h2>
                        <p className="text-sm text-slate-400">PostgreSQL connection info</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                    <div className="text-center p-4 bg-slate-900/50 rounded-lg">
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${metrics?.database.connected
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}>
                            <span className={`w-2 h-2 rounded-full mr-2 ${metrics?.database.connected ? 'bg-green-400' : 'bg-red-400'
                                }`} />
                            {metrics?.database.connected ? 'Connected' : 'Disconnected'}
                        </div>
                        <p className="text-xs text-slate-500 mt-2">Connection Status</p>
                    </div>

                    <div className="text-center p-4 bg-slate-900/50 rounded-lg">
                        <p className="text-3xl font-bold text-cyan-400">{metrics?.database.tableCount}</p>
                        <p className="text-xs text-slate-500 mt-1">Database Tables</p>
                    </div>

                    <div className="text-center p-4 bg-slate-900/50 rounded-lg">
                        <p className="text-3xl font-bold text-cyan-400">{metrics?.database.totalRecords.toLocaleString()}</p>
                        <p className="text-xs text-slate-500 mt-1">Total Records</p>
                    </div>
                </div>
            </div>

            {/* Node.js Memory */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                <h2 className="text-lg font-semibold text-slate-100 mb-4">Node.js Memory Usage</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-slate-900/50 rounded-lg">
                        <p className="text-xs text-slate-500">Heap Used</p>
                        <p className="text-xl font-bold text-blue-400">
                            {formatBytes(metrics?.nodejs.memoryUsage.heapUsed || 0)}
                        </p>
                    </div>
                    <div className="p-4 bg-slate-900/50 rounded-lg">
                        <p className="text-xs text-slate-500">Heap Total</p>
                        <p className="text-xl font-bold text-blue-400">
                            {formatBytes(metrics?.nodejs.memoryUsage.heapTotal || 0)}
                        </p>
                    </div>
                    <div className="p-4 bg-slate-900/50 rounded-lg">
                        <p className="text-xs text-slate-500">RSS</p>
                        <p className="text-xl font-bold text-purple-400">
                            {formatBytes(metrics?.nodejs.memoryUsage.rss || 0)}
                        </p>
                    </div>
                    <div className="p-4 bg-slate-900/50 rounded-lg">
                        <p className="text-xs text-slate-500">External</p>
                        <p className="text-xl font-bold text-amber-400">
                            {formatBytes(metrics?.nodejs.memoryUsage.external || 0)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
