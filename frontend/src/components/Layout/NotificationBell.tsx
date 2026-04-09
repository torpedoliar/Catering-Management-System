import { useState, useEffect, useRef } from 'react';
import { Bell, Check, Info, AlertTriangle, CheckCircle, XCircle, CheckSquare } from 'lucide-react';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh } from '../../contexts/SSEContext';
import { PushService } from '../../services/push.service';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';

interface Notification {
    id: string;
    title: string;
    message: string;
    type: 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';
    isRead: boolean;
    createdAt: string;
    relatedId?: string | null;
}

export default function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [pushPermission, setPushPermission] = useState(PushService.getPermissionState());
    const dropdownRef = useRef<HTMLDivElement>(null);

    const loadNotifications = async () => {
        try {
            const res = await api.get('/api/notifications');
            setNotifications(res.data.notifications || []);
            setUnreadCount(res.data.unreadCount || 0);
        } catch (error) {
            console.error('Failed to load notifications', error);
        }
    };

    useEffect(() => {
        loadNotifications();
    }, []);

    // Refresh automatically on SSE event
    useSSERefresh('notification:new', loadNotifications);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const markAsRead = async (id: string) => {
        try {
            await api.put(`/api/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark read', error);
        }
    };

    const markAllRead = async () => {
        try {
            await api.put('/api/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all read', error);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'SUCCESS': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
            case 'WARNING': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
            case 'DANGER': return <XCircle className="w-5 h-5 text-rose-500" />;
            default: return <Info className="w-5 h-5 text-blue-500" />;
        }
    };

    const handleSubscribePush = async () => {
        const success = await PushService.register();
        if (success) setPushPermission('granted');
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-xl hover:bg-stone-100 transition-colors"
                title="Notifikasi"
            >
                <Bell className="w-5 h-5 text-stone-600" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden z-50 animate-fade-in origin-top-right">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 bg-stone-50/50 block">
                        <h3 className="font-semibold text-stone-800">Notifikasi</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
                            >
                                <CheckSquare className="w-3.5 h-3.5" /> Tandai semua dibaca
                            </button>
                        )}
                    </div>
                    
                    {pushPermission === 'default' && (
                        <div className="bg-sky-50 px-4 py-2 flex items-center justify-between border-b border-sky-100">
                            <span className="text-xs text-sky-700 font-medium tracking-tight">Aktifkan Notifikasi Desktop</span>
                            <button 
                                onClick={handleSubscribePush}
                                className="text-[10px] uppercase font-bold tracking-wider text-white bg-sky-500 hover:bg-sky-600 px-3 py-1.5 rounded-lg shadow-sm"
                            >
                                Aktifkan
                            </button>
                        </div>
                    )}

                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="py-8 text-center text-stone-500 flex flex-col items-center justify-center">
                                <Bell className="w-8 h-8 text-stone-300 mb-2" />
                                <p className="text-sm">Belum ada notifikasi</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-stone-50">
                                {notifications.map((notif) => (
                                    <div 
                                        key={notif.id}
                                        onClick={() => !notif.isRead && markAsRead(notif.id)}
                                        className={`flex gap-3 p-4 transition-colors cursor-pointer hover:bg-stone-50 ${!notif.isRead ? 'bg-amber-50/30' : ''}`}
                                    >
                                        <div className="flex-shrink-0 mt-0.5">
                                            {getIcon(notif.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm tracking-tight ${!notif.isRead ? 'font-semibold text-stone-800' : 'font-medium text-stone-700'}`}>
                                                {notif.title}
                                            </p>
                                            <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                                                {notif.message}
                                            </p>
                                            <p className="text-[10px] text-stone-400 mt-1.5 flex items-center gap-1 uppercase tracking-wider font-medium">
                                                {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: id })}
                                            </p>
                                        </div>
                                        {!notif.isRead && (
                                            <div className="flex-shrink-0">
                                                <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shadow-sm shadow-amber-500/20"></div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
