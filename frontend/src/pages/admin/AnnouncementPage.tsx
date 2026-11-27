import { useState, useEffect, useCallback } from 'react';
import { Bell, Plus, Trash2, Edit2, Send, RefreshCw, Calendar, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { formatDateTimeShortWIB } from '../../utils/timezone';
import { useSSERefresh, ANNOUNCEMENT_EVENTS } from '../../contexts/SSEContext';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    Modal,
    Field,
    Input,
    Select,
    Textarea,
    EmptyState,
    Skeleton,
} from '../../components/ui';

interface Announcement {
    id: string;
    title: string;
    content: string;
    priority: string;
    isActive: boolean;
    expiresAt: string | null;
    createdAt: string;
    type?: string;
    createdBy: {
        name: string;
        externalId: string;
    };
}

function getPriorityMeta(priority: string): { label: string; variant: 'danger' | 'warning' | 'info' | 'neutral' } {
    if (priority === 'urgent') return { label: 'Penting!', variant: 'danger' };
    if (priority === 'high') return { label: 'Prioritas tinggi', variant: 'warning' };
    if (priority === 'normal') return { label: 'Normal', variant: 'info' };
    return { label: 'Rendah', variant: 'neutral' };
}

export default function AnnouncementPage() {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [priority, setPriority] = useState('normal');
    const [expiresAt, setExpiresAt] = useState('');

    const loadAnnouncements = useCallback(async () => {
        try {
            const res = await api.get('/api/announcements');
            const allItems: Announcement[] = res.data.announcements || [];
            setAnnouncements(allItems.filter((item) => item.type !== 'AGREEMENT'));
        } catch {
            toast.error('Gagal memuat pengumuman');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAnnouncements();
    }, [loadAnnouncements]);

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
                    type: 'ANNOUNCEMENT',
                    expiresAt: expiresAt || null,
                });
                toast.success('Pengumuman diperbarui');
            } else {
                await api.post('/api/announcements', {
                    title,
                    content,
                    priority,
                    type: 'ANNOUNCEMENT',
                    expiresAt: expiresAt || null,
                });
                toast.success('Pengumuman dikirim ke semua pengguna');
            }
            resetForm();
            loadAnnouncements();
        } catch {
            toast.error('Gagal menyimpan pengumuman');
        } finally {
            setIsSending(false);
        }
    };

    const handleEdit = (announcement: Announcement) => {
        setTitle(announcement.title);
        setContent(announcement.content);
        setPriority(announcement.priority);
        setExpiresAt(announcement.expiresAt ? announcement.expiresAt.slice(0, 16) : '');
        setEditingId(announcement.id);
        setShowForm(true);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await api.delete(`/api/announcements/${deleteTarget.id}`);
            toast.success('Pengumuman dihapus');
            setDeleteTarget(null);
            loadAnnouncements();
        } catch {
            toast.error('Gagal menghapus pengumuman');
        }
    };

    const handleToggleActive = async (id: string, currentActive: boolean) => {
        try {
            await api.put(`/api/announcements/${id}`, { isActive: !currentActive });
            toast.success(currentActive ? 'Pengumuman dinonaktifkan' : 'Pengumuman diaktifkan');
            loadAnnouncements();
        } catch {
            toast.error('Gagal mengubah status pengumuman');
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-56" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Pengumuman"
                subtitle="Siarkan pemberitahuan penting ke seluruh pengguna"
                actions={
                    <>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={loadAnnouncements}
                            leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Muat ulang
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                                resetForm();
                                setShowForm(true);
                            }}
                            leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Buat pengumuman
                        </Button>
                    </>
                }
            />

            {announcements.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<Bell className="w-6 h-6" />}
                        title="Belum ada pengumuman"
                        description='Klik "Buat pengumuman" untuk menyiarkan info ke pengguna.'
                        action={
                            <Button
                                variant="primary"
                                onClick={() => {
                                    resetForm();
                                    setShowForm(true);
                                }}
                            >
                                Buat pengumuman pertama
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <div className="space-y-3">
                    {announcements.map((a) => {
                        const prio = getPriorityMeta(a.priority);
                        return (
                            <Card key={a.id} className={!a.isActive ? 'opacity-65' : ''}>
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                    <div className="flex-1 space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant={prio.variant}>{prio.label}</Badge>
                                            <Badge variant={a.isActive ? 'success' : 'neutral'} dot={a.isActive}>
                                                {a.isActive ? 'Aktif' : 'Nonaktif'}
                                            </Badge>
                                        </div>
                                        <h3 className="text-[15px] font-bold text-[#1c1917]">{a.title}</h3>
                                        <p className="text-[13.5px] text-[#57534e] whitespace-pre-wrap leading-relaxed">
                                            {a.content}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#78716c] pt-1">
                                            <span className="inline-flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                                {formatDateTimeShortWIB(a.createdAt)}
                                            </span>
                                            <span>oleh {a.createdBy.name}</span>
                                            {a.expiresAt && (
                                                <span className="inline-flex items-center gap-1 text-[#b45309] font-medium">
                                                    <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                                                    Berakhir: {formatDateTimeShortWIB(a.expiresAt)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleToggleActive(a.id, a.isActive)}
                                        >
                                            {a.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEdit(a)}
                                            aria-label={`Edit ${a.title}`}
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setDeleteTarget(a)}
                                            aria-label={`Hapus ${a.title}`}
                                        >
                                            <Trash2 className="w-3.5 h-3.5 text-[#b91c1c]" />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Create / Edit Modal */}
            <Modal
                open={showForm}
                onClose={resetForm}
                title={editingId ? 'Edit pengumuman' : 'Buat pengumuman baru'}
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={resetForm}>
                            Batal
                        </Button>
                        <Button
                            variant="primary"
                            loading={isSending}
                            onClick={handleSubmit}
                            leftIcon={<Send className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            {editingId ? 'Simpan' : 'Kirim pengumuman'}
                        </Button>
                    </>
                }
            >
                <form onSubmit={handleSubmit} className="space-y-3">
                    <Field label="Judul" required>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Masukkan judul pengumuman..."
                        />
                    </Field>
                    <Field label="Isi pengumuman" required>
                        <Textarea
                            rows={4}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Tuliskan detail pengumuman..."
                        />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Prioritas">
                            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                                <option value="low">Rendah</option>
                                <option value="normal">Normal</option>
                                <option value="high">Prioritas tinggi</option>
                                <option value="urgent">Penting!</option>
                            </Select>
                        </Field>
                        <Field label="Kadaluarsa" hint="Opsional">
                            <Input
                                type="datetime-local"
                                value={expiresAt}
                                onChange={(e) => setExpiresAt(e.target.value)}
                            />
                        </Field>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirm Modal */}
            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Hapus pengumuman?"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                            Batal
                        </Button>
                        <Button variant="danger" onClick={confirmDelete}>
                            Hapus
                        </Button>
                    </>
                }
            >
                <p className="text-[13.5px] text-[#57534e]">
                    Hapus pengumuman <b>{deleteTarget?.title}</b>?
                </p>
            </Modal>
        </div>
    );
}
