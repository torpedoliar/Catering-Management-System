import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { api } from '../../contexts/AuthContext';
import { formatDateTimeShortWIB } from '../../utils/timezone';
import { useSSERefresh, ORDER_EVENTS } from '../../contexts/SSEContext';
import {
    MessageSquare,
    AlertTriangle,
    XCircle,
    Loader2,
    RefreshCw,
    Download,
    Filter,
    Calendar,
    Building2,
    Clock,
    ShieldAlert,
    ShieldCheck,
    ShieldX,
    Eye,
    CheckCircle,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';

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

export default function MessagesPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    // Filters
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [shiftFilter, setShiftFilter] = useState<string>('');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    // Appeal resolve states
    const [resolvingId, setResolvingId] = useState<string | null>(null);

    // Photo preview modal
    const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

    const loadMessages = useCallback(async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            params.append('page', page.toString());
            params.append('limit', '20');

            if (typeFilter) params.append('type', typeFilter);
            if (shiftFilter) params.append('shiftId', shiftFilter);
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);

            const res = await api.get(`/api/messages?${params.toString()}`);
            setMessages(res.data.messages);
            setTotalPages(res.data.pagination.totalPages);
            setTotal(res.data.pagination.total);
        } catch (error) {
            console.error('Failed to load messages:', error);
        } finally {
            setIsLoading(false);
        }
    }, [page, typeFilter, shiftFilter, startDate, endDate]);

    const loadShifts = useCallback(async () => {
        try {
            const res = await api.get('/api/shifts');
            // API returns { shifts: [...], cutoffHours, ... } not array directly
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

    // SSE: Reload messages when orders are cancelled (creates message)
    useSSERefresh(ORDER_EVENTS, loadMessages);

    const handleExport = async () => {
        try {
            setIsExporting(true);
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
            link.setAttribute('download', `Pesan_Catering_${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const clearFilters = () => {
        setTypeFilter('');
        setShiftFilter('');
        setStartDate('');
        setEndDate('');
        setPage(1);
    };

    const handleResolve = async (messageId: string, status: 'APPROVED' | 'REJECTED') => {
        try {
            setResolvingId(messageId);
            await api.put(`/api/messages/${messageId}/resolve`, { status });
            toast.success(`Sanggahan berhasil di-${status.toLowerCase()}`);
            loadMessages();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal memproses sanggahan');
        } finally {
            setResolvingId(null);
        }
    };

    const getTypeBadge = (type: string) => {
        switch (type) {
            case 'COMPLAINT': return 'badge-danger';
            case 'CANCELLATION': return 'badge-warning';
            case 'APPEAL': return 'badge-info';
            default: return 'badge-neutral';
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'COMPLAINT': return 'Keluhan';
            case 'CANCELLATION': return 'Pembatalan';
            case 'APPEAL': return 'Sanggahan';
            default: return type;
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'COMPLAINT': return <AlertTriangle className="w-4 h-4" />;
            case 'CANCELLATION': return <XCircle className="w-4 h-4" />;
            case 'APPEAL': return <ShieldAlert className="w-4 h-4" />;
            default: return <MessageSquare className="w-4 h-4" />;
        }
    };

    const getStatusBadge = (msg: Message) => {
        if (msg.type !== 'APPEAL') return null;
        switch (msg.status) {
            case 'APPROVED': return <span className="badge badge-success flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Disetujui</span>;
            case 'REJECTED': return <span className="badge badge-danger flex items-center gap-1"><ShieldX className="w-3 h-3" /> Ditolak</span>;
            case 'PENDING': return <span className="badge badge-warning flex items-center gap-1"><Clock className="w-3 h-3" /> Menunggu</span>;
            default: return null;
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-warning to-orange-500 flex items-center justify-center shadow-glow">
                        <MessageSquare className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-title-1 text-white">Pesan</h1>
                        <p className="text-white/50">Keluhan makanan & alasan pembatalan</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={loadMessages} className="btn-secondary flex items-center gap-2">
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={isExporting || messages.length === 0}
                        className="btn-primary flex items-center gap-2"
                    >
                        <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
                        {isExporting ? 'Mengekspor...' : 'Export XLSX'}
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="card">
                <div className="flex items-center gap-3 mb-4">
                    <Filter className="w-5 h-5 text-primary-400" />
                    <h2 className="text-lg font-semibold text-white">Filter</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                        <label className="block text-sm text-white/60 mb-2">Tipe Pesan</label>
                        <select
                            value={typeFilter}
                            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                            className="input-field w-full"
                        >
                            <option value="">Semua Tipe</option>
                            <option value="COMPLAINT">Keluhan</option>
                            <option value="CANCELLATION">Pembatalan</option>
                            <option value="APPEAL">Sanggahan</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-white/60 mb-2">Shift</label>
                        <select
                            value={shiftFilter}
                            onChange={(e) => { setShiftFilter(e.target.value); setPage(1); }}
                            className="input-field w-full"
                        >
                            <option value="">Semua Shift</option>
                            {shifts.map((shift) => (
                                <option key={shift.id} value={shift.id}>{shift.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-white/60 mb-2">Dari Tanggal</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                            className="input-field w-full"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-white/60 mb-2">Sampai Tanggal</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                            className="input-field w-full"
                        />
                    </div>
                    <div className="flex items-end">
                        <button onClick={clearFilters} className="btn-secondary w-full">
                            Reset Filter
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Total Pesan</p>
                            <p className="text-2xl font-bold mt-1 text-white">{total}</p>
                        </div>
                        <div className="stat-icon bg-gradient-to-br from-primary-500 to-accent-purple">
                            <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Keluhan</p>
                            <p className="text-2xl font-bold mt-1 text-danger">
                                {messages.filter(m => m.type === 'COMPLAINT').length}
                            </p>
                        </div>
                        <div className="stat-icon bg-gradient-to-br from-danger to-red-500">
                            <AlertTriangle className="w-5 h-5 text-white" />
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Pembatalan</p>
                            <p className="text-2xl font-bold mt-1 text-warning">
                                {messages.filter(m => m.type === 'CANCELLATION').length}
                            </p>
                        </div>
                        <div className="stat-icon bg-gradient-to-br from-warning to-orange-500">
                            <XCircle className="w-5 h-5 text-white" />
                        </div>
                    </div>
                </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Sanggahan</p>
                            <p className="text-2xl font-bold mt-1 text-info">
                                {messages.filter(m => m.type === 'APPEAL').length}
                            </p>
                        </div>
                        <div className="stat-icon bg-gradient-to-br from-info to-blue-500">
                            <ShieldAlert className="w-5 h-5 text-white" />
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Halaman</p>
                            <p className="text-2xl font-bold mt-1 text-white">{page} / {totalPages || 1}</p>
                        </div>
                        <div className="stat-icon bg-gradient-to-br from-info to-accent-cyan">
                            <Calendar className="w-5 h-5 text-white" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Messages Table */}
            <div className="card">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center py-16">
                        <MessageSquare className="w-16 h-16 text-white/20 mx-auto mb-4" />
                        <p className="text-white/40 text-lg">Tidak ada pesan</p>
                        <p className="text-white/30 text-sm mt-1">Coba ubah filter atau reset untuk melihat semua pesan</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left py-3 px-4 text-white/50 font-medium">Tipe</th>
                                        <th className="text-left py-3 px-4 text-white/50 font-medium">Karyawan</th>
                                        <th className="text-left py-3 px-4 text-white/50 font-medium">Perusahaan</th>
                                        <th className="text-left py-3 px-4 text-white/50 font-medium">Tanggal Order</th>
                                        <th className="text-left py-3 px-4 text-white/50 font-medium">Shift</th>
                                        <th className="text-left py-3 px-4 text-white/50 font-medium">Pesan</th>
                                        <th className="text-left py-3 px-4 text-white/50 font-medium">Status</th>
                                        <th className="text-left py-3 px-4 text-white/50 font-medium">Waktu Kirim</th>
                                        <th className="text-left py-3 px-4 text-white/50 font-medium">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {messages.map((msg) => (
                                        <tr key={msg.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="py-4 px-4">
                                                <span className={`badge ${getTypeBadge(msg.type)} flex items-center gap-1.5 w-fit`}>
                                                    {getTypeIcon(msg.type)}
                                                    {getTypeLabel(msg.type)}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div>
                                                    <p className="font-medium text-white">{msg.user.name}</p>
                                                    <p className="text-xs text-white/40">{msg.user.externalId}</p>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="w-4 h-4 text-white/40" />
                                                    <div>
                                                        <p className="text-white/70">{msg.user.company || '-'}</p>
                                                        <p className="text-xs text-white/40">{msg.user.department || '-'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-white/40" />
                                                    <span className="text-white/70">
                                                        {format(new Date(msg.orderDate), 'dd MMM yyyy', { locale: id })}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className="badge badge-info">{msg.shift.name}</span>
                                            </td>
                                            <td className="py-4 px-4 max-w-xs">
                                                <p className="text-white/80 line-clamp-2">{msg.content}</p>
                                                {msg.type === 'APPEAL' && msg.photoUrl && (
                                                    <button
                                                        onClick={() => setPreviewPhoto(msg.photoUrl!)}
                                                        className="mt-1 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                                    >
                                                        <Eye className="w-3 h-3" /> Lihat Bukti Foto
                                                    </button>
                                                )}
                                            </td>
                                            <td className="py-4 px-4">
                                                {getStatusBadge(msg) || <span className="text-white/30">-</span>}
                                                {msg.resolvedBy && (
                                                    <p className="text-xs text-white/40 mt-1">oleh {msg.resolvedBy}</p>
                                                )}
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="flex items-center gap-2 text-white/50">
                                                    <Clock className="w-4 h-4" />
                                                    <span className="text-sm">
                                                        {formatDateTimeShortWIB(msg.createdAt)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                {msg.type === 'APPEAL' && msg.status === 'PENDING' ? (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => handleResolve(msg.id, 'APPROVED')}
                                                            disabled={resolvingId === msg.id}
                                                            className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                                                            title="Setujui"
                                                        >
                                                            {resolvingId === msg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                                        </button>
                                                        <button
                                                            onClick={() => handleResolve(msg.id, 'REJECTED')}
                                                            disabled={resolvingId === msg.id}
                                                            className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                                            title="Tolak"
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-white/20">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                                <p className="text-sm text-white/50">
                                    Menampilkan {(page - 1) * 20 + 1} - {Math.min(page * 20, total)} dari {total} pesan
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
                                    >
                                        Sebelumnya
                                    </button>
                                    <span className="text-white/60 px-3">
                                        {page} / {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
                                    >
                                        Selanjutnya
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>

            {/* Photo Preview Modal */}
            {previewPhoto && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setPreviewPhoto(null)}
                    />
                    <div className="relative max-w-2xl max-h-[80vh] animate-fade-in">
                        <button
                            onClick={() => setPreviewPhoto(null)}
                            className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-slate-100 z-10"
                        >
                            <X className="w-4 h-4 text-slate-600" />
                        </button>
                        <img
                            src={previewPhoto}
                            alt="Bukti Sanggahan"
                            className="rounded-xl shadow-2xl max-h-[75vh] object-contain"
                        />
                    </div>
                </div>
            )}
    </div>
    );
}
