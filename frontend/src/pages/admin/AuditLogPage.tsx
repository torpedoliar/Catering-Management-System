import { useState, useEffect, useCallback } from 'react';
import {
    Activity,
    RefreshCw,
    Eye,
    ArrowRight,
    RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { formatDateTimeWIB } from '../../utils/timezone';
import { useSSERefresh, ALL_DATA_EVENTS } from '../../contexts/SSEContext';
import {
    PageHeader,
    Button,
    Card,
    StatTile,
    Badge,
    Pagination,
    Modal,
    EmptyState,
    Skeleton,
} from '../../components/ui';

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
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    changes: Record<string, { from: unknown; to: unknown }> | null;
    ipAddress: string | null;
    userAgent: string | null;
    requestPath: string | null;
    requestMethod: string | null;
    metadata: Record<string, unknown> | null;
    description: string | null;
    success: boolean;
    errorMessage: string | null;
}

interface AuditStats {
    period: string;
    totalLogs: number;
    failedCount: number;
    successRate: string;
}

interface PaginationState {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

const ACTION_LABELS: Record<string, string> = {
    LOGIN: 'Login',
    LOGOUT: 'Logout',
    LOGIN_FAILED: 'Login gagal',
    PASSWORD_CHANGE: 'Ubah password',
    CREATE: 'Tambah data',
    UPDATE: 'Perbarui data',
    DELETE: 'Hapus data',
    ORDER_CREATED: 'Pesan makanan',
    ORDER_CANCELLED: 'Batal pesan',
    ORDER_CHECKIN: 'Ambil makanan',
    ORDER_NOSHOW: 'Tidak diambil',
    USER_BLACKLISTED: 'Blacklist user',
    USER_UNBLOCKED: 'Unblock user',
    STRIKES_RESET: 'Reset strike',
    SETTINGS_UPDATE: 'Ubah pengaturan',
    NTP_SYNC: 'Sinkron waktu',
    IMPORT_DATA: 'Impor data',
    EXPORT_DATA: 'Ekspor data',
};

function formatActionLabel(action: string): string {
    return ACTION_LABELS[action] || action.replace(/_/g, ' ');
}

function getActionVariant(action: string): 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
    if (action === 'LOGIN_FAILED' || action.includes('DELETE') || action.includes('CANCELLED') || action.includes('BLACKLIST') || action.includes('NOSHOW')) {
        return 'danger';
    }
    if (action.includes('CREATE') || action === 'ORDER_CREATED' || action.includes('CHECKIN') || action.includes('UNBLOCK')) {
        return 'success';
    }
    if (action.includes('UPDATE') || action.includes('SETTINGS') || action === 'STRIKES_RESET') {
        return 'warning';
    }
    if (action.includes('LOGIN')) return 'info';
    return 'neutral';
}

export default function AuditLogPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [stats, setStats] = useState<AuditStats | null>(null);
    const [actions, setActions] = useState<string[]>([]);
    const [entities, setEntities] = useState<string[]>([]);
    const [pagination, setPagination] = useState<PaginationState>({
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
    });
    const [loading, setLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    const [filterAction, setFilterAction] = useState('');
    const [filterEntity, setFilterEntity] = useState('');
    const [filterSuccess, setFilterSuccess] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
            });
            if (filterAction) params.append('action', filterAction);
            if (filterEntity) params.append('entity', filterEntity);
            if (filterSuccess) params.append('success', filterSuccess);
            if (filterSearch) params.append('search', filterSearch);
            if (filterStartDate) params.append('startDate', filterStartDate);
            if (filterEndDate) params.append('endDate', filterEndDate);

            const res = await api.get(`/api/audit?${params}`);
            setLogs(res.data.logs || []);
            setPagination(res.data.pagination || { page: 1, limit, total: 0, totalPages: 0 });
        } catch (error) {
            console.error('Error fetching logs:', error);
            toast.error('Gagal memuat audit log');
        } finally {
            setLoading(false);
        }
    }, [page, limit, filterAction, filterEntity, filterSuccess, filterSearch, filterStartDate, filterEndDate]);

    const fetchStatsAndFilters = useCallback(async () => {
        try {
            const [statsRes, actionsRes, entitiesRes] = await Promise.all([
                api.get('/api/audit/stats?days=7'),
                api.get('/api/audit/actions'),
                api.get('/api/audit/entities'),
            ]);
            setStats(statsRes.data);
            setActions(actionsRes.data || []);
            setEntities(entitiesRes.data || []);
        } catch (error) {
            console.error('Error fetching audit metadata:', error);
        }
    }, []);

    useEffect(() => {
        fetchStatsAndFilters();
    }, [fetchStatsAndFilters]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useSSERefresh(ALL_DATA_EVENTS, () => {
        fetchLogs();
        fetchStatsAndFilters();
    });

    const clearFilters = () => {
        setFilterAction('');
        setFilterEntity('');
        setFilterSuccess('');
        setFilterSearch('');
        setFilterStartDate('');
        setFilterEndDate('');
        setPage(1);
    };

    const hasFilters = Boolean(
        filterAction || filterEntity || filterSuccess || filterSearch || filterStartDate || filterEndDate
    );

    return (
        <div className="space-y-4">
            <PageHeader
                title="Audit log"
                subtitle="Riwayat aktivitas pengguna dan perubahan sistem"
                actions={
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            fetchLogs();
                            fetchStatsAndFilters();
                        }}
                        leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                        Muat ulang
                    </Button>
                }
            />

            {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatTile label="Total log (7 hari)" value={stats.totalLogs} color="#f59e0b" />
                    <StatTile
                        label="Tingkat sukses"
                        value={`${stats.successRate}%`}
                        color="#16a34a"
                        valueColor="#15803d"
                    />
                    <StatTile
                        label="Aktivitas gagal"
                        value={stats.failedCount}
                        color="#dc2626"
                        valueColor="#b91c1c"
                    />
                    <StatTile label="Total hasil filter" value={pagination.total} color="#2563eb" />
                </div>
            )}

            <Card padding="none">
                <div className="px-4 py-3 border-b border-[#f5f5f4] flex flex-wrap items-center gap-2.5">
                    <input
                        type="text"
                        value={filterSearch}
                        onChange={(e) => {
                            setFilterSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Cari pengguna, entitas, atau deskripsi..."
                        className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917] flex-1 min-w-[200px]"
                    />
                    <select
                        aria-label="Filter aksi"
                        value={filterAction}
                        onChange={(e) => {
                            setFilterAction(e.target.value);
                            setPage(1);
                        }}
                        className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    >
                        <option value="">Semua aksi</option>
                        {actions.map((a) => (
                            <option key={a} value={a}>
                                {formatActionLabel(a)}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label="Filter entitas"
                        value={filterEntity}
                        onChange={(e) => {
                            setFilterEntity(e.target.value);
                            setPage(1);
                        }}
                        className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    >
                        <option value="">Semua entitas</option>
                        {entities.map((ent) => (
                            <option key={ent} value={ent}>
                                {ent}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label="Filter status"
                        value={filterSuccess}
                        onChange={(e) => {
                            setFilterSuccess(e.target.value);
                            setPage(1);
                        }}
                        className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    >
                        <option value="">Semua status</option>
                        <option value="true">Sukses</option>
                        <option value="false">Gagal</option>
                    </select>
                    <input
                        type="date"
                        aria-label="Dari tanggal"
                        value={filterStartDate}
                        onChange={(e) => {
                            setFilterStartDate(e.target.value);
                            setPage(1);
                        }}
                        className="h-9 px-2.5 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    />
                    <input
                        type="date"
                        aria-label="Sampai tanggal"
                        value={filterEndDate}
                        onChange={(e) => {
                            setFilterEndDate(e.target.value);
                            setPage(1);
                        }}
                        className="h-9 px-2.5 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    />
                    {hasFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearFilters}
                            leftIcon={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Reset
                        </Button>
                    )}
                </div>

                {loading ? (
                    <div className="p-4 space-y-2.5">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-11 w-full" />
                        ))}
                    </div>
                ) : logs.length === 0 ? (
                    <EmptyState
                        icon={<Activity className="w-6 h-6" />}
                        title="Tidak ada log aktivitas"
                        description="Belum ada log yang cocok dengan filter yang dipilih."
                    />
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                        <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Waktu
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Pengguna
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Aksi
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Entitas
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Deskripsi
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Status
                                        </th>
                                        <th className="text-right px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Detail
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#f5f5f4]">
                                    {logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-[#fafaf9]">
                                            <td className="px-4 py-2.5 text-[12px] text-[#57534e] whitespace-nowrap tabular-nums">
                                                {formatDateTimeWIB(log.timestamp)}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className="font-semibold text-[#1c1917]">
                                                    {log.userName || 'System'}
                                                </div>
                                                {log.userRole && (
                                                    <div className="text-[11px] text-[#78716c]">{log.userRole}</div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                <Badge variant={getActionVariant(log.action)}>
                                                    {formatActionLabel(log.action)}
                                                </Badge>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className="font-medium text-[#1c1917]">{log.entity}</div>
                                                {log.entityName && (
                                                    <div className="text-[11.5px] text-[#78716c] truncate max-w-[160px]">
                                                        {log.entityName}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 max-w-xs text-[#57534e]">
                                                <div className="truncate">{log.description || '-'}</div>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                <Badge variant={log.success ? 'success' : 'danger'}>
                                                    {log.success ? 'Sukses' : 'Gagal'}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedLog(log)}
                                                    aria-label={`Lihat detail log ${log.id}`}
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <Pagination
                            page={pagination.page}
                            limit={pagination.limit}
                            total={pagination.total}
                            onPageChange={setPage}
                            onLimitChange={(l) => {
                                setLimit(l);
                                setPage(1);
                            }}
                            variant="admin"
                            showJumpToPage
                        />
                    </>
                )}
            </Card>

            {/* Audit Log Detail Modal */}
            <Modal
                open={Boolean(selectedLog)}
                onClose={() => setSelectedLog(null)}
                title={selectedLog ? formatActionLabel(selectedLog.action) : ''}
                size="xl"
                footer={
                    <div className="flex items-center justify-between w-full">
                        <span className="text-[11.5px] font-mono text-[#78716c]">ID: {selectedLog?.id}</span>
                        <Button variant="secondary" onClick={() => setSelectedLog(null)}>
                            Tutup
                        </Button>
                    </div>
                }
            >
                {selectedLog && (
                    <div className="space-y-4">
                        {!selectedLog.success && selectedLog.errorMessage && (
                            <div className="p-3 rounded-[10px] bg-[#fef2f2] border border-[#fecaca] text-[13px] text-[#991b1b]">
                                <b>Aksi gagal:</b> {selectedLog.errorMessage}
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                                <div className="text-[11px] font-semibold uppercase text-[#78716c]">Pengguna</div>
                                <div className="text-[13.5px] font-semibold text-[#1c1917] mt-0.5">
                                    {selectedLog.userName || 'System'}
                                </div>
                                {selectedLog.userRole && (
                                    <div className="text-[11.5px] text-[#78716c]">{selectedLog.userRole}</div>
                                )}
                            </div>
                            <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                                <div className="text-[11px] font-semibold uppercase text-[#78716c]">Entitas</div>
                                <div className="text-[13.5px] font-semibold text-[#1c1917] mt-0.5">
                                    {selectedLog.entity}
                                </div>
                                {selectedLog.entityName && (
                                    <div className="text-[11.5px] text-[#78716c]">{selectedLog.entityName}</div>
                                )}
                            </div>
                            <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                                <div className="text-[11px] font-semibold uppercase text-[#78716c]">Waktu & IP</div>
                                <div className="text-[12.5px] font-medium text-[#1c1917] mt-0.5">
                                    {formatDateTimeWIB(selectedLog.timestamp)}
                                </div>
                                <div className="text-[11.5px] font-mono text-[#78716c]">
                                    {selectedLog.ipAddress || '-'}
                                </div>
                            </div>
                        </div>

                        {selectedLog.description && (
                            <div>
                                <div className="text-[11.5px] font-semibold uppercase text-[#78716c] mb-1">
                                    Deskripsi
                                </div>
                                <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4] text-[13px] text-[#1c1917]">
                                    {selectedLog.description}
                                </div>
                            </div>
                        )}

                        {selectedLog.requestPath && (
                            <div>
                                <div className="text-[11.5px] font-semibold uppercase text-[#78716c] mb-1">
                                    Request
                                </div>
                                <div className="p-2.5 rounded-[10px] bg-[#1c1917] text-[#fafaf9] font-mono text-[12px]">
                                    <span className="text-[#fbbf24]">{selectedLog.requestMethod}</span>{' '}
                                    {selectedLog.requestPath}
                                </div>
                            </div>
                        )}

                        {selectedLog.changes && Object.keys(selectedLog.changes).length > 0 && (
                            <div>
                                <div className="text-[11.5px] font-semibold uppercase text-[#78716c] mb-1.5">
                                    Perubahan
                                </div>
                                <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4] space-y-2">
                                    {Object.entries(selectedLog.changes).map(([k, val]) => (
                                        <div key={k} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                                            <span className="font-semibold text-[#57534e] min-w-[110px]">{k}:</span>
                                            <span className="px-1.5 py-0.5 rounded bg-[#fee2e2] text-[#b91c1c] line-through font-mono text-[11.5px]">
                                                {JSON.stringify(val.from)}
                                            </span>
                                            <ArrowRight className="w-3 h-3 text-[#78716c]" />
                                            <span className="px-1.5 py-0.5 rounded bg-[#dcfce7] text-[#15803d] font-mono text-[11.5px]">
                                                {JSON.stringify(val.to)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedLog.oldValue && Object.keys(selectedLog.oldValue).length > 0 && (
                            <div>
                                <div className="text-[11.5px] font-semibold uppercase text-[#78716c] mb-1">
                                    Nilai sebelumnya
                                </div>
                                <pre className="p-3 rounded-[10px] bg-[#fef2f2] border border-[#fecaca] text-[#991b1b] text-[12px] font-mono overflow-x-auto max-h-44">
                                    {JSON.stringify(selectedLog.oldValue, null, 2)}
                                </pre>
                            </div>
                        )}

                        {selectedLog.newValue && Object.keys(selectedLog.newValue).length > 0 && (
                            <div>
                                <div className="text-[11.5px] font-semibold uppercase text-[#78716c] mb-1">
                                    Nilai setelahnya
                                </div>
                                <pre className="p-3 rounded-[10px] bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] text-[12px] font-mono overflow-x-auto max-h-44">
                                    {JSON.stringify(selectedLog.newValue, null, 2)}
                                </pre>
                            </div>
                        )}

                        {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                            <div>
                                <div className="text-[11.5px] font-semibold uppercase text-[#78716c] mb-1">
                                    Metadata
                                </div>
                                <pre className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4] text-[#1c1917] text-[12px] font-mono overflow-x-auto">
                                    {JSON.stringify(selectedLog.metadata, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}
