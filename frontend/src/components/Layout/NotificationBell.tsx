import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Info, AlertTriangle, CheckCircle, XCircle, CheckSquare } from 'lucide-react';
import { api, useAuth } from '../../contexts/AuthContext';
import { useSSERefresh } from '../../contexts/SSEContext';
import { PushService } from '../../services/push.service';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { navigateToNotification, NotificationRelatedType } from '../../utils/notificationRoutes';

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

export default function NotificationBell() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
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

    const getIcon = (type: string) => {
        switch (type) {
            case 'SUCCESS':
                return <CheckCircle className="w-[18px] h-[18px] text-[#15803d]" aria-hidden="true" />;
            case 'WARNING':
                return <AlertTriangle className="w-[18px] h-[18px] text-[#b45309]" aria-hidden="true" />;
            case 'DANGER':
                return <XCircle className="w-[18px] h-[18px] text-[#b91c1c]" aria-hidden="true" />;
            default:
                return <Info className="w-[18px] h-[18px] text-[#1e40af]" aria-hidden="true" />;
        }
    };

    const handleSubscribePush = async () => {
        const success = await PushService.register();
        if (success) setPushPermission('granted');
    };

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
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#fff] rounded-[14px] shadow-[0_12px_32px_rgba(28,25,23,0.12)] border border-[#e7e5e4] overflow-hidden z-50 origin-top-right">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0efed] bg-[#fafaf9]">
                        <h3 className="m-0 text-[14px] font-bold text-[#1c1917]">Notifikasi</h3>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={markAllRead}
                                className="text-[12px] text-[#b45309] hover:text-[#92400e] font-semibold flex items-center gap-1 bg-transparent border-0 cursor-pointer"
                            >
                                <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" /> Tandai semua dibaca
                            </button>
                        )}
                    </div>

                    {pushPermission === 'default' && (
                        <div className="bg-[#fffbeb] px-4 py-2.5 flex items-center justify-between border-b border-[#fef3c7]">
                            <span className="text-[12px] text-[#92400e] font-medium">
                                Aktifkan Notifikasi Desktop
                            </span>
                            <button
                                type="button"
                                onClick={handleSubscribePush}
                                className="text-[11px] font-bold text-[#1c1917] bg-[#f59e0b] hover:bg-[#d97706] px-2.5 py-1 rounded-[8px] border-0 cursor-pointer"
                            >
                                Aktifkan
                            </button>
                        </div>
                    )}

                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="py-10 text-center text-[#78716c] flex flex-col items-center justify-center">
                                <Bell className="w-7 h-7 text-[#d6d3d1] mb-2" aria-hidden="true" />
                                <p className="text-[13px] m-0">Belum ada notifikasi</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[#f5f5f4]">
                                {notifications.map((notif) => (
                                    <button
                                        key={notif.id}
                                        type="button"
                                        onClick={() => {
                                            if (!notif.isRead) markAsRead(notif.id);
                                            setIsOpen(false);
                                            navigateToNotification(notif, user?.role);
                                        }}
                                        className={`w-full text-left flex gap-3 p-3.5 transition-colors cursor-pointer border-0 hover:bg-[#fafaf9] ${
                                            !notif.isRead ? 'bg-[#fffbeb]/60' : 'bg-[#fff]'
                                        }`}
                                    >
                                        <div className="flex-shrink-0 mt-0.5">{getIcon(notif.type)}</div>
                                        <div className="flex-1 min-w-0">
                                            <p
                                                className={`text-[13px] m-0 leading-snug ${
                                                    !notif.isRead
                                                        ? 'font-bold text-[#1c1917]'
                                                        : 'font-medium text-[#44403c]'
                                                }`}
                                            >
                                                {notif.title}
                                            </p>
                                            <p className="text-[12px] text-[#78716c] mt-0.5 mb-0 leading-relaxed">
                                                {notif.message}
                                            </p>
                                            <p className="text-[11px] text-[#a8a29e] mt-1 mb-0 font-medium">
                                                {formatDistanceToNow(new Date(notif.createdAt), {
                                                    addSuffix: true,
                                                    locale: id,
                                                })}
                                            </p>
                                        </div>
                                        {!notif.isRead && (
                                            <span
                                                aria-label="Belum dibaca"
                                                className="w-2 h-2 rounded-full bg-[#f59e0b] mt-1.5 flex-shrink-0"
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
