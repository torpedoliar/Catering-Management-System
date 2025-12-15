import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { api } from '../../contexts/AuthContext';
import { formatDateTimeShortWIB } from '../../utils/timezone';
import { useSSERefresh, ANNOUNCEMENT_EVENTS } from '../../contexts/SSEContext';
import toast from 'react-hot-toast';
import {
    Bell,
    Plus,
    Trash2,
    Edit2,
    Send,
    Loader2,
    AlertCircle,
    AlertTriangle,
    Info,
    RefreshCw,
    X,
    Calendar,
    Clock
} from 'lucide-react';

interface Announcement {
    id: string;
    title: string;
    content: string;
    priority: string;
    isActive: boolean;
    expiresAt: string | null;
    createdAt: string;
    createdBy: {
        name: string;
        externalId: string;
    };
}

export default function AnnouncementPage() {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [priority, setPriority] = useState('normal');
    const [expiresAt, setExpiresAt] = useState('');

    const loadAnnouncements = useCallback(async () => {
        try {
            const res = await api.get('/api/announcements');
            setAnnouncements(res.data.announcements || []);
        } catch (error) {
            toast.error('Gagal memuat pengumuman');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAnnouncements();
    }, [loadAnnouncements]);

    // SSE auto-refresh
    useSSERefresh(ANNOUNCEMENT_EVENTS, loadAnnouncements);

    const resetForm = () => {
        setTitle('');
        setContent('');
        setPriority('normal');
        setExpiresAt('');
        setEditingId(null);
        setShowForm(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!title.trim() || !content.trim()) {
            toast.error('Judul dan isi pengumuman wajib diisi');
            return;
        }

        setIsSending(true);
        try {
            if (editingId) {
                await api.put(`/api/announcements/${editingId}`, {
                    title,
                    content,
                    priority,
                    expiresAt: expiresAt || null
                });
                toast.success('Pengumuman berhasil diupdate');
            } else {
                await api.post('/api/announcements', {
                    title,
                    content,
                    priority,
                    expiresAt: expiresAt || null
                });
                toast.success('Pengumuman berhasil dikirim ke semua user');
            }
            resetForm();
            loadAnnouncements();
        } catch (error) {
            toast.error('Gagal menyimpan pengumuman');
        } finally {
            setIsSending(false);
        }
    };

    const handleEdit = (announcement: Announcement) => {
        setTitle(announcement.title);
        setContent(announcement.content);
        setPriority(announcement.priority);
        setExpiresAt(announcement.expiresAt ? format(new Date(announcement.expiresAt), 'yyyy-MM-dd\'T\'HH:mm') : '');
        setEditingId(announcement.id);
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Yakin ingin menghapus pengumuman ini?')) return;

        try {
            await api.delete(`/api/announcements/${id}`);
            toast.success('Pengumuman berhasil dihapus');
            loadAnnouncements();
        } catch (error) {
            toast.error('Gagal menghapus pengumuman');
        }
    };

    const handleToggleActive = async (id: string, currentActive: boolean) => {
        try {
            await api.put(`/api/announcements/${id}`, { isActive: !currentActive });
            toast.success(currentActive ? 'Pengumuman dinonaktifkan' : 'Pengumuman diaktifkan');
            loadAnnouncements();
        } catch (error) {
            toast.error('Gagal mengubah status pengumuman');
        }
    };

    const getPriorityIcon = (priority: string) => {
        switch (priority) {
            case 'urgent': return <AlertCircle className="w-4 h-4 text-red-400" />;
            case 'high': return <AlertTriangle className="w-4 h-4 text-orange-400" />;
            case 'normal': return <Bell className="w-4 h-4 text-blue-400" />;
            default: return <Info className="w-4 h-4 text-gray-400" />;
        }
    };

    const getPriorityBadge = (priority: string) => {
        switch (priority) {
            case 'urgent': return 'bg-red-500/20 text-red-400 border-red-500/30';
            case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
            case 'normal': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-primary-500 mx-auto" />
                    <p className="text-white/50 mt-4">Memuat pengumuman...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-glow">
                        <Bell className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-title-1 text-white">Pengumuman</h1>
                        <p className="text-white/50">Broadcast pesan ke semua pengguna</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={loadAnnouncements} className="btn-secondary flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                    <button
                        onClick={() => { resetForm(); setShowForm(true); }}
                        className="btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Buat Pengumuman
                    </button>
                </div>
            </div>

            {/* Create/Edit Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-lg mx-4 bg-slate-800 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <h3 className="text-lg font-bold text-white">
                                {editingId ? 'Edit Pengumuman' : 'Buat Pengumuman Baru'}
                            </h3>
                            <button
                                onClick={resetForm}
                                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5 text-white/60" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-white/70 mb-2">Judul</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Masukkan judul pengumuman..."
                                    className="input-field"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-white/70 mb-2">Isi Pengumuman</label>
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="Tuliskan isi pengumuman..."
                                    rows={4}
                                    className="input-field resize-none"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-2">Prioritas</label>
                                    <select
                                        value={priority}
                                        onChange={(e) => setPriority(e.target.value)}
                                        className="input-field"
                                    >
                                        <option value="low">Rendah</option>
                                        <option value="normal">Normal</option>
                                        <option value="high">Tinggi</option>
                                        <option value="urgent">Penting!</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-2">
                                        Kadaluarsa (Opsional)
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={expiresAt}
                                        onChange={(e) => setExpiresAt(e.target.value)}
                                        className="input-field"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="flex-1 btn-secondary"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSending}
                                    className="flex-1 btn-primary flex items-center justify-center gap-2"
                                >
                                    {isSending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4" />
                                    )}
                                    {editingId ? 'Simpan' : 'Kirim'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Announcements List */}
            <div className="space-y-4">
                {announcements.length === 0 ? (
                    <div className="glass-card rounded-2xl p-12 text-center">
                        <Bell className="w-16 h-16 text-white/20 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-white mb-2">Belum Ada Pengumuman</h3>
                        <p className="text-white/50 mb-6">Klik tombol "Buat Pengumuman" untuk mengirim pesan ke semua pengguna</p>
                        <button
                            onClick={() => setShowForm(true)}
                            className="btn-primary inline-flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Buat Pengumuman Pertama
                        </button>
                    </div>
                ) : (
                    announcements.map((announcement) => (
                        <div
                            key={announcement.id}
                            className={`glass-card rounded-2xl p-5 border transition-all ${announcement.isActive
                                ? 'border-white/10 hover:border-primary-500/30'
                                : 'border-white/5 opacity-60'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        {getPriorityIcon(announcement.priority)}
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getPriorityBadge(announcement.priority)}`}>
                                            {announcement.priority === 'urgent' ? 'PENTING' :
                                                announcement.priority === 'high' ? 'Prioritas Tinggi' :
                                                    announcement.priority === 'normal' ? 'Normal' : 'Rendah'}
                                        </span>
                                        {!announcement.isActive && (
                                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">
                                                Nonaktif
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="text-lg font-semibold text-white mb-2">{announcement.title}</h4>
                                    <p className="text-white/70 text-sm whitespace-pre-wrap mb-3">{announcement.content}</p>

                                    <div className="flex items-center gap-4 text-xs text-white/50">
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            <span>{formatDateTimeShortWIB(announcement.createdAt)}</span>
                                        </div>
                                        <span>oleh {announcement.createdBy.name}</span>
                                        {announcement.expiresAt && (
                                            <div className="flex items-center gap-1 text-amber-400">
                                                <Calendar className="w-3 h-3" />
                                                <span>Berakhir: {formatDateTimeShortWIB(announcement.expiresAt)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleToggleActive(announcement.id, announcement.isActive)}
                                        className={`p-2 rounded-lg transition-colors ${announcement.isActive
                                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                            : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                                            }`}
                                        title={announcement.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                    >
                                        <Bell className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleEdit(announcement)}
                                        className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                                        title="Edit"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(announcement.id)}
                                        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                                        title="Hapus"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
