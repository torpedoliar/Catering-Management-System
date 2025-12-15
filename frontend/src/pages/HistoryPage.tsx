import { useState, useEffect, useCallback } from 'react';
import { api } from '../contexts/AuthContext';
import { useSSERefresh, ORDER_EVENTS } from '../contexts/SSEContext';
import { format } from 'date-fns';
import { formatDateTimeShortWIB } from '../utils/timezone';
import { Calendar, ChevronLeft, ChevronRight, Loader2, X, CheckCircle, XCircle, Clock, Ban, History, MessageSquare, Send } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';

interface Order {
    id: string;
    orderDate: string;
    orderTime: string;
    status: string;
    checkInTime: string | null;
    qrCode: string;
    shift: {
        id: string;
        name: string;
        startTime: string;
        endTime: string;
    };
}

export default function HistoryPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    // Cancel modal states
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);

    // Complaint modal states
    const [showComplaintModal, setShowComplaintModal] = useState(false);
    const [complaintContent, setComplaintContent] = useState('');
    const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);
    const [orderToComplain, setOrderToComplain] = useState<Order | null>(null);

    const loadOrders = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ page: page.toString(), limit: '10' });
            if (statusFilter) params.append('status', statusFilter);

            const res = await api.get(`/api/orders/my-orders?${params}`);
            setOrders(res.data.orders);
            setTotalPages(res.data.pagination.totalPages);
        } catch (error) {
            console.error('Failed to load orders:', error);
        } finally {
            setIsLoading(false);
        }
    }, [page, statusFilter]);

    useEffect(() => {
        loadOrders();
    }, [loadOrders]);

    useSSERefresh(ORDER_EVENTS, loadOrders);

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'PICKED_UP':
                return {
                    icon: <CheckCircle className="w-5 h-5" />,
                    label: 'Sudah Diambil',
                    class: 'bg-emerald-50 text-emerald-600',
                    bgClass: 'bg-emerald-50',
                    iconClass: 'text-emerald-600'
                };
            case 'ORDERED':
                return {
                    icon: <Clock className="w-5 h-5" />,
                    label: 'Menunggu',
                    class: 'bg-blue-50 text-blue-600',
                    bgClass: 'bg-blue-50',
                    iconClass: 'text-blue-600'
                };
            case 'NO_SHOW':
                return {
                    icon: <XCircle className="w-5 h-5" />,
                    label: 'Tidak Diambil',
                    class: 'bg-red-50 text-red-600',
                    bgClass: 'bg-red-50',
                    iconClass: 'text-red-600'
                };
            case 'CANCELLED':
                return {
                    icon: <Ban className="w-5 h-5" />,
                    label: 'Dibatalkan',
                    class: 'bg-amber-50 text-amber-600',
                    bgClass: 'bg-amber-50',
                    iconClass: 'text-amber-600'
                };
            default:
                return {
                    icon: <Clock className="w-5 h-5" />,
                    label: status,
                    class: 'bg-slate-100 text-slate-600',
                    bgClass: 'bg-slate-100',
                    iconClass: 'text-slate-500'
                };
        }
    };

    const filterOptions = [
        { value: '', label: 'Semua' },
        { value: 'PICKED_UP', label: 'Diambil' },
        { value: 'ORDERED', label: 'Pending' },
        { value: 'NO_SHOW', label: 'No-Show' },
        { value: 'CANCELLED', label: 'Batal' },
    ];

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <History className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-[#1a1f37]">Riwayat Pesanan</h1>
                        <p className="text-slate-500">Lihat semua pesanan Anda</p>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 p-1.5 bg-slate-100 rounded-2xl">
                    {filterOptions.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => { setStatusFilter(option.value); setPage(1); }}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${statusFilter === option.value
                                ? 'bg-orange-500 text-white shadow-lg'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                                }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="card p-0 overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="text-center">
                            <Loader2 className="w-10 h-10 animate-spin text-orange-500 mx-auto" />
                            <p className="text-slate-400 mt-4">Memuat riwayat...</p>
                        </div>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                            <Calendar className="w-10 h-10 text-slate-300" />
                        </div>
                        <p className="text-slate-500 text-lg">Belum ada pesanan</p>
                        <p className="text-slate-400 text-sm mt-1">Riwayat pesanan Anda akan muncul di sini</p>
                    </div>
                ) : (
                    <>
                        {/* Order List */}
                        <div className="divide-y divide-slate-100">
                            {orders.map((order, index) => {
                                const statusConfig = getStatusConfig(order.status);
                                return (
                                    <div
                                        key={order.id}
                                        onClick={() => setSelectedOrder(order)}
                                        className="p-5 hover:bg-slate-50 transition-all cursor-pointer group"
                                        style={{ animationDelay: `${index * 50}ms` }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-2xl ${statusConfig.bgClass} flex items-center justify-center ${statusConfig.iconClass} group-hover:scale-110 transition-transform`}>
                                                    {statusConfig.icon}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-[#1a1f37]">
                                                        {format(new Date(order.orderDate), 'dd MMM yyyy')}
                                                    </p>
                                                    <p className="text-sm text-slate-500">
                                                        {order.shift.name} • {order.shift.startTime} - {order.shift.endTime}
                                                    </p>
                                                    <p className="text-xs text-slate-400 mt-0.5">
                                                        Dipesan: {formatDateTimeShortWIB(order.orderTime)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${statusConfig.class}`}>
                                                    {statusConfig.label}
                                                </span>
                                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-1 transition-all" />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                                <p className="text-sm text-slate-500">
                                    Halaman {page} dari {totalPages}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors"
                                    >
                                        <ChevronLeft className="w-5 h-5 text-slate-600" />
                                    </button>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors"
                                    >
                                        <ChevronRight className="w-5 h-5 text-slate-600" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Detail Modal */}
            {selectedOrder && (
                <div
                    className="modal-backdrop flex items-center justify-center p-4"
                    onClick={() => setSelectedOrder(null)}
                >
                    <div
                        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-100">
                            <div>
                                <h3 className="text-xl font-bold text-[#1a1f37]">Detail Pesanan</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    {format(new Date(selectedOrder.orderDate), 'EEEE, dd MMMM yyyy')}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedOrder(null)}
                                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6">
                            {/* QR Code for active orders */}
                            {selectedOrder.status === 'ORDERED' && selectedOrder.qrCode && (
                                <div className="qr-container mx-auto mb-6">
                                    <QRCodeSVG
                                        value={selectedOrder.qrCode}
                                        size={180}
                                        level="H"
                                        includeMargin
                                    />
                                </div>
                            )}

                            {/* Status icon for past orders */}
                            {selectedOrder.status !== 'ORDERED' && (
                                <div className="flex justify-center mb-6">
                                    <div className={`w-24 h-24 rounded-full flex items-center justify-center ${getStatusConfig(selectedOrder.status).bgClass}`}>
                                        <div className={`w-12 h-12 ${getStatusConfig(selectedOrder.status).iconClass}`}>
                                            {getStatusConfig(selectedOrder.status).icon}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Details */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                    <span className="text-slate-500">Shift</span>
                                    <span className="font-medium text-[#1a1f37]">{selectedOrder.shift.name}</span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                    <span className="text-slate-500">Waktu Shift</span>
                                    <span className="font-medium text-[#1a1f37]">
                                        {selectedOrder.shift.startTime} - {selectedOrder.shift.endTime}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                    <span className="text-slate-500">Waktu Pesan</span>
                                    <span className="font-medium text-[#1a1f37]">
                                        {formatDateTimeShortWIB(selectedOrder.orderTime)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                    <span className="text-slate-500">Status</span>
                                    <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${getStatusConfig(selectedOrder.status).class}`}>
                                        {getStatusConfig(selectedOrder.status).label}
                                    </span>
                                </div>
                                {selectedOrder.checkInTime && (
                                    <div className="flex justify-between items-center py-3">
                                        <span className="text-slate-500">Waktu Ambil</span>
                                        <span className="font-medium text-[#1a1f37]">
                                            {formatDateTimeShortWIB(selectedOrder.checkInTime)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-slate-100 space-y-3">
                            {/* Complaint Button - only for PICKED_UP orders */}
                            {selectedOrder.status === 'PICKED_UP' && (
                                <button
                                    onClick={() => {
                                        setOrderToComplain(selectedOrder);
                                        setComplaintContent('');
                                        setShowComplaintModal(true);
                                    }}
                                    className="btn-secondary w-full flex items-center justify-center gap-2"
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    Kirim Komplain
                                </button>
                            )}

                            {/* Cancel Button - only for ORDERED status */}
                            {selectedOrder.status === 'ORDERED' && (
                                <button
                                    onClick={() => {
                                        setOrderToCancel(selectedOrder);
                                        setCancelReason('');
                                        setShowCancelModal(true);
                                    }}
                                    className="btn-danger w-full"
                                >
                                    Batalkan Pesanan
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Modal */}
            {showCancelModal && orderToCancel && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => setShowCancelModal(false)}
                    />
                    <div className="relative bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
                                <XCircle className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-[#1a1f37]">Batalkan Pesanan</h3>
                                <p className="text-sm text-slate-500">Masukkan alasan pembatalan</p>
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-600 mb-2">
                                Alasan Pembatalan <span className="text-red-600">*</span>
                            </label>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Contoh: Ada rapat mendadak di luar kantor"
                                className="input-field w-full min-h-[100px] resize-none"
                                autoFocus
                            />
                            <p className="text-xs text-slate-400 mt-2">
                                Alasan ini akan dicatat dan dapat dilihat oleh admin
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCancelModal(false)}
                                className="btn-secondary flex-1"
                                disabled={isCancelling}
                            >
                                Batal
                            </button>
                            <button
                                onClick={async () => {
                                    if (!cancelReason.trim()) {
                                        toast.error('Alasan pembatalan harus diisi');
                                        return;
                                    }
                                    setIsCancelling(true);
                                    try {
                                        await api.post(`/api/orders/${orderToCancel.id}/cancel`, { reason: cancelReason.trim() });
                                        toast.success('Pesanan dibatalkan');
                                        setShowCancelModal(false);
                                        setSelectedOrder(null);
                                        setOrderToCancel(null);
                                        setCancelReason('');
                                        loadOrders();
                                    } catch (error: any) {
                                        toast.error(error.response?.data?.error || 'Gagal membatalkan');
                                    } finally {
                                        setIsCancelling(false);
                                    }
                                }}
                                disabled={!cancelReason.trim() || isCancelling}
                                className="btn-danger flex-1 flex items-center justify-center gap-2"
                            >
                                {isCancelling ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Membatalkan...
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-4 h-4" />
                                        Batalkan Pesanan
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Complaint Modal */}
            {showComplaintModal && orderToComplain && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => setShowComplaintModal(false)}
                    />
                    <div className="relative bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
                                <MessageSquare className="w-6 h-6 text-amber-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-[#1a1f37]">Kirim Komplain</h3>
                                <p className="text-sm text-slate-500">
                                    {format(new Date(orderToComplain.orderDate), 'dd MMM yyyy')} • {orderToComplain.shift.name}
                                </p>
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-600 mb-2">
                                Isi Komplain <span className="text-red-600">*</span>
                            </label>
                            <textarea
                                value={complaintContent}
                                onChange={(e) => setComplaintContent(e.target.value)}
                                placeholder="Tuliskan komplain Anda tentang makanan, pelayanan, dll..."
                                className="input-field h-32 resize-none"
                                rows={4}
                            />
                            <p className="text-xs text-slate-400 mt-2">
                                Komplain akan diterima oleh admin dan diproses secepatnya.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowComplaintModal(false)}
                                className="btn-secondary flex-1"
                                disabled={isSubmittingComplaint}
                            >
                                Batal
                            </button>
                            <button
                                onClick={async () => {
                                    if (!complaintContent.trim()) {
                                        toast.error('Isi komplain harus diisi');
                                        return;
                                    }
                                    setIsSubmittingComplaint(true);
                                    try {
                                        // Need to get shiftId from order - use API that accepts orderId
                                        await api.post('/api/messages', {
                                            orderId: orderToComplain.id,
                                            shiftId: orderToComplain.shift.id,
                                            content: complaintContent.trim(),
                                            orderDate: orderToComplain.orderDate,
                                        });
                                        toast.success('Komplain berhasil dikirim');
                                        setShowComplaintModal(false);
                                        setSelectedOrder(null);
                                        setOrderToComplain(null);
                                        setComplaintContent('');
                                    } catch (error: any) {
                                        toast.error(error.response?.data?.error || 'Gagal mengirim komplain');
                                    } finally {
                                        setIsSubmittingComplaint(false);
                                    }
                                }}
                                disabled={!complaintContent.trim() || isSubmittingComplaint}
                                className="btn-primary flex-1 flex items-center justify-center gap-2"
                            >
                                {isSubmittingComplaint ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Mengirim...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        Kirim Komplain
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
