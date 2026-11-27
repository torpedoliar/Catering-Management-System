import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../contexts/AuthContext';
import { useSSERefresh, ORDER_EVENTS } from '../contexts/SSEContext';
import { formatDateTimeShortWIB } from '../utils/timezone';
import { getLocalDateString, addDays, formatOrderDate } from '../utils/dateHelpers';
import {
    Clock,
    ShieldAlert,
    ShieldCheck,
    ShieldX,
    Upload,
    X,
} from 'lucide-react';
import OrderBarcode from '../components/OrderBarcode';
import toast from 'react-hot-toast';
import {
    Button,
    Card,
    PageHeader,
    OrderStatusBadge,
    Tabs,
    Pagination,
    EmptyState,
    SkeletonTable,
    Modal,
    Textarea,
    Badge,
} from '../components/ui';

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
        breakStartTime?: string | null;
        breakEndTime?: string | null;
    };
    canteen?: {
        id: string;
        name: string;
        location: string | null;
    };
    messages?: {
        id: string;
        status: string;
        content: string;
        photoUrl: string | null;
        resolvedBy: string | null;
        resolvedAt: string | null;
        createdAt: string;
    }[];
}

const DOW_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

function getOrderDateMeta(isoDate: string) {
    const key = formatOrderDate(isoDate);
    const [y, m, d] = key.split('-').map(Number);
    if (!y || !m || !d) return { mon: '-', day: '-', dow: '-', full: key };
    const dt = new Date(y, m - 1, d);
    return {
        mon: MONTH_SHORT[m - 1] || '-',
        day: String(d),
        dow: DOW_LONG[dt.getDay()] || '-',
        full: `${DOW_LONG[dt.getDay()]}, ${d} ${MONTH_SHORT[m - 1]} ${y}`,
    };
}

function getPeriodRange(period: '3m' | 'month' | 'all'): { startDate?: string; endDate?: string } {
    if (period === 'all') return {};
    const today = getLocalDateString();
    if (period === 'month') {
        return { startDate: `${today.slice(0, 7)}-01` };
    }
    // 3 bulan terakhir (~90 hari)
    return { startDate: addDays(today, -90) };
}

export default function HistoryPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const deepLinkOrderId = searchParams.get('id');

    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1));
    const [limit, setLimit] = useState(() => parseInt(searchParams.get('limit') || '8', 10) || 8);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [statusFilter, setStatusFilter] = useState('');
    const [period, setPeriod] = useState<'3m' | 'month' | 'all'>('3m');
    const [counts, setCounts] = useState<Record<string, number>>({});

    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const deepLinkConsumed = useRef(false);

    // Modals
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);

    const [showComplaintModal, setShowComplaintModal] = useState(false);
    const [complaintContent, setComplaintContent] = useState('');
    const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);
    const [orderToComplain, setOrderToComplain] = useState<Order | null>(null);

    const [showAppealModal, setShowAppealModal] = useState(false);
    const [appealContent, setAppealContent] = useState('');
    const [appealPhoto, setAppealPhoto] = useState<File | null>(null);
    const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
    const [orderToAppeal, setOrderToAppeal] = useState<Order | null>(null);

    const syncPaginationUrl = useCallback(
        (nextPage: number, nextLimit: number) => {
            const next = new URLSearchParams(searchParams);
            next.set('page', String(nextPage));
            next.set('limit', String(nextLimit));
            setSearchParams(next, { replace: true });
        },
        [searchParams, setSearchParams]
    );

    const loadOrders = useCallback(async () => {
        setIsLoading(true);
        try {
            const range = getPeriodRange(period);
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
            });
            if (statusFilter) params.append('status', statusFilter);
            if (range.startDate) params.append('startDate', range.startDate);
            if (range.endDate) params.append('endDate', range.endDate);

            const res = await api.get(`/api/orders/my-orders?${params}`);
            setOrders(res.data.orders || []);
            setTotal(res.data.pagination?.total ?? 0);
            setTotalPages(res.data.pagination?.totalPages ?? 1);
        } catch (error) {
            console.error('Failed to load orders:', error);
            toast.error('Gagal memuat riwayat pesanan');
        } finally {
            setIsLoading(false);
        }
    }, [page, limit, statusFilter, period]);

    const loadCounts = useCallback(async () => {
        try {
            const range = getPeriodRange(period);
            const statuses = ['', 'ORDERED', 'PICKED_UP', 'NO_SHOW', 'CANCELLED'];
            const responses = await Promise.all(
                statuses.map((st) => {
                    const p = new URLSearchParams({ page: '1', limit: '1' });
                    if (st) p.append('status', st);
                    if (range.startDate) p.append('startDate', range.startDate);
                    return api.get(`/api/orders/my-orders?${p}`);
                })
            );
            const nextCounts: Record<string, number> = {};
            statuses.forEach((st, idx) => {
                nextCounts[st] = responses[idx].data?.pagination?.total ?? 0;
            });
            setCounts(nextCounts);
        } catch {
            // non-fatal
        }
    }, [period]);

    useEffect(() => {
        loadOrders();
    }, [loadOrders]);

    useEffect(() => {
        loadCounts();
    }, [loadCounts]);

    useSSERefresh(ORDER_EVENTS, () => {
        loadOrders();
        loadCounts();
    });

    // FE-NOTIF-NAV deep link support
    useEffect(() => {
        if (deepLinkConsumed.current || !deepLinkOrderId || isLoading) return;
        const match = orders.find((o) => o.id === deepLinkOrderId);
        if (match) {
            setSelectedOrder(match);
            deepLinkConsumed.current = true;
            const next = new URLSearchParams(searchParams);
            next.delete('id');
            setSearchParams(next, { replace: true });
        }
    }, [deepLinkOrderId, isLoading, orders, searchParams, setSearchParams]);

    useEffect(() => {
        if (deepLinkConsumed.current || !deepLinkOrderId || isLoading) return;
        const onPage = orders.some((o) => o.id === deepLinkOrderId);
        if (!onPage && page < totalPages && page < 5) {
            setPage((p) => p + 1);
        }
    }, [deepLinkOrderId, isLoading, orders, page, totalPages]);

    const isCancelLocked = (order: Order) => {
        const orderKey = formatOrderDate(order.orderDate);
        const todayKey = getLocalDateString();
        if (orderKey !== todayKey) return orderKey < todayKey;
        const now = new Date();
        const [startHour, startMin] = order.shift.startTime.split(':').map(Number);
        const shiftStart = new Date(now);
        shiftStart.setHours(startHour, startMin, 0, 0);
        return now.getTime() >= shiftStart.getTime();
    };

    const isAppealExpired = (orderDateIso: string) => {
        const orderKey = formatOrderDate(orderDateIso);
        const todayKey = getLocalDateString();
        const diffDays = (Date.parse(todayKey) - Date.parse(orderKey)) / 86_400_000;
        return diffDays > 7;
    };

    const tabItems = [
        { id: '', label: 'Semua', count: counts[''] },
        { id: 'ORDERED', label: 'Menunggu', count: counts['ORDERED'] },
        { id: 'PICKED_UP', label: 'Diambil', count: counts['PICKED_UP'] },
        { id: 'NO_SHOW', label: 'Tidak diambil', count: counts['NO_SHOW'] },
        { id: 'CANCELLED', label: 'Dibatalkan', count: counts['CANCELLED'] },
    ];

    return (
        <div className="max-w-[1080px] w-full flex flex-col gap-[18px]">
            <PageHeader
                title="Riwayat pesanan"
                subtitle={`${(counts[''] ?? total).toLocaleString('id-ID')} pesanan`}
                actions={
                    <label className="flex items-center gap-2 h-[38px] border border-[#e7e5e4] rounded-[10px] px-3 bg-[#fff] text-[13px] text-[#57534e]">
                        <span>Periode</span>
                        <select
                            aria-label="Periode riwayat"
                            value={period}
                            onChange={(e) => {
                                setPeriod(e.target.value as '3m' | 'month' | 'all');
                                setPage(1);
                                syncPaginationUrl(1, limit);
                            }}
                            className="border-0 outline-none font-semibold text-[#1c1917] bg-transparent cursor-pointer"
                        >
                            <option value="3m">3 bulan terakhir</option>
                            <option value="month">Bulan ini</option>
                            <option value="all">Semua</option>
                        </select>
                    </label>
                }
            />

            <Tabs
                ariaLabel="Status pesanan"
                items={tabItems}
                value={statusFilter}
                onChange={(val) => {
                    setStatusFilter(val);
                    setPage(1);
                    syncPaginationUrl(1, limit);
                }}
            />

            <Card padding="none" className="overflow-hidden">
                {isLoading ? (
                    <SkeletonTable rows={6} cols={4} />
                ) : orders.length === 0 ? (
                    <EmptyState
                        title="Tidak ada pesanan dengan status ini"
                        description="Coba pilih status lain atau ubah periode."
                    />
                ) : (
                    <div className="divide-y divide-[#f5f5f4]">
                        {orders.map((order) => {
                            const meta = getOrderDateMeta(order.orderDate);
                            const appeal = order.messages?.[0];
                            const canCancel = order.status === 'ORDERED' && !isCancelLocked(order);
                            const canAppeal =
                                order.status === 'NO_SHOW' &&
                                !appeal &&
                                !isAppealExpired(order.orderDate);

                            return (
                                <div
                                    key={order.id}
                                    className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-[#fafaf9] transition-colors"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setSelectedOrder(order)}
                                        className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] rounded-[8px]"
                                    >
                                        <div className="w-[52px] text-center flex-shrink-0">
                                            <div className="text-[11px] font-bold text-[#78716c] uppercase">
                                                {meta.mon}
                                            </div>
                                            <div className="text-[22px] font-extrabold leading-[1.1] text-[#1c1917] tabular-nums">
                                                {meta.day}
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-[14px] text-[#1c1917] truncate">
                                                {meta.dow} · {order.shift.name}
                                            </div>
                                            <div className="text-[12.5px] text-[#78716c] mt-0.5 truncate">
                                                Istirahat{' '}
                                                {order.shift.breakStartTime && order.shift.breakEndTime
                                                    ? `${order.shift.breakStartTime}–${order.shift.breakEndTime}`
                                                    : `${order.shift.startTime}–${order.shift.endTime}`}
                                                {order.canteen ? ` · Kantin ${order.canteen.name}` : ''}
                                            </div>
                                        </div>
                                    </button>

                                    <div className="flex items-center gap-2 sm:gap-3 ml-auto">
                                        {order.status === 'NO_SHOW' && appeal && (
                                            <Badge
                                                variant={
                                                    appeal.status === 'APPROVED'
                                                        ? 'success'
                                                        : appeal.status === 'REJECTED'
                                                            ? 'danger'
                                                            : 'warning'
                                                }
                                            >
                                                {appeal.status === 'APPROVED'
                                                    ? 'Sanggah diterima'
                                                    : appeal.status === 'REJECTED'
                                                        ? 'Sanggah ditolak'
                                                        : 'Sanggah diproses'}
                                            </Badge>
                                        )}
                                        <OrderStatusBadge status={order.status} />

                                        <div className="w-auto sm:w-[140px] text-right">
                                            {canCancel && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setOrderToCancel(order);
                                                        setCancelReason('');
                                                        setShowCancelModal(true);
                                                    }}
                                                    className="text-[13px] font-semibold text-[#b45309] hover:text-[#92400e] bg-transparent border-0 cursor-pointer p-1"
                                                >
                                                    Batalkan
                                                </button>
                                            )}
                                            {canAppeal && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setOrderToAppeal(order);
                                                        setAppealContent('');
                                                        setAppealPhoto(null);
                                                        setShowAppealModal(true);
                                                    }}
                                                    className="text-[13px] font-semibold text-[#b45309] hover:text-[#92400e] bg-transparent border-0 cursor-pointer p-1"
                                                >
                                                    Ajukan sanggahan
                                                </button>
                                            )}
                                            {order.status === 'PICKED_UP' && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setOrderToComplain(order);
                                                        setComplaintContent('');
                                                        setShowComplaintModal(true);
                                                    }}
                                                    className="text-[13px] font-semibold text-[#78716c] hover:text-[#1c1917] bg-transparent border-0 cursor-pointer p-1"
                                                >
                                                    Kirim komplain
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <Pagination
                    variant="user"
                    page={page}
                    limit={limit}
                    total={total}
                    onPageChange={(nextPage) => {
                        setPage(nextPage);
                        syncPaginationUrl(nextPage, limit);
                    }}
                    onLimitChange={(nextLimit) => {
                        setLimit(nextLimit);
                        setPage(1);
                        syncPaginationUrl(1, nextLimit);
                    }}
                />
            </Card>

            {/* Detail Modal */}
            <Modal
                open={!!selectedOrder}
                onClose={() => setSelectedOrder(null)}
                title="Detail pesanan"
                description={selectedOrder ? getOrderDateMeta(selectedOrder.orderDate).full : undefined}
                size="sm"
            >
                {selectedOrder && (
                    <div className="space-y-4">
                        {selectedOrder.status === 'ORDERED' && selectedOrder.qrCode && (
                            <div className="bg-[#fff] border border-[#e7e5e4] rounded-[12px] p-3">
                                <OrderBarcode value={selectedOrder.qrCode} />
                            </div>
                        )}

                        <dl className="m-0 divide-y divide-[#f5f5f4] text-[13.5px]">
                            <div className="flex justify-between py-2.5">
                                <dt className="text-[#78716c]">Shift</dt>
                                <dd className="m-0 font-semibold text-[#1c1917]">{selectedOrder.shift.name}</dd>
                            </div>
                            <div className="flex justify-between py-2.5">
                                <dt className="text-[#78716c]">Waktu shift</dt>
                                <dd className="m-0 font-semibold text-[#1c1917] tabular-nums">
                                    {selectedOrder.shift.startTime}–{selectedOrder.shift.endTime}
                                </dd>
                            </div>
                            {selectedOrder.canteen && (
                                <div className="flex justify-between py-2.5">
                                    <dt className="text-[#78716c]">Kantin</dt>
                                    <dd className="m-0 font-semibold text-[#1c1917]">{selectedOrder.canteen.name}</dd>
                                </div>
                            )}
                            <div className="flex justify-between py-2.5">
                                <dt className="text-[#78716c]">Waktu pesan</dt>
                                <dd className="m-0 font-semibold text-[#1c1917] tabular-nums">
                                    {formatDateTimeShortWIB(selectedOrder.orderTime)}
                                </dd>
                            </div>
                            <div className="flex justify-between items-center py-2.5">
                                <dt className="text-[#78716c]">Status</dt>
                                <dd className="m-0">
                                    <OrderStatusBadge status={selectedOrder.status} />
                                </dd>
                            </div>
                            {selectedOrder.checkInTime && (
                                <div className="flex justify-between py-2.5">
                                    <dt className="text-[#78716c]">Waktu ambil</dt>
                                    <dd className="m-0 font-semibold text-[#1c1917] tabular-nums">
                                        {formatDateTimeShortWIB(selectedOrder.checkInTime)}
                                    </dd>
                                </div>
                            )}
                        </dl>

                        {selectedOrder.status === 'NO_SHOW' && (() => {
                            const appeal = selectedOrder.messages?.[0];
                            if (appeal?.status === 'APPROVED') {
                                return (
                                    <div className="flex items-center gap-2.5 p-3 rounded-[10px] bg-[#dcfce7] text-[#166534] text-[13px]">
                                        <ShieldCheck className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                                        <span>Sanggahan disetujui oleh <b>{appeal.resolvedBy}</b>.</span>
                                    </div>
                                );
                            }
                            if (appeal?.status === 'REJECTED') {
                                return (
                                    <div className="flex items-center gap-2.5 p-3 rounded-[10px] bg-[#fee2e2] text-[#991b1b] text-[13px]">
                                        <ShieldX className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                                        <span>Sanggahan ditolak oleh <b>{appeal.resolvedBy}</b>.</span>
                                    </div>
                                );
                            }
                            if (appeal?.status === 'PENDING') {
                                return (
                                    <div className="flex items-center gap-2.5 p-3 rounded-[10px] bg-[#fef3c7] text-[#92400e] text-[13px]">
                                        <ShieldAlert className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                                        <span>Sanggahan sedang menunggu persetujuan admin.</span>
                                    </div>
                                );
                            }
                            if (isAppealExpired(selectedOrder.orderDate)) {
                                return (
                                    <div className="flex items-center gap-2.5 p-3 rounded-[10px] bg-[#f5f5f4] text-[#57534e] text-[13px]">
                                        <Clock className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                                        <span>Waktu pengajuan sanggahan (7 hari) telah habis.</span>
                                    </div>
                                );
                            }
                            return (
                                <Button
                                    variant="primary"
                                    className="w-full"
                                    onClick={() => {
                                        setOrderToAppeal(selectedOrder);
                                        setAppealContent('');
                                        setAppealPhoto(null);
                                        setShowAppealModal(true);
                                    }}
                                >
                                    Ajukan sanggahan
                                </Button>
                            );
                        })()}

                        {selectedOrder.status === 'PICKED_UP' && (
                            <Button
                                variant="secondary"
                                className="w-full"
                                onClick={() => {
                                    setOrderToComplain(selectedOrder);
                                    setComplaintContent('');
                                    setShowComplaintModal(true);
                                }}
                            >
                                Kirim komplain
                            </Button>
                        )}

                        {selectedOrder.status === 'ORDERED' && (
                            isCancelLocked(selectedOrder) ? (
                                <div className="flex items-center justify-center gap-2 p-3 rounded-[10px] bg-[#f5f5f4] text-[#57534e] text-[13px]">
                                    <Clock className="w-4 h-4" aria-hidden="true" />
                                    <span>Tidak bisa dibatalkan (shift berjalan)</span>
                                </div>
                            ) : (
                                <Button
                                    variant="danger"
                                    className="w-full"
                                    onClick={() => {
                                        setOrderToCancel(selectedOrder);
                                        setCancelReason('');
                                        setShowCancelModal(true);
                                    }}
                                >
                                    Batalkan pesanan
                                </Button>
                            )
                        )}
                    </div>
                )}
            </Modal>

            {/* Cancel Modal */}
            <Modal
                open={showCancelModal && !!orderToCancel}
                onClose={() => setShowCancelModal(false)}
                title="Batalkan pesanan"
                description="Masukkan alasan pembatalan"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowCancelModal(false)} disabled={isCancelling}>
                            Tutup
                        </Button>
                        <Button
                            variant="danger"
                            loading={isCancelling}
                            loadingText="Membatalkan…"
                            disabled={!cancelReason.trim()}
                            onClick={async () => {
                                if (!orderToCancel || !cancelReason.trim()) return;
                                setIsCancelling(true);
                                try {
                                    await api.post(`/api/orders/${orderToCancel.id}/cancel`, {
                                        reason: cancelReason.trim(),
                                    });
                                    toast.success('Pesanan dibatalkan');
                                    setShowCancelModal(false);
                                    setSelectedOrder(null);
                                    setOrderToCancel(null);
                                    setCancelReason('');
                                    loadOrders();
                                    loadCounts();
                                } catch (error: unknown) {
                                    const err = error as { response?: { data?: { error?: string } } };
                                    toast.error(err.response?.data?.error || 'Gagal membatalkan');
                                } finally {
                                    setIsCancelling(false);
                                }
                            }}
                        >
                            Batalkan pesanan
                        </Button>
                    </>
                }
            >
                <Textarea
                    label="Alasan pembatalan"
                    required
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Contoh: Ada rapat mendadak di luar kantor"
                    hint="Alasan ini akan dicatat dan dapat dilihat oleh admin."
                />
            </Modal>

            {/* Complaint Modal */}
            <Modal
                open={showComplaintModal && !!orderToComplain}
                onClose={() => setShowComplaintModal(false)}
                title="Kirim komplain"
                description={
                    orderToComplain
                        ? `${formatOrderDate(orderToComplain.orderDate)} · ${orderToComplain.shift.name}`
                        : undefined
                }
                size="sm"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setShowComplaintModal(false)}
                            disabled={isSubmittingComplaint}
                        >
                            Batal
                        </Button>
                        <Button
                            variant="primary"
                            loading={isSubmittingComplaint}
                            loadingText="Mengirim…"
                            disabled={!complaintContent.trim()}
                            onClick={async () => {
                                if (!orderToComplain || !complaintContent.trim()) return;
                                setIsSubmittingComplaint(true);
                                try {
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
                                } catch (error: unknown) {
                                    const err = error as { response?: { data?: { error?: string } } };
                                    toast.error(err.response?.data?.error || 'Gagal mengirim komplain');
                                } finally {
                                    setIsSubmittingComplaint(false);
                                }
                            }}
                        >
                            Kirim komplain
                        </Button>
                    </>
                }
            >
                <Textarea
                    label="Isi komplain"
                    required
                    value={complaintContent}
                    onChange={(e) => setComplaintContent(e.target.value)}
                    placeholder="Tuliskan keluhan Anda tentang makanan, pelayanan, atau lainnya…"
                    hint="Komplain akan diterima oleh admin."
                />
            </Modal>

            {/* Appeal Modal */}
            <Modal
                open={showAppealModal && !!orderToAppeal}
                onClose={() => setShowAppealModal(false)}
                title="Ajukan sanggahan"
                description={
                    orderToAppeal
                        ? `${formatOrderDate(orderToAppeal.orderDate)} · ${orderToAppeal.shift.name}`
                        : undefined
                }
                size="sm"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setShowAppealModal(false)}
                            disabled={isSubmittingAppeal}
                        >
                            Batal
                        </Button>
                        <Button
                            variant="primary"
                            loading={isSubmittingAppeal}
                            loadingText="Mengirim…"
                            disabled={!appealContent.trim()}
                            onClick={async () => {
                                if (!orderToAppeal || !appealContent.trim()) return;
                                setIsSubmittingAppeal(true);
                                try {
                                    const formData = new FormData();
                                    formData.append('orderId', orderToAppeal.id);
                                    formData.append('shiftId', orderToAppeal.shift.id);
                                    formData.append('content', appealContent.trim());
                                    formData.append('orderDate', orderToAppeal.orderDate);
                                    if (appealPhoto) formData.append('photo', appealPhoto);
                                    await api.post('/api/messages/appeal', formData, {
                                        headers: { 'Content-Type': 'multipart/form-data' },
                                    });
                                    toast.success('Sanggahan berhasil diajukan');
                                    setShowAppealModal(false);
                                    setSelectedOrder(null);
                                    setOrderToAppeal(null);
                                    setAppealContent('');
                                    setAppealPhoto(null);
                                    loadOrders();
                                    loadCounts();
                                } catch (error: unknown) {
                                    const err = error as { response?: { data?: { error?: string } } };
                                    toast.error(err.response?.data?.error || 'Gagal mengajukan sanggahan');
                                } finally {
                                    setIsSubmittingAppeal(false);
                                }
                            }}
                        >
                            Kirim sanggahan
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <Textarea
                        label="Alasan sanggahan"
                        required
                        value={appealContent}
                        onChange={(e) => setAppealContent(e.target.value)}
                        placeholder="Jelaskan alasan Anda tidak dapat mengambil pesanan…"
                    />
                    <div>
                        <label
                            htmlFor="appeal-photo-input"
                            className="block text-[12px] font-semibold text-[#44403c] mb-1.5"
                        >
                            Bukti foto (opsional)
                        </label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setAppealPhoto(e.target.files?.[0] || null)}
                            className="hidden"
                            id="appeal-photo-input"
                        />
                        <label
                            htmlFor="appeal-photo-input"
                            className="flex items-center gap-3 p-3.5 border border-dashed border-[#d6d3d1] rounded-[10px] cursor-pointer hover:border-[#f59e0b] hover:bg-[#fffbeb] transition-colors text-[13px] text-[#57534e]"
                        >
                            <Upload className="w-4 h-4 text-[#78716c]" aria-hidden="true" />
                            <span className="truncate">
                                {appealPhoto ? appealPhoto.name : 'Pilih foto bukti…'}
                            </span>
                        </label>
                        {appealPhoto && (
                            <div className="mt-2 relative inline-block">
                                <img
                                    src={URL.createObjectURL(appealPhoto)}
                                    alt="Preview bukti"
                                    className="w-20 h-20 object-cover rounded-[8px] border border-[#e7e5e4]"
                                />
                                <button
                                    type="button"
                                    aria-label="Hapus foto bukti"
                                    onClick={() => setAppealPhoto(null)}
                                    className="absolute -top-2 -right-2 w-5 h-5 bg-[#b91c1c] text-[#fff] rounded-full flex items-center justify-center border-0 cursor-pointer"
                                >
                                    <X className="w-3 h-3" aria-hidden="true" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
