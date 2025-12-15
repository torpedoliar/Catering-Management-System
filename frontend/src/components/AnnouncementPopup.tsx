import { useState, useEffect, useCallback } from 'react';
import { api, useAuth } from '../contexts/AuthContext';
import { useSSE } from '../contexts/SSEContext';
import { formatDateTimeShortWIB } from '../utils/timezone';
import {
    X,
    Bell,
    AlertCircle,
    Info,
    AlertTriangle,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';

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

export default function AnnouncementPopup() {
    const { token } = useAuth();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
        // Load dismissed IDs from sessionStorage
        try {
            const stored = sessionStorage.getItem('dismissedAnnouncements');
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch {
            return new Set();
        }
    });
    const { subscribe } = useSSE();

    // Check if announcements were already shown this session
    const [shownThisSession, setShownThisSession] = useState(() => {
        return sessionStorage.getItem('announcementsShown') === 'true';
    });

    // Reset state when user logs out (token becomes null)
    useEffect(() => {
        if (!token) {
            setShownThisSession(false);
            setDismissedIds(new Set());
            setIsVisible(false);
            setAnnouncements([]);
        }
    }, [token]);

    // Save dismissed IDs to sessionStorage when they change
    useEffect(() => {
        if (dismissedIds.size > 0) {
            sessionStorage.setItem('dismissedAnnouncements', JSON.stringify([...dismissedIds]));
        }
    }, [dismissedIds]);

    const loadAnnouncements = useCallback(async () => {
        // Skip if already shown this session (only show on fresh login)
        if (shownThisSession) {
            return;
        }

        try {
            const res = await api.get('/api/announcements/active');
            const newAnnouncements = res.data.announcements || [];

            // Filter out already dismissed announcements
            const visibleAnnouncements = newAnnouncements.filter(
                (a: Announcement) => !dismissedIds.has(a.id)
            );

            setAnnouncements(visibleAnnouncements);

            if (visibleAnnouncements.length > 0) {
                setIsVisible(true);
                setCurrentIndex(0);
                // Mark as shown for this session
                sessionStorage.setItem('announcementsShown', 'true');
                setShownThisSession(true);
            }
        } catch (error) {
            console.error('Failed to load announcements:', error);
        }
    }, [dismissedIds, token, shownThisSession]);

    useEffect(() => {
        // Only load announcements when user is authenticated and not shown this session
        if (token && !shownThisSession) {
            loadAnnouncements();
        }
    }, [loadAnnouncements, token, shownThisSession]);

    // Subscribe to SSE announcement events
    useEffect(() => {
        const unsubCreate = subscribe('announcement:created', (data) => {
            const newAnnouncement = data.announcement;
            if (newAnnouncement && !dismissedIds.has(newAnnouncement.id)) {
                setAnnouncements(prev => [newAnnouncement, ...prev]);
                setIsVisible(true);
                setCurrentIndex(0);
            }
        });

        const unsubUpdate = subscribe('announcement:updated', (data) => {
            const updated = data.announcement;
            setAnnouncements(prev =>
                prev.map(a => a.id === updated.id ? updated : a)
            );
        });

        const unsubDelete = subscribe('announcement:deleted', (data) => {
            setAnnouncements(prev =>
                prev.filter(a => a.id !== data.announcementId)
            );
        });

        return () => {
            unsubCreate();
            unsubUpdate();
            unsubDelete();
        };
    }, [subscribe, dismissedIds]);

    const handleDismiss = () => {
        if (announcements.length > 0) {
            const currentId = announcements[currentIndex].id;
            setDismissedIds(prev => new Set([...prev, currentId]));

            const remaining = announcements.filter((_, i) => i !== currentIndex);
            setAnnouncements(remaining);

            if (remaining.length === 0) {
                setIsVisible(false);
            } else if (currentIndex >= remaining.length) {
                setCurrentIndex(remaining.length - 1);
            }
        }
    };

    const handleDismissAll = () => {
        const allIds = new Set(announcements.map(a => a.id));
        setDismissedIds(prev => new Set([...prev, ...allIds]));
        setAnnouncements([]);
        setIsVisible(false);
    };

    const handlePrev = () => {
        setCurrentIndex(prev => Math.max(0, prev - 1));
    };

    const handleNext = () => {
        setCurrentIndex(prev => Math.min(announcements.length - 1, prev + 1));
    };

    const getPriorityStyles = (priority: string) => {
        switch (priority) {
            case 'urgent':
                return {
                    bg: 'from-red-600 to-red-700',
                    border: 'border-red-500/50',
                    icon: <AlertCircle className="w-6 h-6 text-red-200" />,
                    badge: 'bg-red-500 text-white'
                };
            case 'high':
                return {
                    bg: 'from-orange-500 to-orange-600',
                    border: 'border-orange-500/50',
                    icon: <AlertTriangle className="w-6 h-6 text-orange-200" />,
                    badge: 'bg-orange-500 text-white'
                };
            case 'normal':
                return {
                    bg: 'from-blue-500 to-blue-600',
                    border: 'border-blue-500/50',
                    icon: <Bell className="w-6 h-6 text-blue-200" />,
                    badge: 'bg-blue-500 text-white'
                };
            default:
                return {
                    bg: 'from-gray-500 to-gray-600',
                    border: 'border-gray-500/50',
                    icon: <Info className="w-6 h-6 text-gray-200" />,
                    badge: 'bg-gray-500 text-white'
                };
        }
    };

    if (!isVisible || announcements.length === 0) {
        return null;
    }

    const current = announcements[currentIndex];
    const styles = getPriorityStyles(current.priority);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className={`relative w-full max-w-lg mx-4 rounded-2xl border ${styles.border} bg-gradient-to-br ${styles.bg} shadow-2xl overflow-hidden`}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/20">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                            {styles.icon}
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-lg">Pengumuman</h3>
                            <p className="text-xs text-white/60">
                                {announcements.length > 1 && `${currentIndex + 1} dari ${announcements.length}`}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="p-2 rounded-lg hover:bg-white/20 transition-colors"
                    >
                        <X className="w-5 h-5 text-white" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <div className="flex items-start gap-2 mb-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles.badge}`}>
                            {current.priority === 'urgent' ? 'PENTING!' :
                                current.priority === 'high' ? 'Prioritas Tinggi' :
                                    current.priority === 'normal' ? 'Info' : 'Umum'}
                        </span>
                    </div>
                    <h4 className="text-xl font-bold text-white mb-3">{current.title}</h4>
                    <p className="text-white/90 leading-relaxed whitespace-pre-wrap">{current.content}</p>

                    <div className="mt-4 pt-4 border-t border-white/20 flex items-center justify-between text-xs text-white/50">
                        <span>Dari: {current.createdBy.name}</span>
                        <span>{formatDateTimeShortWIB(current.createdAt)}</span>
                    </div>
                </div>

                {/* Footer / Navigation */}
                <div className="flex items-center justify-between p-4 bg-black/20">
                    <div className="flex items-center gap-2">
                        {announcements.length > 1 && (
                            <>
                                <button
                                    onClick={handlePrev}
                                    disabled={currentIndex === 0}
                                    className="p-2 rounded-lg hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-5 h-5 text-white" />
                                </button>
                                <button
                                    onClick={handleNext}
                                    disabled={currentIndex === announcements.length - 1}
                                    className="p-2 rounded-lg hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight className="w-5 h-5 text-white" />
                                </button>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {announcements.length > 1 && (
                            <button
                                onClick={handleDismissAll}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                Tutup Semua
                            </button>
                        )}
                        <button
                            onClick={handleDismiss}
                            className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium transition-colors"
                        >
                            OK, Mengerti
                        </button>
                    </div>
                </div>

                {/* Pagination dots */}
                {announcements.length > 1 && (
                    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1">
                        {announcements.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentIndex(i)}
                                className={`w-2 h-2 rounded-full transition-all ${i === currentIndex ? 'bg-white w-4' : 'bg-white/40 hover:bg-white/60'
                                    }`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
