import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
    Calendar,
    ArrowLeft,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Search,
    ListOrdered,
} from 'lucide-react';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, ORDER_EVENTS } from '../../contexts/SSEContext';
import { getLocalDateString, addDays, formatOrderTime } from '../../utils/dateHelpers';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    OrderStatusBadge,
    Pagination,
    EmptyState,
    Skeleton,
} from '../../components/ui';

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
}

interface Order {
    id: string;
    status: string;
    orderTime: string;
    orderDate: string;
    checkInTime: string | null;
    user: {
        id: string;
        name: string;
        externalId: string;
        company: string;
        department: string;
    };
    shift: Shift;
    canteen?: {
        id: string;
        name: string;
        location: string | null;
    };
}

interface ShiftState {
    page: number;
    search: string;
    statusFilter: string;
}

const ITEMS_PER_PAGE = 10;

function formatDateHeading(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    if (!y || !m || !d) return dateKey;
    return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

export default function OrderListPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [orders, setOrders] = useState<Order[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());
    const [shiftStates, setShiftStates] = useState<Record<string, ShiftState>>({});

    const [selectedDate, setSelectedDate] = useState(() => {
        return searchParams.get('date') || getLocalDateString();
    });

    useEffect(() => {
        setSearchParams({ date: selectedDate }, { replace: true });
    }, [selectedDate, setSearchParams]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [ordersRes, shiftsRes] = await Promise.all([
                api.get(`/api/orders?startDate=${selectedDate}&endDate=${selectedDate}&limit=500`),
                api.get('/api/shifts'),
            ]);

            setOrders(ordersRes.data.orders || []);
            const shiftsData = shiftsRes.data.shifts || [];
            const activeShifts = shiftsData.filter((s: Shift) => s.isActive);
            setShifts(activeShifts);

            // Auto-expand first active shift with orders so admin sees rows immediately
            setExpandedShifts((prev) => {
                if (prev.size > 0) return prev;
                if (activeShifts.length > 0) return new Set([activeShifts[0].id]);
                return prev;
            });
        } catch (error) {
            console.error('Failed to load orders:', error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useSSERefresh(ORDER_EVENTS, loadData);

    const toggleShift = (shiftId: string) => {
        setExpandedShifts((prev) => {
            const next = new Set(prev);
            if (next.has(shiftId)) next.delete(shiftId);
            else next.add(shiftId);
            return next;
        });
    };

    const getShiftState = (shiftId: string): ShiftState =>
        shiftStates[shiftId] || { page: 1, search: '', statusFilter: '' };

    const updateShiftState = (shiftId: string, updates: Partial<ShiftState>) => {
        setShiftStates((prev) => ({
            ...prev,
            [shiftId]: { ...(prev[shiftId] || { page: 1, search: '', statusFilter: '' }), ...updates },
        }));
    };

    const today = getLocalDateString();
    const tomorrow = addDays(today, 1);
    const dayAfterTomorrow = addDays(today, 2);

    const dynamicTitle =
        selectedDate === today
            ? 'Detail order hari ini'
            : selectedDate === tomorrow
                ? 'Detail order besok'
                : `Detail order ${selectedDate}`;

    const totalOrders = orders.filter((o) => o.status !== 'CANCELLED').length;

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title={dynamicTitle}
                subtitle={`${totalOrders} pesanan · ${formatDateHeading(selectedDate)}`}
                actions={
                    <>
                        <Link
                            to="/admin/dashboard"
                            className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] text-[13px] font-semibold bg-[#fff] hover:bg-[#fafaf9] text-[#1c1917] border border-[#e7e5e4] no-underline transition-colors"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                            Dashboard
                        </Link>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={loadData}
                            leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Muat ulang
                        </Button>
                    </>
                }
            />

            {/* Date Picker Bar */}
            <Card padding="sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px] font-semibold text-[#57534e] mr-1">Tanggal:</span>
                        {[
                            { key: today, label: 'Hari ini' },
                            { key: tomorrow, label: 'Besok' },
                            { key: dayAfterTomorrow, label: 'Lusa' },
                        ].map((d) => {
                            const active = selectedDate === d.key;
                            return (
                                <button
                                    key={d.key}
                                    type="button"
                                    onClick={() => setSelectedDate(d.key)}
                                    className={`h-8 px-3 rounded-[8px] text-[12.5px] font-semibold border cursor-pointer transition-colors ${
                                        active
                                            ? 'bg-[#f59e0b] text-[#1c1917] border-[#f59e0b]'
                                            : 'bg-[#fff] text-[#57534e] border-[#e7e5e4] hover:bg-[#fafaf9]'
                                    }`}
                                >
                                    {d.label}
                                </button>
                            );
                        })}
                    </div>
                    <input
                        type="date"
                        aria-label="Pilih tanggal order"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                    />
                </div>
            </Card>

            {/* Shift Accordions */}
            {shifts.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<ListOrdered className="w-6 h-6" />}
                        title="Belum ada shift aktif"
                        description="Aktifkan shift di pengaturan shift terlebih dahulu."
                    />
                </Card>
            ) : (
                <div className="space-y-3">
                    {shifts.map((shift) => {
                        const shiftOrders = orders.filter((o) => o.shift.id === shift.id && o.status !== 'CANCELLED');
                        const state = getShiftState(shift.id);
                        const filtered = shiftOrders.filter((order) => {
                            if (state.statusFilter && order.status !== state.statusFilter) return false;
                            if (state.search) {
                                const q = state.search.toLowerCase();
                                const match =
                                    order.user.name.toLowerCase().includes(q) ||
                                    order.user.externalId.toLowerCase().includes(q) ||
                                    (order.user.company || '').toLowerCase().includes(q) ||
                                    (order.user.department || '').toLowerCase().includes(q);
                                if (!match) return false;
                            }
                            return true;
                        });
                        const paged = filtered.slice((state.page - 1) * ITEMS_PER_PAGE, state.page * ITEMS_PER_PAGE);
                        const isExpanded = expandedShifts.has(shift.id);

                        const pickedUp = shiftOrders.filter((o) => o.status === 'PICKED_UP').length;
                        const pending = shiftOrders.filter((o) => o.status === 'ORDERED').length;
                        const noShow = shiftOrders.filter((o) => o.status === 'NO_SHOW').length;

                        return (
                            <Card key={shift.id} padding="none">
                                <button
                                    type="button"
                                    onClick={() => toggleShift(shift.id)}
                                    aria-expanded={isExpanded}
                                    className="w-full px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 text-left bg-transparent border-0 cursor-pointer hover:bg-[#fafaf9] transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-[10px] bg-[#fffbeb] border border-[#fde68a] text-[#b45309] flex items-center justify-center flex-shrink-0">
                                            <Calendar className="w-4 h-4" aria-hidden="true" />
                                        </div>
                                        <div>
                                            <div className="text-[14.5px] font-bold text-[#1c1917]">{shift.name}</div>
                                            <div className="text-[12px] text-[#78716c]">
                                                {shift.startTime} – {shift.endTime}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="neutral">{shiftOrders.length} Total</Badge>
                                        {pickedUp > 0 && <Badge variant="success">{pickedUp} Diambil</Badge>}
                                        {pending > 0 && <Badge variant="info">{pending} Menunggu</Badge>}
                                        {noShow > 0 && <Badge variant="danger">{noShow} Tidak diambil</Badge>}
                                        {isExpanded ? (
                                            <ChevronUp className="w-4 h-4 text-[#78716c]" aria-hidden="true" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 text-[#78716c]" aria-hidden="true" />
                                        )}
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="border-t border-[#f5f5f4]">
                                        <div className="px-4 py-3 flex flex-wrap items-center gap-2.5 bg-[#fafaf9] border-b border-[#f5f5f4]">
                                            <div className="relative flex-1 min-w-[200px]">
                                                <Search
                                                    className="w-4 h-4 text-[#a8a29e] absolute left-3 top-1/2 -translate-y-1/2"
                                                    aria-hidden="true"
                                                />
                                                <input
                                                    type="text"
                                                    value={state.search}
                                                    onChange={(e) =>
                                                        updateShiftState(shift.id, { search: e.target.value, page: 1 })
                                                    }
                                                    placeholder="Cari nama, ID, perusahaan, departemen..."
                                                    className="w-full h-9 pl-9 pr-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                                                />
                                            </div>
                                            <select
                                                aria-label="Filter status"
                                                value={state.statusFilter}
                                                onChange={(e) =>
                                                    updateShiftState(shift.id, { statusFilter: e.target.value, page: 1 })
                                                }
                                                className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                                            >
                                                <option value="">Semua status</option>
                                                <option value="PICKED_UP">Diambil</option>
                                                <option value="ORDERED">Menunggu</option>
                                                <option value="NO_SHOW">Tidak diambil</option>
                                            </select>
                                        </div>

                                        {paged.length > 0 ? (
                                            <>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-[13px]">
                                                        <thead>
                                                            <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                                                <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                                                    Nama
                                                                </th>
                                                                <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                                                    Perusahaan
                                                                </th>
                                                                <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                                                    Departemen
                                                                </th>
                                                                <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                                                    Kantin
                                                                </th>
                                                                <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                                                    Status
                                                                </th>
                                                                <th className="text-right px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                                                    Check-in
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-[#f5f5f4]">
                                                            {paged.map((order) => (
                                                                <tr key={order.id} className="hover:bg-[#fafaf9]">
                                                                    <td className="px-4 py-2.5">
                                                                        <div className="font-semibold text-[#1c1917]">
                                                                            {order.user.name}
                                                                        </div>
                                                                        <div className="text-[11.5px] text-[#78716c] font-mono">
                                                                            {order.user.externalId}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-3 py-2.5 text-[#57534e]">
                                                                        {order.user.company || '-'}
                                                                    </td>
                                                                    <td className="px-3 py-2.5 text-[#57534e]">
                                                                        {order.user.department || '-'}
                                                                    </td>
                                                                    <td className="px-3 py-2.5 text-[#57534e]">
                                                                        {order.canteen?.name || '-'}
                                                                    </td>
                                                                    <td className="px-3 py-2.5">
                                                                        <OrderStatusBadge status={order.status} />
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-right tabular-nums text-[12.5px] text-[#57534e]">
                                                                        {order.checkInTime
                                                                            ? formatOrderTime(order.checkInTime)
                                                                            : '-'}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <Pagination
                                                    page={state.page}
                                                    limit={ITEMS_PER_PAGE}
                                                    total={filtered.length}
                                                    onPageChange={(p) => updateShiftState(shift.id, { page: p })}
                                                    variant="user"
                                                />
                                            </>
                                        ) : (
                                            <div className="py-8 text-center text-[13px] text-[#78716c]">
                                                {state.search || state.statusFilter
                                                    ? 'Tidak ada order yang cocok dengan filter.'
                                                    : 'Belum ada order untuk shift ini.'}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
