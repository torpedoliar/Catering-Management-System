import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { api } from '../../contexts/AuthContext';
import { formatDateTimeShortWIB } from '../../utils/timezone';
import toast from 'react-hot-toast';
import {
    FileText,
    Plus,
    Trash2,
    Edit2,
    Send,
    Loader2,
    RefreshCw,
    X,
    Clock,
    CheckCircle
} from 'lucide-react';

interface Announcement {
    id: string;
    title: string;
    content: string;
    priority: string;
    isActive: boolean;
    expiresAt: string | null;
    createdAt: string;
    type: string;
    createdBy: {
        name: string;
        externalId: string;
    };
}

export default function UserAgreementPage() {
    const [agreements, setAgreements] = useState<Announcement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [priority, setPriority] = useState('high'); // Default high for agreements
    const [expiresAt, setExpiresAt] = useState('');

    const loadAgreements = useCallback(async () => {
        try {
            const res = await api.get('/api/announcements');
            // Filter strictly for AGREEMENT type
            const allItems: Announcement[] = res.data.announcements || [];
            const userAgreements = allItems.filter(item => item.type === 'AGREEMENT');
            setAgreements(userAgreements);
        } catch (error) {
            toast.error('Gagal memuat User Agreement');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAgreements();
    }, [loadAgreements]);

    const resetForm = () => {
        setTitle('Kebijakan Penggunaan Sistem'); // Default title
        setContent('');
        setPriority('high');
        setExpiresAt('');
        setEditingId(null);
        setShowForm(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!title.trim() || !content.trim()) {
            toast.error('Judul dan isi agreement wajib diisi');
            return;
        }

        setIsSending(true);
        try {
            const payload = {
                title,
                content,
                priority,
                type: 'AGREEMENT', // Force type
                expiresAt: expiresAt || null
            };

            if (editingId) {
                await api.put(`/api/announcements/${editingId}`, payload);
                toast.success('Agreement berhasil diperbarui');
            } else {
                await api.post('/api/announcements', payload);
                toast.success('Agreement berhasil dibuat');
            }
            resetForm();
            loadAgreements();
        } catch (error) {
            toast.error('Gagal menyimpan agreement');
        } finally {
            setIsSending(false);
        }
    };

    const handleEdit = (agreement: Announcement) => {
        setTitle(agreement.title);
        setContent(agreement.content);
        setPriority(agreement.priority);
        setExpiresAt(agreement.expiresAt ? format(new Date(agreement.expiresAt), 'yyyy-MM-dd\'T\'HH:mm') : '');
        setEditingId(agreement.id);
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Yakin ingin menghapus agreement ini?')) return;

        try {
            await api.delete(`/api/announcements/${id}`);
            toast.success('Agreement berhasil dihapus');
            loadAgreements();
        } catch (error) {
            toast.error('Gagal menghapus agreement');
        }
    };

    const handleToggleActive = async (id: string, currentActive: boolean) => {
        try {
            await api.put(`/api/announcements/${id}`, { isActive: !currentActive });
            toast.success(currentActive ? 'Agreement dinonaktifkan' : 'Agreement diaktifkan');
            loadAgreements();
        } catch (error) {
            toast.error('Gagal mengubah status agreement');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-primary-500 mx-auto" />
                    <p className="text-white/50 mt-4">Memuat data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-glow">
                        <FileText className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-title-1 text-white">User Agreement</h1>
                        <p className="text-white/50">Kelola kebijakan dan persetujuan pengguna</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={loadAgreements} className="btn-secondary flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                    <button
                        onClick={() => { resetForm(); setShowForm(true); }}
                        className="btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Buat Agreement
                    </button>
                </div>
            </div>

            {/* Create/Edit Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-lg mx-4 bg-slate-800 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <h3 className="text-lg font-bold text-white">
                                {editingId ? 'Edit Agreement' : 'Buat Agreement Baru'}
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
                                <label className="block text-sm font-medium text-white/70 mb-2">Judul Kebijakan</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Contoh: Kebijakan Penggunaan Sistem"
                                    className="input-field"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-white/70 mb-2">Isi Kebijakan</label>
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="Tuliskan detail kebijakan di sini..."
                                    rows={6}
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

                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                                <p className="text-xs text-blue-200">
                                    <CheckCircle className="w-3 h-3 inline mr-1" />
                                    User akan diminta menyetujui agreement ini saat login berikutnya atau saat mengganti password.
                                </p>
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
                                    {editingId ? 'Simpan' : 'Terbitkan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Agreement List */}
            <div className="space-y-4">
                {agreements.length === 0 ? (
                    <div className="glass-card rounded-2xl p-12 text-center">
                        <FileText className="w-16 h-16 text-white/20 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-white mb-2">Belum Ada Agreement</h3>
                        <p className="text-white/50 mb-6">Buat kebijakan pertama untuk ditampilkan kepada user</p>
                        <button
                            onClick={() => setShowForm(true)}
                            className="btn-primary inline-flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Buat Agreement
                        </button>
                    </div>
                ) : (
                    agreements.map((agreement) => (
                        <div
                            key={agreement.id}
                            className={`glass-card rounded-2xl p-5 border transition-all ${agreement.isActive
                                ? 'border-purple-500/30 hover:border-purple-500/50'
                                : 'border-white/5 opacity-60'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                            AGREEMENT
                                        </span>
                                        {!agreement.isActive && (
                                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">
                                                Nonaktif
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="text-lg font-semibold text-white mb-2">{agreement.title}</h4>
                                    <p className="text-white/70 text-sm whitespace-pre-wrap mb-3 line-clamp-2">{agreement.content}</p>

                                    <div className="flex items-center gap-4 text-xs text-white/50">
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            <span>{formatDateTimeShortWIB(agreement.createdAt)}</span>
                                        </div>
                                        <span>oleh {agreement.createdBy.name}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleToggleActive(agreement.id, agreement.isActive)}
                                        className={`p-2 rounded-lg transition-colors ${agreement.isActive
                                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                            : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                                            }`}
                                        title={agreement.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleEdit(agreement)}
                                        className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                                        title="Edit"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(agreement.id)}
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
