import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    MessageSquare,
    RefreshCw,
    Download,
    ShieldCheck,
    ShieldX,
    Eye,
    RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { formatDateTimeShortWIB } from '../../utils/timezone';
import { formatOrderDate } from '../../utils/dateHelpers';
import { useSSERefresh, ORDER_EVENTS } from '../../contexts/SSEContext';
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

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
}

interface User {
    id: string;
    name: string;
    externalId: string;
    company: string;
    department: string;
}

interface Message {
    id: string;
    type: 'COMPLAINT' | 'CANCELLATION' | 'APPEAL';
    content: string;
    orderDate: string;
    createdAt: string;
    status?: string;
    photoUrl?: string | null;
    resolvedBy?: string | null;
    resolvedAt?: string | null;
    user: User;
    shift: Shift;
    order?: {
        id: string;
        status: string;
    } | null;
}

function formatDateId(iso: string): string {
    const key = formatOrderDate(iso);
    if (key === '-') return '-';
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export default function MessagesPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    const [typeFilter, setTypeFilter] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [shiftFilter, setShiftFilter] = useState<string>('');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const [resolvingId, setResolvingId] = useState<string | null>(null);
    const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

    const [searchParams, setSearchParams] = useSearchParams();
    const deepLinkId = searchParams.get('id');
    const lastConsumedIdRef = useRef<string | null>(null);
    const [detailMessage, setDetailMessage] = useState<Message | null>(null);

    const loadMessages = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
            });
            if (typeFilter) params.append('type', typeFilter);
            if (statusFilter) params.append('status', statusFilter);
            if (shiftFilter) params.append('shiftId', shiftFilter);
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);

            const res = await api.get(`/api/messages?${params.toString()}`);
            setMessages(res.data.messages || []);
            setTotalPages(res.data.pagination?.totalPages || 1);
            setTotal(res.data.pagination?.total || 0);
        } catch (error) {
            console.error('Failed to load messages:', error);
            toast.error('Gagal memuat pesan');
        } finally {
            setIsLoading(false);
        }
    }, [page, limit, typeFilter, statusFilter, shiftFilter, startDate, endDate]);

    const loadShifts = useCallback(async () => {
        try {
            const res = await api.get('/api/shifts');
            setShifts(res.data.shifts || []);
        } catch (error) {
            console.error('Failed to load shifts:', error);
        }
    }, []);

    useEffect(() => {
        loadMessages();
    }, [loadMessages]);

    useEffect(() => {
        loadShifts();
    }, [loadShifts]);

    useSSERefresh(ORDER_EVENTS, loadMessages);

    useEffect(() => {
        if (!deepLinkId || lastConsumedIdRef.current === deepLinkId || isLoading) return;
        const match = messages.find((m) => m.id === deepLinkId);
        if (match) {
            setDetailMessage(match);
            lastConsumedIdRef.current = deepLinkId;
            const next = new URLSearchParams(searchParams);
            next.delete('id');
            setSearchParams(next, { replace: true });
        } else if (page < totalPages && page < 5) {
            setPage((p) => p + 1);
        }
    }, [deepLinkId, isLoading, messages, page, totalPages, searchParams, setSearchParams]);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const params = new URLSearchParams();
            if (typeFilter) params.append('type', typeFilter);
            if (shiftFilter) params.append('shiftId', shiftFilter);
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);

            const res = await api.get(`/api/messages/export?${params.toString()}`, {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Pesan_Catering_${formatOrderDate(new Date())}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Data pesan diekspor');
        } catch {
            toast.error('Gagal mengekspor pesan');
        } finally {
            setIsExporting(false);
        }
    };

    const handleResolve = async (messageId: string, status: 'APPROVED' | 'REJECTED') => {
        setResolvingId(messageId);
        try {
            await api.put(`/api/messages/${messageId}/resolve`, { status });
            toast.success(status === 'APPROVED' ? 'Sanggahan disetujui' : 'Sanggahan ditolak');
            loadMessages();
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string } } };
            toast.error(err.response?.data?.error || 'Gagal memproses sanggahan');
        } finally {
            setResolvingId(null);
        }
    };

    const clearFilters = () => {
        setTypeFilter('');
        setStatusFilter('');
        setShiftFilter('');
        setStartDate('');
        setEndDate('');
        setPage(1);
    };

    const typeBadge = (type: string) => {
        if (type === 'COMPLAINT') return <Badge variant="danger">Keluhan</Badge>;
        if (type === 'CANCELLATION') return <Badge variant="warning">Pembatalan</Badge>;
        if (type === 'APPEAL') return <Badge variant="info">Sanggahan</Badge>;
        return <Badge variant="neutral">{type}</Badge>;
    };

    const statusBadge = (msg: Message) => {
        if (msg.type !== 'APPEAL') return <span className="text-[#a8a29e]">-</span>;
        if (msg.status === 'APPROVED') return <Badge variant="success">Disetujui</Badge>;
        if (msg.status === 'REJECTED') return <Badge variant="danger">Ditolak</Badge>;
        if (msg.status === 'PENDING') return <Badge variant="warning" dot>Menunggu</Badge>;
        return <span className="text-[#a8a29e]">-</span>;
    };

    return (
        <div className="space-y-4">
            <PageHeader
                title="Pesan & sanggahan"
                subtitle="Keluhan makanan, alasan pembatalan, dan pengajuan sanggahan no-show"
                actions={
                    <>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={loadMessages}
                            leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Muat ulang
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            loading={isExporting}
                            disabled={messages.length === 0}
                            onClick={handleExport}
                            leftIcon={<Download className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Ekspor Excel
                        </Button>
                    </>
                }
            />

            {/* KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile label="Total pesan" value={total} color="#f59e0b" />
                <StatTile
                    label="Keluhan (halaman ini)"
                    value={messages.filter((m) => m.type === 'COMPLAINT').length}
                    color="#dc2626"
                    valueColor="#b91c1c"
                />
                <StatTile
                    label="Pembatalan (halaman ini)"
                    value={messages.filter((m) => m.type === 'CANCELLATION').length}
                    color="#d97706"
                    valueColor="#b45309"
                />
                <StatTile
                    label="Sanggahan (halaman ini)"
                    value={messages.filter((m) => m.type === 'APPEAL').length}
                    color="#2563eb"
                    valueColor="#1d4ed8"
                />
            </div>

            {/* Filter & Table Card */}
            <Card padding="none">
                <div className="px-4 py-3 border-b border-[#f5f5f4] flex flex-wrap items-center gap-2.5">
                    <select
                        aria-label="Filter tipe pesan"
                        value={typeFilter}
                        onChange={(e) => {
                            setTypeFilter(e.target.value);
                            setPage(1);
                        }}
                        className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    >
                        <option value="">Semua tipe</option>
                        <option value="APPEAL">Sanggahan</option>
                        <option value="COMPLAINT">Keluhan</option>
                        <option value="CANCELLATION">Pembatalan</option>
                    </select>

                    <select
                        aria-label="Filter status sanggahan"
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                        className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    >
                        <option value="">Semua status</option>
                        <option value="PENDING">Menunggu</option>
                        <option value="APPROVED">Disetujui</option>
                        <option value="REJECTED">Ditolak</option>
                    </select>

                    <select
                        aria-label="Filter shift"
                        value={shiftFilter}
                        onChange={(e) => {
                            setShiftFilter(e.target.value);
                            setPage(1);
                        }}
                        className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    >
                        <option value="">Semua shift</option>
                        {shifts.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>

                    <input
                        type="date"
                        aria-label="Dari tanggal"
                        value={startDate}
                        onChange={(e) => {
                            setStartDate(e.target.value);
                            setPage(1);
                        }}
                        className="h-9 px-2.5 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    />
                    <input
                        type="date"
                        aria-label="Sampai tanggal"
                        value={endDate}
                        onChange={(e) => {
                            setEndDate(e.target.value);
                            setPage(1);
                        }}
                        className="h-9 px-2.5 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    />

                    {(typeFilter || statusFilter || shiftFilter || startDate || endDate) && (
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

                {isLoading ? (
                    <div className="p-4 space-y-2.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                        ))}
                    </div>
                ) : messages.length === 0 ? (
                    <EmptyState
                        icon={<MessageSquare className="w-6 h-6" />}
                        title="Tidak ada pesan"
                        description="Ubah atau reset filter untuk melihat pesan lainnya."
                    />
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                        <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Tipe
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Karyawan
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Tanggal Order
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Shift
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Pesan
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Status
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Waktu Kirim
                                        </th>
                                        <th className="text-right px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Aksi
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#f5f5f4]">
                                    {messages.map((msg) => (
                                        <tr key={msg.id} className="hover:bg-[#fafaf9]">
                                            <td className="px-4 py-3 whitespace-nowrap">{typeBadge(msg.type)}</td>
                                            <td className="px-3 py-3">
                                                <div className="font-semibold text-[#1c1917]">{msg.user.name}</div>
                                                <div className="text-[11.5px] text-[#78716c]">
                                                    <span className="font-mono">{msg.user.externalId}</span> · {msg.user.department || msg.user.company || '-'}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-[#57534e] whitespace-nowrap">
                                                {formatDateId(msg.orderDate)}
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap">
                                                <Badge variant="neutral">{msg.shift.name}</Badge>
                                            </td>
                                            <td className="px-3 py-3 max-w-xs">
                                                <p className="text-[#1c1917] line-clamp-2">{msg.content}</p>
                                                {msg.type === 'APPEAL' && msg.photoUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewPhoto(msg.photoUrl!)}
                                                        className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#2563eb] hover:underline bg-transparent border-0 p-0 cursor-pointer"
                                                    >
                                                        <Eye className="w-3 h-3" aria-hidden="true" />
                                                        Bukti foto
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap">
                                                {statusBadge(msg)}
                                                {msg.resolvedBy && (
                                                    <div className="text-[11px] text-[#78716c] mt-0.5">
                                                        oleh {msg.resolvedBy}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-[12px] text-[#78716c] whitespace-nowrap tabular-nums">
                                                {formatDateTimeShortWIB(msg.createdAt)}
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <div className="inline-flex items-center gap-1">
                                                    {msg.type === 'APPEAL' && msg.status === 'PENDING' && (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                variant="secondary"
                                                                loading={resolvingId === msg.id}
                                                                onClick={() => handleResolve(msg.id, 'APPROVED')}
                                                                aria-label={`Setujui sanggahan ${msg.user.name}`}
                                                            >
                                                                <ShieldCheck className="w-3.5 h-3.5 text-[#15803d]" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="secondary"
                                                                loading={resolvingId === msg.id}
                                                                onClick={() => handleResolve(msg.id, 'REJECTED')}
                                                                aria-label={`Tolak sanggahan ${msg.user.name}`}
                                                            >
                                                                <ShieldX className="w-3.5 h-3.5 text-[#b91c1c]" />
                                                            </Button>
                                                        </>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setDetailMessage(msg)}
                                                        aria-label={`Detail pesan ${msg.user.name}`}
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <Pagination
                            page={page}
                            limit={limit}
                            total={total}
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

            {/* Photo Preview Modal */}
            <Modal
                open={Boolean(previewPhoto)}
                onClose={() => setPreviewPhoto(null)}
                title="Bukti foto sanggahan"
                size="lg"
            >
                {previewPhoto && (
                    <img
                        src={previewPhoto}
                        alt="Bukti Sanggahan"
                        className="w-full max-h-[65vh] object-contain rounded-[10px]"
                    />
                )}
            </Modal>

            {/* Detail Modal */}
            <Modal
                open={Boolean(detailMessage)}
                onClose={() => setDetailMessage(null)}
                title={
                    detailMessage
                        ? `Detail ${detailMessage.type === 'COMPLAINT'
                            ? 'Keluhan'
                            : detailMessage.type === 'CANCELLATION'
                                ? 'Pembatalan'
                                : 'Sanggahan'
                        }`
                        : ''
                }
                size="lg"
                footer={
                    <>
                        {detailMessage?.type === 'APPEAL' && detailMessage.status === 'PENDING' && (
                            <>
                                <Button
                                    variant="danger"
                                    onClick={async () => {
                                        await handleResolve(detailMessage.id, 'REJECTED');
                                        setDetailMessage(null);
                                    }}
                                >
                                    Tolak
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={async () => {
                                        await handleResolve(detailMessage.id, 'APPROVED');
                                        setDetailMessage(null);
                                    }}
                                >
                                    Setujui sanggahan
                                </Button>
                            </>
                        )}
                        <Button variant="secondary" onClick={() => setDetailMessage(null)}>
                            Tutup
                        </Button>
                    </>
                }
            >
                {detailMessage && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                                <div className="text-[11px] font-semibold uppercase text-[#78716c]">Karyawan</div>
                                <div className="text-[13.5px] font-semibold text-[#1c1917] mt-0.5">
                                    {detailMessage.user.name} ({detailMessage.user.externalId})
                                </div>
                                <div className="text-[12px] text-[#78716c]">
                                    {detailMessage.user.company || '-'} · {detailMessage.user.department || '-'}
                                </div>
                            </div>
                            <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                                <div className="text-[11px] font-semibold uppercase text-[#78716c]">Order & Shift</div>
                                <div className="text-[13.5px] font-semibold text-[#1c1917] mt-0.5">
                                    {formatDateId(detailMessage.orderDate)} · {detailMessage.shift.name}
                                </div>
                                <div className="text-[12px] text-[#78716c]">
                                    Dikirim {formatDateTimeShortWIB(detailMessage.createdAt)}
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="text-[11.5px] font-semibold uppercase text-[#78716c] mb-1.5">
                                Isi pesan
                            </div>
                            <div className="p-3.5 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4] text-[13.5px] text-[#1c1917] whitespace-pre-wrap leading-relaxed">
                                {detailMessage.content}
                            </div>
                        </div>

                        {detailMessage.photoUrl && (
                            <div>
                                <div className="text-[11.5px] font-semibold uppercase text-[#78716c] mb-1.5">
                                    Bukti foto
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPreviewPhoto(detailMessage.photoUrl ?? null)}
                                    className="p-0 border border-[#e7e5e4] rounded-[10px] overflow-hidden bg-transparent cursor-pointer"
                                >
                                    <img
                                        src={detailMessage.photoUrl}
                                        alt="Bukti"
                                        className="max-h-56 object-contain"
                                    />
                                </button>
                            </div>
                        )}

                        {detailMessage.resolvedBy && (
                            <div className="text-[12.5px] text-[#57534e]">
                                Diproses oleh <b>{detailMessage.resolvedBy}</b>
                                {detailMessage.resolvedAt && ` pada ${formatDateTimeShortWIB(detailMessage.resolvedAt)}`}
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}
