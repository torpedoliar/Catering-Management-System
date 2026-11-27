import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Bell,
    Info,
    AlertTriangle,
    CheckCircle,
    XCircle,
    CheckCheck,
    Search,
    Zap,
    MessageSquare,
    ShieldBan,
    Utensils,
    BarChart3,
    HardDrive,
    X,
} from 'lucide-react';
import { api, useAuth } from '../../contexts/AuthContext';
import { useSSERefresh } from '../../contexts/SSEContext';
import { PushService } from '../../services/push.service';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import {
    navigateToNotification,
    notificationToRoute,
    NotificationRelatedType,
} from '../../utils/notificationRoutes';

interface Notification {
    id: string;
    title: string;
    message: string;
    type: 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';
    isRead: boolean;
    createdAt: string;
    relatedId?: string | null;
    relatedType?: NotificationRelatedType | null;
}

type CategoryKey = 'all' | 'action' | 'order' | 'info';

interface CategoryMeta {
    bucket: Exclude<CategoryKey, 'all'>;
    badgeLabel: string;
    badgeClass: string;
    iconBgClass: string;
    destLabel: string;
    urgentAction: boolean;
}

function classifyNotification(n: Notification, userRole?: string): CategoryMeta {
    const t = n.title || '';
    const rt = n.relatedType ?? null;
    const route = notificationToRoute(n, userRole);

    const destMap = (r: string): string => {
        if (r.startsWith('/admin/messages')) return 'Buka Sanggahan';
        if (r.startsWith('/admin/blacklist')) return 'Buka Blacklist';
        if (r.startsWith('/admin/backup')) return 'Buka Backup';
        if (r.startsWith('/admin/dashboard')) return 'Buka Dashboard';
        if (r.startsWith('/admin/orders')) return 'Daftar Pesanan';
        if (r.startsWith('/history')) return 'Buka Riwayat';
        if (r.startsWith('/settings')) return 'Buka Pengaturan';
        return 'Beranda';
    };

    if (rt === 'MESSAGE' || t.startsWith('Pengajuan Sanggahan')) {
        return {
            bucket: 'action',
            badgeLabel: 'Sanggahan',
            badgeClass: 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]',
            iconBgClass: 'bg-[#fff7ed] text-[#ea580c] border-[#fed7aa]',
            destLabel: destMap(route),
            urgentAction: true,
        };
    }

    if (rt === 'BLACKLIST' || t.startsWith('🚫')) {
        return {
            bucket: 'action',
            badgeLabel: 'Blokir Akun',
            badgeClass: 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]',
            iconBgClass: 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]',
            destLabel: destMap(route),
            urgentAction: true,
        };
    }

    if (t.startsWith('Auto Backup')) {
        return {
            bucket: 'action',
            badgeLabel: 'Sistem',
            badgeClass: 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]',
            iconBgClass: 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]',
            destLabel: destMap(route),
            urgentAction: true,
        };
    }

    if (
        rt === 'ORDER' ||
        t.startsWith('⚠️ Pelanggaran') ||
        t.startsWith('❌ Pesanan') ||
        t.startsWith('Sanggahan Disetujui') ||
        t.startsWith('Sanggahan Ditolak')
    ) {
        const isSuccess = t.startsWith('Sanggahan Disetujui') || n.type === 'SUCCESS';
        const isDanger = t.startsWith('❌') || t.startsWith('Sanggahan Ditolak') || n.type === 'DANGER';
        return {
            bucket: 'order',
            badgeLabel: t.startsWith('Sanggahan') ? 'Sanggahan' : t.startsWith('⚠️') ? 'Pelanggaran' : 'Pesanan',
            badgeClass: isSuccess
                ? 'bg-[#dcfce7] text-[#166534] border-[#bbf7d0]'
                : isDanger
                    ? 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]'
                    : 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]',
            iconBgClass: isSuccess
                ? 'bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]'
                : isDanger
                    ? 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]'
                    : 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]',
            destLabel: destMap(route),
            urgentAction: false,
        };
    }

    if (t.startsWith('📊 Laporan')) {
        return {
            bucket: 'info',
            badgeLabel: 'Laporan Harian',
            badgeClass: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]',
            iconBgClass: 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]',
            destLabel: destMap(route),
            urgentAction: false,
        };
    }

    return {
        bucket: 'info',
        badgeLabel: 'Info',
        badgeClass: 'bg-[#f5f5f4] text-[#57534e] border-[#e7e5e4]',
        iconBgClass: 'bg-[#f5f5f4] text-[#57534e] border-[#e7e5e4]',
        destLabel: destMap(route),
        urgentAction: false,
    };
}

function getDayGroupLabel(iso: string): 'HARI INI' | 'KEMARIN' | 'SEBELUMNYA' {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return 'SEBELUMNYA';
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startYesterday = startToday - 86_400_000;
    const itemDay = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
    if (itemDay >= startToday) return 'HARI INI';
    if (itemDay >= startYesterday) return 'KEMARIN';
    return 'SEBELUMNYA';
}

function formatCompactTime(iso: string): string {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '';
    const now = new Date();
    const isSameDay =
        dt.getFullYear() === now.getFullYear() &&
        dt.getMonth() === now.getMonth() &&
        dt.getDate() === now.getDate();
    if (isSameDay) {
        return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    }
    return formatDistanceToNow(dt, { addSuffix: true, locale: id });
}

export default function NotificationBell() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [pushPermission, setPushPermission] = useState(PushService.getPermissionState());
    const dropdownRef = useRef<HTMLDivElement>(null);

    const loadNotifications = useCallback(async () => {
        if (!user) return;
        try {
            const res = await api.get('/api/notifications');
            setNotifications(res.data.notifications || []);
            setUnreadCount(res.data.unreadCount || 0);
        } catch (error) {
            console.error('Failed to load notifications', error);
        }
    }, [user]);

    useEffect(() => {
        loadNotifications();
    }, [loadNotifications]);

    useSSERefresh(['notification:new'], loadNotifications);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, []);

    const markAsRead = async (notifId: string) => {
        try {
            await api.put(`/api/notifications/${notifId}/read`);
            setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n)));
            setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark read', error);
        }
    };

    const markAllRead = async () => {
        try {
            await api.put('/api/notifications/read-all');
            setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all read', error);
        }
    };

    const handleSubscribePush = async () => {
        const success = await PushService.register();
        if (success) setPushPermission('granted');
        else setPushPermission(PushService.getPermissionState());
    };

    const enriched = useMemo(
        () =>
            notifications.map((n) => ({
                notif: n,
                meta: classifyNotification(n, user?.role),
            })),
        [notifications, user?.role]
    );

    const counts = useMemo(() => {
        const res = {
            all: enriched.length,
            action: 0,
            order: 0,
            info: 0,
            unreadAction: 0,
            unreadOrder: 0,
            unreadInfo: 0,
        };
        for (const item of enriched) {
            res[item.meta.bucket]++;
            if (!item.notif.isRead) {
                if (item.meta.bucket === 'action') res.unreadAction++;
                else if (item.meta.bucket === 'order') res.unreadOrder++;
                else res.unreadInfo++;
            }
        }
        return res;
    }, [enriched]);

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return enriched.filter(({ notif, meta }) => {
            if (activeCategory !== 'all' && meta.bucket !== activeCategory) return false;
            if (!q) return true;
            return (
                notif.title.toLowerCase().includes(q) ||
                notif.message.toLowerCase().includes(q) ||
                meta.badgeLabel.toLowerCase().includes(q)
            );
        });
    }, [enriched, activeCategory, searchQuery]);

    const groupedList = useMemo(() => {
        const showNeedsAction = activeCategory === 'all' && !searchQuery.trim();
        const needsAction = showNeedsAction
            ? filtered.filter(({ notif, meta }) => !notif.isRead && meta.urgentAction)
            : [];
        const needsIds = new Set(needsAction.map((i) => i.notif.id));

        const sections: Record<'HARI INI' | 'KEMARIN' | 'SEBELUMNYA', typeof filtered> = {
            'HARI INI': [],
            KEMARIN: [],
            SEBELUMNYA: [],
        };
        for (const item of filtered) {
            if (needsIds.has(item.notif.id)) continue;
            sections[getDayGroupLabel(item.notif.createdAt)].push(item);
        }
        return { needsAction, sections };
    }, [filtered, activeCategory, searchQuery]);

    const renderCategoryIcon = (n: Notification, meta: CategoryMeta) => {
        const t = n.title || '';
        if (n.relatedType === 'MESSAGE' || t.startsWith('Pengajuan Sanggahan')) {
            return <MessageSquare className="w-4 h-4" aria-hidden="true" />;
        }
        if (n.relatedType === 'BLACKLIST' || t.startsWith('🚫')) {
            return <ShieldBan className="w-4 h-4" aria-hidden="true" />;
        }
        if (t.startsWith('Auto Backup')) {
            return <HardDrive className="w-4 h-4" aria-hidden="true" />;
        }
        if (meta.bucket === 'order') {
            if (n.type === 'SUCCESS') return <CheckCircle className="w-4 h-4" aria-hidden="true" />;
            if (n.type === 'DANGER') return <XCircle className="w-4 h-4" aria-hidden="true" />;
            if (n.type === 'WARNING') return <AlertTriangle className="w-4 h-4" aria-hidden="true" />;
            return <Utensils className="w-4 h-4" aria-hidden="true" />;
        }
        if (t.startsWith('📊')) {
            return <BarChart3 className="w-4 h-4" aria-hidden="true" />;
        }
        return <Info className="w-4 h-4" aria-hidden="true" />;
    };

    const renderItemCard = (item: { notif: Notification; meta: CategoryMeta }, highlighted = false) => {
        const { notif, meta } = item;
        return (
            <button
                key={notif.id}
                type="button"
                onClick={() => {
                    if (!notif.isRead) markAsRead(notif.id);
                    setIsOpen(false);
                    navigateToNotification(notif, user?.role);
                }}
                className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-[12px] transition-colors cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] ${
                    highlighted
                        ? 'bg-[#fff7ed]/70 border-[#fed7aa] hover:bg-[#fff7ed]'
                        : !notif.isRead
                            ? 'bg-[#fffbeb]/50 border-[#fde68a] hover:bg-[#fffbeb]'
                            : 'bg-[#fff] border-transparent hover:bg-[#fafaf9] hover:border-[#f0efed]'
                }`}
            >
                <div className="relative flex-shrink-0 mt-0.5">
                    {!notif.isRead && (
                        <span
                            aria-label="Belum dibaca"
                            className="absolute -left-1.5 top-3.5 w-1.5 h-1.5 rounded-full bg-[#2563eb]"
                        />
                    )}
                    <div
                        className={`w-9 h-9 rounded-[10px] border flex items-center justify-center ${meta.iconBgClass}`}
                    >
                        {renderCategoryIcon(notif, meta)}
                    </div>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <p
                            className={`text-[13px] m-0 leading-snug truncate ${
                                !notif.isRead ? 'font-bold text-[#1c1917]' : 'font-semibold text-[#44403c]'
                            }`}
                        >
                            {notif.title}
                        </p>
                        <span className="text-[11px] text-[#a8a29e] font-medium flex-shrink-0 tabular-nums mt-0.5">
                            {formatCompactTime(notif.createdAt)}
                        </span>
                    </div>

                    <p className="text-[12px] text-[#78716c] mt-0.5 mb-0 leading-relaxed line-clamp-2">
                        {notif.message}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-[6px] border text-[10.5px] font-semibold ${meta.badgeClass}`}
                        >
                            {meta.badgeLabel}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] bg-[#f5f5f4] text-[#57534e] text-[10.5px] font-medium">
                            → {meta.destLabel}
                        </span>
                    </div>
                </div>
            </button>
        );
    };

    const tabs: Array<{ key: CategoryKey; label: string; count: number }> = [
        { key: 'all', label: 'Semua', count: counts.all },
        { key: 'action', label: 'Tindakan', count: counts.action },
        { key: 'order', label: 'Pesanan', count: counts.order },
        { key: 'info', label: 'Laporan', count: counts.info },
    ];

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                aria-label="Notifikasi"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(!isOpen)}
                className="relative w-[38px] h-[38px] border border-[#e7e5e4] rounded-[10px] bg-[#fff] text-[#57534e] hover:bg-[#fafaf9] inline-flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
            >
                <Bell className="w-[18px] h-[18px]" strokeWidth={1.8} aria-hidden="true" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[#dc2626] text-[#fff] text-[10px] font-bold rounded-full px-[5px] py-[1px] leading-tight tabular-nums">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div
                    role="dialog"
                    aria-label="Pusat notifikasi"
                    className="fixed sm:absolute right-3 sm:right-0 top-[68px] sm:top-auto sm:mt-2 w-[calc(100vw-24px)] sm:w-[420px] bg-[#fff] rounded-[16px] shadow-[0_16px_40px_rgba(28,25,23,0.14)] border border-[#e7e5e4] overflow-hidden z-50 origin-top-right"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-[#f5f5f4]">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-[10px] bg-[#fffbeb] border border-[#fde68a] text-[#b45309] flex items-center justify-center flex-shrink-0">
                                <Bell className="w-[18px] h-[18px]" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="m-0 text-[15px] font-bold text-[#1c1917] leading-tight">
                                    Notifikasi
                                </h3>
                                <p className="m-0 text-[11.5px] text-[#78716c] truncate uppercase tracking-wide">
                                    {user?.name || 'Pengguna'} ·{' '}
                                    <span className="normal-case tabular-nums">
                                        {unreadCount} belum dibaca
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                                type="button"
                                aria-label="Cari notifikasi"
                                title="Cari notifikasi"
                                onClick={() => {
                                    setSearchOpen((prev) => {
                                        if (prev) setSearchQuery('');
                                        return !prev;
                                    });
                                }}
                                className={`w-8 h-8 rounded-[9px] border inline-flex items-center justify-center cursor-pointer transition-colors ${
                                    searchOpen
                                        ? 'bg-[#fffbeb] border-[#fde68a] text-[#b45309]'
                                        : 'bg-[#fff] border-[#e7e5e4] text-[#57534e] hover:bg-[#fafaf9]'
                                }`}
                            >
                                <Search className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                aria-label="Tandai semua dibaca"
                                title="Tandai semua dibaca"
                                disabled={unreadCount === 0}
                                onClick={markAllRead}
                                className={`w-8 h-8 rounded-[9px] border inline-flex items-center justify-center transition-colors ${
                                    unreadCount > 0
                                        ? 'bg-[#fff] border-[#e7e5e4] text-[#57534e] hover:bg-[#fafaf9] cursor-pointer'
                                        : 'bg-[#fafaf9] border-[#f0efed] text-[#d6d3d1] cursor-not-allowed'
                                }`}
                            >
                                <CheckCheck className="w-4 h-4" aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    {/* Optional Search Input */}
                    {searchOpen && (
                        <div className="px-4 pt-2.5">
                            <div className="flex items-center gap-2 h-8 px-2.5 rounded-[9px] border border-[#e7e5e4] bg-[#fafaf9] focus-within:border-[#f59e0b] focus-within:bg-[#fff]">
                                <Search className="w-3.5 h-3.5 text-[#a8a29e]" aria-hidden="true" />
                                <input
                                    type="text"
                                    autoFocus
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Cari judul, nama karyawan, atau pesan…"
                                    className="flex-1 text-[12.5px] bg-transparent border-0 outline-none text-[#1c1917] placeholder:text-[#a8a29e]"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        aria-label="Hapus pencarian"
                                        onClick={() => setSearchQuery('')}
                                        className="border-0 bg-transparent text-[#78716c] cursor-pointer p-0.5"
                                    >
                                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 3 Summary KPI Cards (iPop style) */}
                    <div className="grid grid-cols-3 gap-2 px-4 pt-3">
                        <button
                            type="button"
                            onClick={() => setActiveCategory(activeCategory === 'action' ? 'all' : 'action')}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-[10px] border text-left cursor-pointer transition-colors ${
                                activeCategory === 'action'
                                    ? 'bg-[#fff7ed] border-[#fdba74]'
                                    : 'bg-[#fafaf9] border-[#f0efed] hover:bg-[#f5f5f4]'
                            }`}
                        >
                            <span className="text-[17px] font-extrabold text-[#ea580c] tabular-nums leading-none">
                                {counts.unreadAction}
                            </span>
                            <span className="text-[10.5px] leading-tight text-[#57534e] font-medium">
                                perlu tindakan
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveCategory(activeCategory === 'order' ? 'all' : 'order')}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-[10px] border text-left cursor-pointer transition-colors ${
                                activeCategory === 'order'
                                    ? 'bg-[#eff6ff] border-[#93c5fd]'
                                    : 'bg-[#fafaf9] border-[#f0efed] hover:bg-[#f5f5f4]'
                            }`}
                        >
                            <span className="text-[17px] font-extrabold text-[#2563eb] tabular-nums leading-none">
                                {counts.unreadOrder}
                            </span>
                            <span className="text-[10.5px] leading-tight text-[#57534e] font-medium">
                                info pesanan
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveCategory(activeCategory === 'info' ? 'all' : 'info')}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-[10px] border text-left cursor-pointer transition-colors ${
                                activeCategory === 'info'
                                    ? 'bg-[#f5f5f4] border-[#d6d3d1]'
                                    : 'bg-[#fafaf9] border-[#f0efed] hover:bg-[#f5f5f4]'
                            }`}
                        >
                            <span className="text-[17px] font-extrabold text-[#44403c] tabular-nums leading-none">
                                {counts.unreadInfo}
                            </span>
                            <span className="text-[10.5px] leading-tight text-[#57534e] font-medium">
                                laporan &amp; info
                            </span>
                        </button>
                    </div>

                    {/* Segmented Category Filter */}
                    <div
                        role="tablist"
                        aria-label="Kategori notifikasi"
                        className="mx-4 mt-2.5 p-1 rounded-[10px] bg-[#f5f5f4] grid grid-cols-4 gap-1"
                    >
                        {tabs.map((tab) => {
                            const active = activeCategory === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setActiveCategory(tab.key)}
                                    className={`py-1.5 px-1.5 rounded-[8px] text-[11.5px] border-0 cursor-pointer transition-all inline-flex items-center justify-center gap-1 ${
                                        active
                                            ? 'bg-[#fff] text-[#1c1917] font-bold shadow-[0_1px_3px_rgba(28,25,23,0.08)]'
                                            : 'bg-transparent text-[#78716c] font-semibold hover:text-[#1c1917]'
                                    }`}
                                >
                                    <span className="truncate">{tab.label}</span>
                                    <span
                                        className={`text-[10.5px] tabular-nums ${
                                            active ? 'text-[#b45309]' : 'text-[#a8a29e]'
                                        }`}
                                    >
                                        {tab.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Categorized & Date-grouped Notification List */}
                    <div className="max-h-[370px] overflow-y-auto px-3 py-2.5 space-y-3">
                        {filtered.length === 0 ? (
                            <div className="py-10 text-center text-[#78716c] flex flex-col items-center justify-center">
                                <Bell className="w-7 h-7 text-[#d6d3d1] mb-2" aria-hidden="true" />
                                <p className="text-[13px] font-medium m-0">
                                    {searchQuery.trim()
                                        ? 'Tidak ada notifikasi yang cocok'
                                        : 'Belum ada notifikasi di kategori ini'}
                                </p>
                            </div>
                        ) : (
                            <>
                                {groupedList.needsAction.length > 0 && (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5 px-1 text-[10.5px] font-bold tracking-[0.06em] text-[#ea580c] uppercase">
                                            <Zap className="w-3 h-3" aria-hidden="true" />
                                            <span>Perlu Tindakan</span>
                                        </div>
                                        <div className="space-y-1.5">
                                            {groupedList.needsAction.map((item) => renderItemCard(item, true))}
                                        </div>
                                    </div>
                                )}

                                {(['HARI INI', 'KEMARIN', 'SEBELUMNYA'] as const).map((groupKey) => {
                                    const items = groupedList.sections[groupKey];
                                    if (items.length === 0) return null;
                                    return (
                                        <div key={groupKey} className="space-y-1.5">
                                            <div className="flex items-center gap-2 px-1">
                                                <span className="text-[10.5px] font-bold tracking-[0.06em] text-[#78716c] uppercase">
                                                    {groupKey}
                                                </span>
                                                <div className="flex-1 h-px bg-[#f0efed]" />
                                            </div>
                                            <div className="space-y-1">
                                                {items.map((item) => renderItemCard(item, false))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#f0efed] bg-[#fafaf9]">
                        <span className="text-[11.5px] text-[#78716c] font-medium">
                            {pushPermission === 'granted'
                                ? 'Notifikasi desktop aktif'
                                : pushPermission === 'denied'
                                    ? 'Notifikasi diblokir browser'
                                    : 'Aktifkan notifikasi desktop'}
                        </span>
                        {pushPermission === 'default' && (
                            <button
                                type="button"
                                onClick={handleSubscribePush}
                                className="text-[11px] font-bold text-[#1c1917] bg-[#f59e0b] hover:bg-[#d97706] px-3 py-1 rounded-[8px] border-0 cursor-pointer transition-colors"
                            >
                                Aktifkan
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
