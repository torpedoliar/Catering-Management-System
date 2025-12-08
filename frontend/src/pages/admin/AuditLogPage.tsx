import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useSSERefresh, ALL_DATA_EVENTS } from '../../contexts/SSEContext';
import {
    Search,
    Filter,
    ChevronLeft,
    ChevronRight,
    Eye,
    X,
    Download,
    RefreshCw,
    Activity,
    CheckCircle2,
    XCircle,
    LogIn,
    LogOut,
    UserPlus,
    UserMinus,
    Edit,
    Trash2,
    ShoppingCart,
    Ban,
    Settings,
    Calendar,
    Building2,
    Clock,
    AlertTriangle,
    FileText,
    ArrowRight,
    Loader2
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3012/api';

interface AuditLog {
    id: string;
    timestamp: string;
    userId: string | null;
    userName: string | null;
    userRole: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    entityName: string | null;
    oldValue: any;
    newValue: any;
    changes: any;
    ipAddress: string | null;
    userAgent: string | null;
    requestPath: string | null;
    requestMethod: string | null;
    metadata: any;
    description: string | null;
    success: boolean;
    errorMessage: string | null;
}

interface AuditStats {
    period: string;
    totalLogs: number;
    failedCount: number;
    successRate: string;
    byAction: { action: string; count: number }[];
    byEntity: { entity: string; count: number }[];
    recentActivity: any[];
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export default function AuditLogPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [stats, setStats] = useState<AuditStats | null>(null);
    const [actions, setActions] = useState<string[]>([]);
    const [entities, setEntities] = useState<string[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [showFilters, setShowFilters] = useState(false);

    // Filters
    const [filterAction, setFilterAction] = useState('');
    const [filterEntity, setFilterEntity] = useState('');
    const [filterSuccess, setFilterSuccess] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');

    const getToken = () => localStorage.getItem('token');

    const fetchLogs = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const token = getToken();
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '50',
            });

            if (filterAction) params.append('action', filterAction);
            if (filterEntity) params.append('entity', filterEntity);
            if (filterSuccess) params.append('success', filterSuccess);
            if (filterSearch) params.append('search', filterSearch);
            if (filterStartDate) params.append('startDate', filterStartDate);
            if (filterEndDate) params.append('endDate', filterEndDate);

            const response = await fetch(`${API_URL}/audit?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                setLogs(data.logs);
                setPagination(data.pagination);
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
            toast.error('Gagal memuat audit log');
        } finally {
            setLoading(false);
        }
    }, [filterAction, filterEntity, filterSuccess, filterSearch, filterStartDate, filterEndDate]);

    const fetchStats = async () => {
        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/audit/stats?days=7`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                setStats(await response.json());
            }
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const fetchFilters = async () => {
        try {
            const token = getToken();
            const [actionsRes, entitiesRes] = await Promise.all([
                fetch(`${API_URL}/audit/actions`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_URL}/audit/entities`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            if (actionsRes.ok) setActions(await actionsRes.json());
            if (entitiesRes.ok) setEntities(await entitiesRes.json());
        } catch (error) {
            console.error('Error fetching filters:', error);
        }
    };

    useEffect(() => {
        fetchFilters();
        fetchStats();
        fetchLogs();
    }, [fetchLogs]);

    useSSERefresh(ALL_DATA_EVENTS, () => {
        fetchLogs();
        fetchStats();
    });

    const getActionIcon = (action: string) => {
        if (action === 'LOGIN') return <LogIn className="w-4 h-4" />;
        if (action === 'LOGOUT') return <LogOut className="w-4 h-4" />;
        if (action === 'LOGIN_FAILED') return <AlertTriangle className="w-4 h-4" />;
        if (action === 'PASSWORD_CHANGE') return <Settings className="w-4 h-4" />;
        if (action === 'CREATE' || action === 'ORDER_CREATED') return <UserPlus className="w-4 h-4" />;
        if (action === 'UPDATE' || action === 'SETTINGS_UPDATE') return <Edit className="w-4 h-4" />;
        if (action === 'DELETE') return <Trash2 className="w-4 h-4" />;
        if (action === 'ORDER_CANCELLED') return <XCircle className="w-4 h-4" />;
        if (action === 'ORDER_CHECKIN') return <CheckCircle2 className="w-4 h-4" />;
        if (action === 'ORDER_NOSHOW') return <Clock className="w-4 h-4" />;
        if (action === 'USER_BLACKLISTED') return <Ban className="w-4 h-4" />;
        if (action === 'USER_UNBLOCKED') return <UserPlus className="w-4 h-4" />;
        if (action === 'STRIKES_RESET') return <RefreshCw className="w-4 h-4" />;
        if (action === 'IMPORT_DATA' || action === 'EXPORT_DATA') return <FileText className="w-4 h-4" />;
        return <Activity className="w-4 h-4" />;
    };

    const getEntityIcon = (entity: string) => {
        switch (entity) {
            case 'Auth': return <LogIn className="w-4 h-4" />;
            case 'User': return <UserPlus className="w-4 h-4" />;
            case 'Order': return <ShoppingCart className="w-4 h-4" />;
            case 'Shift': return <Clock className="w-4 h-4" />;
            case 'Blacklist': return <Ban className="w-4 h-4" />;
            case 'Settings': return <Settings className="w-4 h-4" />;
            case 'Holiday': return <Calendar className="w-4 h-4" />;
            case 'Company':
            case 'Division':
            case 'Department': return <Building2 className="w-4 h-4" />;
            default: return <FileText className="w-4 h-4" />;
        }
    };

    const getActionColor = (action: string) => {
        if (action.includes('LOGIN') && !action.includes('FAILED')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        if (action === 'LOGOUT') return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
        if (action === 'LOGIN_FAILED') return 'bg-red-500/20 text-red-400 border-red-500/30';
        if (action.includes('CREATE') || action === 'ORDER_CREATED') return 'bg-green-500/20 text-green-400 border-green-500/30';
        if (action.includes('UPDATE') || action.includes('SETTINGS')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
        if (action.includes('DELETE') || action.includes('CANCELLED')) return 'bg-red-500/20 text-red-400 border-red-500/30';
        if (action.includes('BLACKLIST') || action.includes('NOSHOW')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
        if (action.includes('CHECKIN') || action.includes('UNBLOCK')) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
        if (action.includes('IMPORT') || action.includes('EXPORT')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
        if (action === 'STRIKES_RESET') return 'bg-teal-500/20 text-teal-400 border-teal-500/30';
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    };

    const formatActionLabel = (action: string) => {
        const labels: Record<string, string> = {
            'LOGIN': 'Login',
            'LOGOUT': 'Logout',
            'LOGIN_FAILED': 'Login Gagal',
            'PASSWORD_CHANGE': 'Ubah Password',
            'CREATE': 'Tambah Data',
            'UPDATE': 'Update Data',
            'DELETE': 'Hapus Data',
            'ORDER_CREATED': 'Pesan Makanan',
            'ORDER_CANCELLED': 'Batal Pesan',
            'ORDER_CHECKIN': 'Ambil Makanan',
            'ORDER_NOSHOW': 'Tidak Diambil',
            'USER_BLACKLISTED': 'Blacklist User',
            'USER_UNBLOCKED': 'Unblock User',
            'STRIKES_RESET': 'Reset Strike',
            'SETTINGS_UPDATE': 'Update Setting',
            'NTP_SYNC': 'Sync Waktu',
            'IMPORT_DATA': 'Import Data',
            'EXPORT_DATA': 'Export Data',
        };
        return labels[action] || action.replace(/_/g, ' ');
    };

    const clearFilters = () => {
        setFilterAction('');
        setFilterEntity('');
        setFilterSuccess('');
        setFilterSearch('');
        setFilterStartDate('');
        setFilterEndDate('');
    };

    const hasActiveFilters = filterAction || filterEntity || filterSuccess || filterSearch || filterStartDate || filterEndDate;

    const renderChanges = (changes: any) => {
        if (!changes || Object.keys(changes).length === 0) return null;

        return (
            <div className="space-y-2">
                {Object.entries(changes).map(([key, value]: [string, any]) => (
                    <div key={key} className="flex items-start gap-2 text-sm">
                        <span className="text-slate-400 min-w-[120px]">{key}:</span>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs line-through">
                                {JSON.stringify(value.from)}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-500" />
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                                {JSON.stringify(value.to)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Activity className="w-7 h-7 text-cyan-400" />
                        Audit Log
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Catatan semua aktivitas sistem secara detail</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => { fetchLogs(); fetchStats(); }}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`btn-secondary flex items-center gap-2 ${hasActiveFilters ? 'ring-2 ring-cyan-500' : ''}`}
                    >
                        <Filter className="w-4 h-4" />
                        Filter
                        {hasActiveFilters && <span className="w-2 h-2 bg-cyan-400 rounded-full" />}
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="glass-dark rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-slate-400 text-xs">Total Log (7 hari)</p>
                                <p className="text-2xl font-bold text-white mt-1">{stats.totalLogs.toLocaleString()}</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                <Activity className="w-5 h-5 text-cyan-400" />
                            </div>
                        </div>
                    </div>

                    <div className="glass-dark rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-slate-400 text-xs">Sukses</p>
                                <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.successRate}%</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            </div>
                        </div>
                    </div>

                    <div className="glass-dark rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-slate-400 text-xs">Gagal</p>
                                <p className="text-2xl font-bold text-red-400 mt-1">{stats.failedCount}</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                                <XCircle className="w-5 h-5 text-red-400" />
                            </div>
                        </div>
                    </div>

                    <div className="glass-dark rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-slate-400 text-xs">Aktivitas Terbanyak</p>
                                <p className="text-lg font-bold text-purple-400 mt-1">
                                    {stats.byAction[0]?.action ? formatActionLabel(stats.byAction[0].action) : '-'}
                                </p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                {stats.byAction[0]?.action && getActionIcon(stats.byAction[0].action)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters Panel */}
            {showFilters && (
                <div className="glass-dark rounded-xl p-4 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-medium text-white flex items-center gap-2">
                            <Filter className="w-4 h-4 text-cyan-400" />
                            Filter Log
                        </h3>
                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="text-sm text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                            >
                                <X className="w-4 h-4" />
                                Reset Filter
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Cari</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="User, deskripsi..."
                                    value={filterSearch}
                                    onChange={(e) => setFilterSearch(e.target.value)}
                                    className="input-field w-full pl-9"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Aksi</label>
                            <select
                                value={filterAction}
                                onChange={(e) => setFilterAction(e.target.value)}
                                className="input-field w-full"
                            >
                                <option value="">Semua Aksi</option>
                                {actions.map((action) => (
                                    <option key={action} value={action}>{formatActionLabel(action)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Entitas</label>
                            <select
                                value={filterEntity}
                                onChange={(e) => setFilterEntity(e.target.value)}
                                className="input-field w-full"
                            >
                                <option value="">Semua Entitas</option>
                                {entities.map((entity) => (
                                    <option key={entity} value={entity}>{entity}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Status</label>
                            <select
                                value={filterSuccess}
                                onChange={(e) => setFilterSuccess(e.target.value)}
                                className="input-field w-full"
                            >
                                <option value="">Semua Status</option>
                                <option value="true">Sukses</option>
                                <option value="false">Gagal</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Dari Tanggal</label>
                            <input
                                type="date"
                                value={filterStartDate}
                                onChange={(e) => setFilterStartDate(e.target.value)}
                                className="input-field w-full"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Sampai Tanggal</label>
                            <input
                                type="date"
                                value={filterEndDate}
                                onChange={(e) => setFilterEndDate(e.target.value)}
                                className="input-field w-full"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Logs Table */}
            <div className="glass-dark rounded-xl overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-12">
                        <Activity className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                        <p className="text-slate-400">Tidak ada log ditemukan</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-800/50 border-b border-slate-700/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Waktu</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">User</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Aksi</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Entitas</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Deskripsi</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase">Detail</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/30">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                                            <div className="text-slate-300">{format(new Date(log.timestamp), 'dd/MM/yyyy')}</div>
                                            <div className="text-xs text-slate-500">{format(new Date(log.timestamp), 'HH:mm:ss')}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <div className="text-white font-medium">{log.userName || 'System'}</div>
                                            {log.userRole && (
                                                <div className="text-xs text-slate-400">{log.userRole}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${getActionColor(log.action)}`}>
                                                {getActionIcon(log.action)}
                                                {formatActionLabel(log.action)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <div className="flex items-center gap-2 text-slate-300">
                                                {getEntityIcon(log.entity)}
                                                {log.entity}
                                            </div>
                                            {log.entityName && (
                                                <div className="text-xs text-slate-500 truncate max-w-[150px]">{log.entityName}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-300 max-w-xs">
                                            <div className="truncate">{log.description || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {log.success ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-400">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    Sukses
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-500/20 text-red-400">
                                                    <XCircle className="w-3 h-3" />
                                                    Gagal
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => setSelectedLog(log)}
                                                className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between">
                        <p className="text-sm text-slate-400">
                            {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} dari {pagination.total.toLocaleString()} log
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => fetchLogs(pagination.page - 1)}
                                disabled={pagination.page === 1}
                                className="p-2 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5 text-slate-400" />
                            </button>
                            <span className="px-3 py-1 text-sm text-slate-400">
                                {pagination.page} / {pagination.totalPages}
                            </span>
                            <button
                                onClick={() => fetchLogs(pagination.page + 1)}
                                disabled={pagination.page === pagination.totalPages}
                                className="p-2 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                            >
                                <ChevronRight className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selectedLog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/80">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${getActionColor(selectedLog.action)}`}>
                                    {getActionIcon(selectedLog.action)}
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-white">{formatActionLabel(selectedLog.action)}</h3>
                                    <p className="text-sm text-slate-400">
                                        {format(new Date(selectedLog.timestamp), 'EEEE, dd MMMM yyyy HH:mm:ss', { locale: id })}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Status Banner */}
                            {!selectedLog.success && selectedLog.errorMessage && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-red-400 font-medium">Aksi Gagal</p>
                                        <p className="text-red-300/80 text-sm mt-1">{selectedLog.errorMessage}</p>
                                    </div>
                                </div>
                            )}

                            {/* Basic Info Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="bg-slate-700/30 rounded-lg p-3">
                                    <p className="text-xs text-slate-400 mb-1">User</p>
                                    <p className="text-white font-medium">{selectedLog.userName || 'System'}</p>
                                    {selectedLog.userRole && <p className="text-xs text-slate-400">{selectedLog.userRole}</p>}
                                </div>
                                <div className="bg-slate-700/30 rounded-lg p-3">
                                    <p className="text-xs text-slate-400 mb-1">Entitas</p>
                                    <div className="flex items-center gap-2 text-white font-medium">
                                        {getEntityIcon(selectedLog.entity)}
                                        {selectedLog.entity}
                                    </div>
                                    {selectedLog.entityName && <p className="text-xs text-slate-400">{selectedLog.entityName}</p>}
                                </div>
                                <div className="bg-slate-700/30 rounded-lg p-3">
                                    <p className="text-xs text-slate-400 mb-1">IP Address</p>
                                    <p className="text-white font-mono text-sm">{selectedLog.ipAddress || '-'}</p>
                                </div>
                            </div>

                            {/* Description */}
                            {selectedLog.description && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-2">Deskripsi</h4>
                                    <p className="text-white bg-slate-700/30 rounded-lg p-3">{selectedLog.description}</p>
                                </div>
                            )}

                            {/* Request Info */}
                            {selectedLog.requestPath && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-2">Request</h4>
                                    <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm">
                                        <span className="text-cyan-400">{selectedLog.requestMethod}</span>{' '}
                                        <span className="text-slate-300">{selectedLog.requestPath}</span>
                                    </div>
                                </div>
                            )}

                            {/* Changes (Diff View) */}
                            {selectedLog.changes && Object.keys(selectedLog.changes).length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-2">Perubahan</h4>
                                    <div className="bg-slate-900 rounded-lg p-4">
                                        {renderChanges(selectedLog.changes)}
                                    </div>
                                </div>
                            )}

                            {/* Old Value */}
                            {selectedLog.oldValue && Object.keys(selectedLog.oldValue).length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                                        <span className="w-3 h-3 bg-red-500 rounded-full" />
                                        Nilai Sebelumnya
                                    </h4>
                                    <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto max-h-48">
                                        <pre className="text-sm text-red-300 font-mono whitespace-pre-wrap">
                                            {JSON.stringify(selectedLog.oldValue, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            )}

                            {/* New Value */}
                            {selectedLog.newValue && Object.keys(selectedLog.newValue).length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                                        <span className="w-3 h-3 bg-green-500 rounded-full" />
                                        Nilai Setelahnya
                                    </h4>
                                    <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto max-h-48">
                                        <pre className="text-sm text-green-300 font-mono whitespace-pre-wrap">
                                            {JSON.stringify(selectedLog.newValue, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            )}

                            {/* Metadata */}
                            {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-2">Metadata</h4>
                                    <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                                        <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap">
                                            {JSON.stringify(selectedLog.metadata, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            )}

                            {/* User Agent */}
                            {selectedLog.userAgent && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-2">User Agent</h4>
                                    <p className="text-xs text-slate-500 bg-slate-700/30 rounded-lg p-3 break-all">
                                        {selectedLog.userAgent}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 border-t border-slate-700 bg-slate-800/50">
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-slate-500">ID: {selectedLog.id}</p>
                                <button
                                    onClick={() => setSelectedLog(null)}
                                    className="btn-secondary"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
