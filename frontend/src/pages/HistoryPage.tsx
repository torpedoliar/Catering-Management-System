import { useState, useEffect, useCallback } from 'react';
import { api } from '../contexts/AuthContext';
import { useSSERefresh, ORDER_EVENTS } from '../contexts/SSEContext';
import { format } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, Loader2, X, CheckCircle, XCircle, Clock, Ban, History, Sparkles } from 'lucide-react';
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
                    class: 'badge-success',
                    bgClass: 'bg-success/20',
                    iconClass: 'text-success'
                };
            case 'ORDERED':
                return { 
                    icon: <Clock className="w-5 h-5" />, 
                    label: 'Menunggu',
                    class: 'badge-info',
                    bgClass: 'bg-info/20',
                    iconClass: 'text-info'
                };
            case 'NO_SHOW':
                return { 
                    icon: <XCircle className="w-5 h-5" />, 
                    label: 'Tidak Diambil',
                    class: 'badge-danger',
                    bgClass: 'bg-danger/20',
                    iconClass: 'text-danger'
                };
            case 'CANCELLED':
                return { 
                    icon: <Ban className="w-5 h-5" />, 
                    label: 'Dibatalkan',
                    class: 'badge-warning',
                    bgClass: 'bg-warning/20',
                    iconClass: 'text-warning'
                };
            default:
                return { 
                    icon: <Clock className="w-5 h-5" />, 
                    label: status,
                    class: 'badge-neutral',
                    bgClass: 'bg-white/10',
                    iconClass: 'text-white/60'
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
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center shadow-glow">
                        <History className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-title-1 text-white">Riwayat Pesanan</h1>
                        <p className="text-white/50">Lihat semua pesanan Anda</p>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 p-1.5 bg-white/5 rounded-2xl border border-white/10">
                    {filterOptions.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => { setStatusFilter(option.value); setPage(1); }}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                                statusFilter === option.value
                                    ? 'bg-gradient-to-r from-primary-500 to-accent-purple text-white shadow-lg'
                                    : 'text-white/60 hover:text-white hover:bg-white/5'
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
                            <Loader2 className="w-10 h-10 animate-spin text-primary-500 mx-auto" />
                            <p className="text-white/40 mt-4">Memuat riwayat...</p>
                        </div>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                            <Calendar className="w-10 h-10 text-white/30" />
                        </div>
                        <p className="text-white/50 text-lg">Belum ada pesanan</p>
                        <p className="text-white/30 text-sm mt-1">Riwayat pesanan Anda akan muncul di sini</p>
                    </div>
                ) : (
                    <>
                        {/* Order List */}
                        <div className="divide-y divide-white/5">
                            {orders.map((order, index) => {
                                const statusConfig = getStatusConfig(order.status);
                                return (
                                    <div
                                        key={order.id}
                                        onClick={() => setSelectedOrder(order)}
                                        className="p-5 hover:bg-white/5 transition-all cursor-pointer group"
                                        style={{ animationDelay: `${index * 50}ms` }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-2xl ${statusConfig.bgClass} flex items-center justify-center ${statusConfig.iconClass} group-hover:scale-110 transition-transform`}>
                                                    {statusConfig.icon}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-white">
                                                        {format(new Date(order.orderDate), 'dd MMM yyyy')}
                                                    </p>
                                                    <p className="text-sm text-white/50">
                                                        {order.shift.name} • {order.shift.startTime} - {order.shift.endTime}
                                                    </p>
                                                    <p className="text-xs text-white/30 mt-0.5">
                                                        Dipesan: {format(new Date(order.orderTime), 'dd MMM yyyy, HH:mm')}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className={`badge ${statusConfig.class}`}>
                                                    {statusConfig.label}
                                                </span>
                                                <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/60 group-hover:translate-x-1 transition-all" />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-white/2">
                                <p className="text-sm text-white/40">
                                    Halaman {page} dari {totalPages}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="btn-icon disabled:opacity-30"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="btn-icon disabled:opacity-30"
                                    >
                                        <ChevronRight className="w-5 h-5" />
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
                        className="modal-content w-full max-w-md"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/10">
                            <div>
                                <h3 className="text-xl font-bold text-white">Detail Pesanan</h3>
                                <p className="text-sm text-white/50 mt-1">
                                    {format(new Date(selectedOrder.orderDate), 'EEEE, dd MMMM yyyy')}
                                </p>
                            </div>
                            <button 
                                onClick={() => setSelectedOrder(null)} 
                                className="btn-icon"
                            >
                                <X className="w-5 h-5" />
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
                                <div className="flex justify-between items-center py-3 border-b border-white/5">
                                    <span className="text-white/50">Shift</span>
                                    <span className="font-medium text-white">{selectedOrder.shift.name}</span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-white/5">
                                    <span className="text-white/50">Waktu Shift</span>
                                    <span className="font-medium text-white">
                                        {selectedOrder.shift.startTime} - {selectedOrder.shift.endTime}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-white/5">
                                    <span className="text-white/50">Waktu Pesan</span>
                                    <span className="font-medium text-white">
                                        {format(new Date(selectedOrder.orderTime), 'dd MMM yyyy, HH:mm')}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-white/5">
                                    <span className="text-white/50">Status</span>
                                    <span className={`badge ${getStatusConfig(selectedOrder.status).class}`}>
                                        {getStatusConfig(selectedOrder.status).label}
                                    </span>
                                </div>
                                {selectedOrder.checkInTime && (
                                    <div className="flex justify-between items-center py-3">
                                        <span className="text-white/50">Waktu Ambil</span>
                                        <span className="font-medium text-white">
                                            {format(new Date(selectedOrder.checkInTime), 'dd MMM yyyy, HH:mm')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        {selectedOrder.status === 'ORDERED' && (
                            <div className="p-6 border-t border-white/10">
                                <button
                                    onClick={async () => {
                                        try {
                                            await api.post(`/api/orders/${selectedOrder.id}/cancel`);
                                            toast.success('Pesanan dibatalkan');
                                            setSelectedOrder(null);
                                            loadOrders();
                                        } catch (error: any) {
                                            toast.error(error.response?.data?.error || 'Gagal membatalkan');
                                        }
                                    }}
                                    className="btn-danger w-full"
                                >
                                    Batalkan Pesanan
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
