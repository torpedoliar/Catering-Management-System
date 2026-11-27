import { useState, useEffect, useCallback } from 'react';
import { Bell, AlertCircle, Info, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, useAuth } from '../contexts/AuthContext';
import { useSSE } from '../contexts/SSEContext';
import { formatDateTimeShortWIB } from '../utils/timezone';
import { Badge, Button } from './ui';

interface Announcement {
    id: string;
    title: string;
    content: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    createdAt: string;
    createdBy: {
        name: string;
    };
}

function getPriorityConfig(priority: string) {
    switch (priority) {
        case 'urgent':
            return {
                label: 'Penting!',
                variant: 'danger' as const,
                accentBg: 'bg-[#fef2f2]',
                accentBorder: 'border-[#fecaca]',
                icon: <AlertCircle className="w-5 h-5 text-[#b91c1c]" aria-hidden="true" />,
            };
        case 'high':
            return {
                label: 'Prioritas tinggi',
                variant: 'warning' as const,
                accentBg: 'bg-[#fffbeb]',
                accentBorder: 'border-[#fde68a]',
                icon: <AlertTriangle className="w-5 h-5 text-[#b45309]" aria-hidden="true" />,
            };
        case 'normal':
            return {
                label: 'Info',
                variant: 'info' as const,
                accentBg: 'bg-[#eff6ff]',
                accentBorder: 'border-[#bfdbfe]',
                icon: <Bell className="w-5 h-5 text-[#1d4ed8]" aria-hidden="true" />,
            };
        default:
            return {
                label: 'Umum',
                variant: 'neutral' as const,
                accentBg: 'bg-[#fafaf9]',
                accentBorder: 'border-[#e7e5e4]',
                icon: <Info className="w-5 h-5 text-[#57534e]" aria-hidden="true" />,
            };
    }
}

export default function AnnouncementPopup() {
    const { token } = useAuth();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
        try {
            const stored = sessionStorage.getItem('dismissedAnnouncements');
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch {
            return new Set();
        }
    });
    const { subscribe } = useSSE();

    const [shownThisSession, setShownThisSession] = useState(() => {
        return sessionStorage.getItem('announcementsShown') === 'true';
    });

    useEffect(() => {
        if (!token) {
            sessionStorage.removeItem('announcementsShown');
            sessionStorage.removeItem('dismissedAnnouncements');
            setShownThisSession(false);
            setDismissedIds(new Set());
            setIsVisible(false);
            setAnnouncements([]);
        }
    }, [token]);

    useEffect(() => {
        if (dismissedIds.size > 0) {
            sessionStorage.setItem('dismissedAnnouncements', JSON.stringify([...dismissedIds]));
        }
    }, [dismissedIds]);

    const loadAnnouncements = useCallback(async () => {
        if (shownThisSession) return;
        try {
            const res = await api.get('/api/announcements/active');
            const newAnnouncements = res.data.announcements || [];
            const visibleAnnouncements = newAnnouncements.filter(
                (a: Announcement & { type?: string }) =>
                    !dismissedIds.has(a.id) && a.type !== 'AGREEMENT'
            );
            setAnnouncements(visibleAnnouncements);
            if (visibleAnnouncements.length > 0) {
                setIsVisible(true);
                setCurrentIndex(0);
                sessionStorage.setItem('announcementsShown', 'true');
                setShownThisSession(true);
            }
        } catch (error) {
            console.error('Failed to load announcements:', error);
        }
    }, [dismissedIds, shownThisSession]);

    useEffect(() => {
        if (token && !shownThisSession) {
            loadAnnouncements();
        }
    }, [loadAnnouncements, token, shownThisSession]);

    useEffect(() => {
        const unsubCreate = subscribe('announcement:created', (data) => {
            const newAnnouncement = data.announcement;
            if (newAnnouncement && !dismissedIds.has(newAnnouncement.id)) {
                setAnnouncements((prev) => [newAnnouncement, ...prev]);
                setIsVisible(true);
                setCurrentIndex(0);
            }
        });
        const unsubUpdate = subscribe('announcement:updated', (data) => {
            const updated = data.announcement;
            setAnnouncements((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        });
        const unsubDelete = subscribe('announcement:deleted', (data) => {
            setAnnouncements((prev) => prev.filter((a) => a.id !== data.announcementId));
        });
        return () => {
            unsubCreate();
            unsubUpdate();
            unsubDelete();
        };
    }, [subscribe, dismissedIds]);

    const handleDismiss = () => {
        if (announcements.length === 0) return;
        const currentId = announcements[currentIndex].id;
        setDismissedIds((prev) => new Set([...prev, currentId]));
        const remaining = announcements.filter((_, i) => i !== currentIndex);
        setAnnouncements(remaining);
        if (remaining.length === 0) setIsVisible(false);
        else if (currentIndex >= remaining.length) setCurrentIndex(remaining.length - 1);
    };

    const handleDismissAll = () => {
        setDismissedIds((prev) => new Set([...prev, ...announcements.map((a) => a.id)]));
        setAnnouncements([]);
        setIsVisible(false);
    };

    if (!isVisible || announcements.length === 0) {
        return null;
    }

    const current = announcements[currentIndex];
    const meta = getPriorityConfig(current.priority);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-popup-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/50 backdrop-blur-sm p-4"
        >
            <div className="relative w-full max-w-lg rounded-[16px] border border-[#e7e5e4] bg-[#fff] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
                {/* Header */}
                <div className={`flex-none flex items-center justify-between px-5 py-4 border-b ${meta.accentBg} ${meta.accentBorder}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[10px] bg-[#fff] border border-[#e7e5e4] flex items-center justify-center">
                            {meta.icon}
                        </div>
                        <div>
                            <h3 className="font-bold text-[#1c1917] text-[15px]">Pengumuman</h3>
                            {announcements.length > 1 && (
                                <p className="text-[12px] text-[#78716c]">
                                    {currentIndex + 1} dari {announcements.length}
                                </p>
                            )}
                        </div>
                    </div>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto flex-1">
                    <h4 id="announcement-popup-title" className="text-[18px] font-bold text-[#1c1917] mb-2">
                        {current.title}
                    </h4>
                    <p className="text-[14px] text-[#57534e] leading-relaxed whitespace-pre-wrap">
                        {current.content}
                    </p>
                    <div className="mt-4 pt-3 border-t border-[#f5f5f4] flex items-center justify-between text-[12px] text-[#78716c]">
                        <span>Dari: {current.createdBy.name}</span>
                        <span>{formatDateTimeShortWIB(current.createdAt)}</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex-none flex items-center justify-between px-5 py-3.5 bg-[#fafaf9] border-t border-[#e7e5e4]">
                    <div className="flex items-center gap-1.5">
                        {announcements.length > 1 && (
                            <>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={currentIndex === 0}
                                    onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                                    aria-label="Pengumuman sebelumnya"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={currentIndex === announcements.length - 1}
                                    onClick={() =>
                                        setCurrentIndex((i) => Math.min(announcements.length - 1, i + 1))
                                    }
                                    aria-label="Pengumuman berikutnya"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {announcements.length > 1 && (
                            <Button variant="ghost" size="sm" onClick={handleDismissAll}>
                                Tutup semua
                            </Button>
                        )}
                        <Button variant="primary" size="sm" onClick={handleDismiss}>
                            OK, Mengerti
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
